/**
 * What happens when someone texts the giving number with an amount.
 *
 *   "50" / "$50" / "give 50" / "1,200.00"
 *     new number   → texts a one-time setup link (amount filled in)
 *     card / bank  → charges it right away (Tithes & Offerings),
 *                    unless it's over the instant limit or the daily count —
 *                    then it asks for OK
 *     Cash App / Venmo / Zelle → a tap-to-send link with a memo code for Finance
 *   OK / YES → charges the gift waiting for confirmation
 *   CHANGE   → link to pick a different way to give (no charge)
 *   UNLINK   → stops text giving for this number (card stays with Stripe)
 *
 * Words without a number (GIVE, HELP, …) are handled by the giving-link reply.
 */
import * as store from './store';
import type { FundRecord } from '../funds/store';
import { chooseFund, DEFAULT_TEXT_FUND_ID, fundHelpText, fundWords } from './funds';

export type TextGiveCommand =
  | { kind: 'amount'; cents: number; fundText: string }
  | { kind: 'yes' }
  | { kind: 'change' }
  | { kind: 'unlink' };

const AMOUNT_TOKEN = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/** Reads a text-giving command, or null if the text is something else. */
export function parseTextGive(body: unknown): TextGiveCommand | null {
  const text = String(body ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const upper = text.toUpperCase().replace(/[^A-Z]/g, '');
  // OK is what we ask for (Twilio treats YES as an opt-in word and may auto-reply too).
  if (upper === 'OK' || upper === 'OKAY' || upper === 'YES' || upper === 'Y') return { kind: 'yes' };
  if (upper === 'CHANGE' || upper === 'CHANGECARD' || upper === 'NEWCARD') return { kind: 'change' };
  if (upper === 'UNLINK' || upper === 'REMOVECARD') return { kind: 'unlink' };
  // "50", "$50 tithe", "40 marrieds dinner", "tithe 50", "give $1,200.00"
  const tokens = text.replace(/[!?]+$/, '').replace(/\.$/, '').split(' ').filter(Boolean);
  if (tokens.length > 6) return null;
  const amountAt = tokens.map((t) => AMOUNT_TOKEN.test(t)).reduce<number[]>((acc, hit, i) => (hit ? [...acc, i] : acc), []);
  // Exactly one amount, first or right after one word ("tithe 50") — so ordinary
  // sentences with a number in them are never read as a gift.
  if (amountAt.length !== 1 || amountAt[0] > 1) return null;
  const m = tokens[amountAt[0]].match(AMOUNT_TOKEN)!;
  const dollars = Number(m[1].replace(/,/g, ''));
  const cents = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  if (!Number.isFinite(dollars)) return null;
  const fundText = tokens.filter((_, i) => i !== amountAt[0]).join(' ').trim();
  return { kind: 'amount', cents: dollars * 100 + cents, fundText };
}

export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cardLabel(g: store.TextGiver): string {
  if (g.method === 'us_bank_account') return g.cardLast4 ? `bank ••${g.cardLast4}` : 'bank account';
  const brand = g.cardBrand ? g.cardBrand.charAt(0).toUpperCase() + g.cardBrand.slice(1) : 'Card';
  return g.cardLast4 ? `${brand} ••${g.cardLast4}` : brand;
}

export type ChargeResult =
  | { ok: true; paymentIntentId: string; principalCents: number; feeCents: number }
  | { ok: false; reason: 'needs_card' | 'error' };

export type TextGiveDeps = {
  churchName: string;
  /** Active funds, for the word after the amount ("50 tithe", "40 dinner"). */
  listFunds: () => Promise<FundRecord[]>;
  /** Setup page, e.g. https://awc-tithe.onrender.com/text-give */
  setupUrl: string;
  minCents: number;
  /** Charged without a YES up to this amount (Pastor: $2,000). */
  instantMaxCents: number;
  /** Largest gift accepted by text at all. */
  maxCents: number;
  /** Instant gifts per number per 24h before a YES is required. */
  instantPerDay: number;
  charge: (giver: store.TextGiver, principalCents: number, idempotencyKey: string, fund: FundRecord) => Promise<ChargeResult>;
  /** Cash App / Venmo / Zelle: records the gift and returns the tap-to-send reply. */
  p2pReply?: (giver: store.TextGiver, principalCents: number, fund: FundRecord) => Promise<string | null>;
  now?: () => number;
};

const STOP = ' Reply STOP to opt out.';

async function setupLinkReply(
  phone: string,
  amountCents: number,
  deps: TextGiveDeps,
  intro: string,
  fundId = DEFAULT_TEXT_FUND_ID
): Promise<string> {
  const now = deps.now?.() ?? Date.now();
  if ((await store.countRecentLinks(phone, now)) >= 3) {
    return `We've sent several links recently. Please use the latest one, or try again in an hour.${STOP}`;
  }
  const { token } = await store.createLink(phone, amountCents, now, fundId);
  return `${intro} ${deps.setupUrl}?t=${token} (link works for 30 minutes)${STOP}`;
}

async function chargeAndReply(
  giver: store.TextGiver,
  cents: number,
  fund: FundRecord,
  idempotencyKey: string,
  deps: TextGiveDeps
): Promise<string> {
  const result = await deps.charge(giver, cents, idempotencyKey, fund);
  if (!result.ok) {
    if (result.reason === 'needs_card') {
      return setupLinkReply(
        giver.phone,
        cents,
        deps,
        `Your ${cardLabel(giver)} couldn't be charged for ${money(cents)}. Nothing was taken. Finish your gift here:`,
        fund.id
      );
    }
    return `Sorry, we couldn't process your ${money(cents)} gift right now. Nothing was taken. Please try again in a few minutes.${STOP}`;
  }
  await store.recordCharge(giver.phone, cents, result.paymentIntentId, deps.now?.() ?? Date.now());
  const total = result.feeCents
    ? `${money(result.principalCents)} + ${money(result.feeCents)} card fee`
    : money(result.principalCents);
  const receipt = giver.donorEmail ? ' A receipt is on its way to your email.' : '';
  const bank = giver.method === 'us_bank_account' ? ' Bank gifts take 3–5 business days to clear.' : '';
  return `Thank you! ${total} given to ${fund.name} at ${deps.churchName} (${cardLabel(giver)}).${receipt}${bank} Text CHANGE to switch how you give.${STOP}`;
}

/** Reply text for a text-giving command from `phone` (E.164). */
export async function handleTextGive(
  phone: string,
  cmd: TextGiveCommand,
  messageSid: string,
  deps: TextGiveDeps
): Promise<string> {
  const now = deps.now?.() ?? Date.now();
  const giver = await store.getGiver(phone);

  if (cmd.kind === 'unlink') {
    const removed = await store.removeGiver(phone);
    return removed
      ? `Text giving is turned off for this number. Text an amount anytime to set it up again.${STOP}`
      : `This number isn't set up for text giving. Text an amount (like 50) to start.${STOP}`;
  }

  if (cmd.kind === 'change') {
    return setupLinkReply(phone, 0, deps, 'Choose how you want to give by text (card, bank, Cash App, Venmo or Zelle):');
  }

  if (cmd.kind === 'yes') {
    const pending = await store.takePending(phone, now);
    if (!pending || !giver || !store.AUTO_CHARGE_METHODS.includes(giver.method)) {
      return `No gift is waiting to be confirmed. Text an amount (like 50) to give.${STOP}`;
    }
    const funds = await deps.listFunds();
    const fund = funds.find((f) => f.id === pending.fundId && f.active);
    if (!fund) return `That fund is no longer open. Nothing was charged.${STOP}`;
    return chargeAndReply(giver, pending.amountCents, fund, `textgive-${messageSid}`, deps);
  }

  const cents = cmd.cents;
  if (cents < deps.minCents) return `The smallest gift by text is ${money(deps.minCents)}.${STOP}`;
  if (cents > deps.maxCents) {
    return `For gifts over ${money(deps.maxCents)}, please give at ${deps.setupUrl.replace(/\/text-give$/, '')} or contact the church office.${STOP}`;
  }

  // Which fund: the word(s) with the amount. Unknown or unclear → never charged.
  const typed = fundWords(cmd.fundText);
  const choice = chooseFund(typed, await deps.listFunds());
  if (choice.kind !== 'ok') {
    return fundHelpText(String(cents / 100), choice, cmd.fundText) + STOP;
  }
  const fund = choice.fund;

  if (!giver) {
    return setupLinkReply(
      phone,
      cents,
      deps,
      `Thank you! To give ${money(cents)} to ${fund.name}, set up text giving once here. After that, just text an amount to give.`,
      fund.id
    );
  }

  // Cash App / Venmo / Zelle: nothing is charged here — the giver taps Send in their app.
  if (!store.AUTO_CHARGE_METHODS.includes(giver.method)) {
    const reply = deps.p2pReply ? await deps.p2pReply(giver, cents, fund) : null;
    return (
      reply ??
      `Sorry, ${giver.method === 'zelle' ? 'Zelle' : giver.method === 'venmo' ? 'Venmo' : 'Cash App'} giving isn't available right now. Text CHANGE to choose another way to give.${STOP}`
    );
  }

  const overLimit = cents > deps.instantMaxCents;
  const manyToday = (await store.countChargesToday(phone, now)) >= deps.instantPerDay;
  if (overLimit || manyToday) {
    await store.setPending(phone, cents, now, fund.id);
    return `To give ${money(cents)} to ${fund.name} with ${cardLabel(giver)}, reply OK within 10 minutes.${STOP}`;
  }

  return chargeAndReply(giver, cents, fund, `textgive-${messageSid}`, deps);
}
