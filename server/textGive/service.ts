/**
 * What happens when someone texts the giving number with an amount.
 *
 *   "50" / "$50" / "give 50" / "1,200.00"
 *     new number   → texts a one-time setup link (amount filled in)
 *     set up       → charges the saved card right away (Tithes & Offerings),
 *                    unless it's over the instant limit or the daily count —
 *                    then it asks for YES
 *   OK / YES → charges the gift waiting for confirmation
 *   CHANGE   → link to save a different card (no charge)
 *   UNLINK   → stops text giving for this number (card stays with Stripe)
 *
 * Words without a number (GIVE, HELP, …) are handled by the giving-link reply.
 */
import * as store from './store';

export type TextGiveCommand =
  | { kind: 'amount'; cents: number }
  | { kind: 'yes' }
  | { kind: 'change' }
  | { kind: 'unlink' };

const AMOUNT_WORDS = /^(?:give|tithe|offering|donate|giving|gift)?\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars?|usd)?$/i;

/** Reads a text-giving command, or null if the text is something else. */
export function parseTextGive(body: unknown): TextGiveCommand | null {
  const text = String(body ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const upper = text.toUpperCase().replace(/[^A-Z]/g, '');
  // OK is what we ask for (Twilio treats YES as an opt-in word and may auto-reply too).
  if (upper === 'OK' || upper === 'OKAY' || upper === 'YES' || upper === 'Y') return { kind: 'yes' };
  if (upper === 'CHANGE' || upper === 'CHANGECARD' || upper === 'NEWCARD') return { kind: 'change' };
  if (upper === 'UNLINK' || upper === 'REMOVECARD') return { kind: 'unlink' };
  const m = text.replace(/!+$/, '').replace(/\.$/, '').match(AMOUNT_WORDS);
  if (!m) return null;
  const dollars = Number(m[1].replace(/,/g, ''));
  const cents = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  if (!Number.isFinite(dollars)) return null;
  return { kind: 'amount', cents: dollars * 100 + cents };
}

export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cardLabel(g: store.TextGiver): string {
  const brand = g.cardBrand ? g.cardBrand.charAt(0).toUpperCase() + g.cardBrand.slice(1) : 'Card';
  return g.cardLast4 ? `${brand} ••${g.cardLast4}` : brand;
}

export type ChargeResult =
  | { ok: true; paymentIntentId: string; principalCents: number; feeCents: number }
  | { ok: false; reason: 'needs_card' | 'error' };

export type TextGiveDeps = {
  churchName: string;
  fundName: string;
  /** Setup page, e.g. https://awc-tithe.onrender.com/text-give */
  setupUrl: string;
  minCents: number;
  /** Charged without a YES up to this amount (Pastor: $2,000). */
  instantMaxCents: number;
  /** Largest gift accepted by text at all. */
  maxCents: number;
  /** Instant gifts per number per 24h before a YES is required. */
  instantPerDay: number;
  charge: (giver: store.TextGiver, principalCents: number, idempotencyKey: string) => Promise<ChargeResult>;
  now?: () => number;
};

const STOP = ' Reply STOP to opt out.';

async function setupLinkReply(phone: string, amountCents: number, deps: TextGiveDeps, intro: string): Promise<string> {
  const now = deps.now?.() ?? Date.now();
  if ((await store.countRecentLinks(phone, now)) >= 3) {
    return `We've sent several links recently. Please use the latest one, or try again in an hour.${STOP}`;
  }
  const { token } = await store.createLink(phone, amountCents, now);
  return `${intro} ${deps.setupUrl}?t=${token} (link works for 30 minutes)${STOP}`;
}

async function chargeAndReply(
  giver: store.TextGiver,
  cents: number,
  idempotencyKey: string,
  deps: TextGiveDeps
): Promise<string> {
  const result = await deps.charge(giver, cents, idempotencyKey);
  if (!result.ok) {
    if (result.reason === 'needs_card') {
      return setupLinkReply(
        giver.phone,
        cents,
        deps,
        `Your ${cardLabel(giver)} couldn't be charged for ${money(cents)}. Nothing was taken. Finish your gift here:`
      );
    }
    return `Sorry, we couldn't process your ${money(cents)} gift right now. Nothing was taken. Please try again in a few minutes.${STOP}`;
  }
  await store.recordCharge(giver.phone, cents, result.paymentIntentId, deps.now?.() ?? Date.now());
  const total = result.feeCents
    ? `${money(result.principalCents)} + ${money(result.feeCents)} card fee`
    : money(result.principalCents);
  const receipt = giver.donorEmail ? ' A receipt is on its way to your email.' : '';
  return `Thank you! ${total} given to ${deps.fundName} at ${deps.churchName} (${cardLabel(giver)}).${receipt}${STOP}`;
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
    return setupLinkReply(phone, 0, deps, 'Save a different card for text giving here:');
  }

  if (cmd.kind === 'yes') {
    const pending = await store.takePending(phone, now);
    if (!pending || !giver) {
      return `No gift is waiting to be confirmed. Text an amount (like 50) to give.${STOP}`;
    }
    return chargeAndReply(giver, pending.amountCents, `textgive-${messageSid}`, deps);
  }

  const cents = cmd.cents;
  if (cents < deps.minCents) return `The smallest gift by text is ${money(deps.minCents)}.${STOP}`;
  if (cents > deps.maxCents) {
    return `For gifts over ${money(deps.maxCents)}, please give at ${deps.setupUrl.replace(/\/text-give$/, '')} or contact the church office.${STOP}`;
  }

  if (!giver) {
    return setupLinkReply(
      phone,
      cents,
      deps,
      `Thank you! To give ${money(cents)} to ${deps.churchName}, add your card once here. After that, just text an amount to give.`
    );
  }

  const overLimit = cents > deps.instantMaxCents;
  const manyToday = (await store.countChargesToday(phone, now)) >= deps.instantPerDay;
  if (overLimit || manyToday) {
    await store.setPending(phone, cents, now);
    return `To give ${money(cents)} to ${deps.fundName} with ${cardLabel(giver)}, reply OK within 10 minutes.${STOP}`;
  }

  return chargeAndReply(giver, cents, `textgive-${messageSid}`, deps);
}
