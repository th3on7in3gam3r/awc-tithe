/**
 * Which fund a text gift goes to — Pastor: "differentiate between the types of
 * giving" (Tithe & Offering, Marrieds Dinner, …).
 *
 *   "50"            → Tithes & Offerings (default)
 *   "50 tithe"      → Tithes & Offerings
 *   "40 dinner"     → Marrieds Dinner 2026 (if it's the only active fund with "dinner")
 *   "40 marrieds"   → Marrieds Dinner 2026
 *
 * Words are matched against the active funds in AWC Tithe (names, ignoring
 * case and a plural "s"), so new funds and event funds work by text with no
 * code change. No match, or more than one, never charges: the reply lists the
 * words to use.
 */
import type { FundRecord } from '../funds/store';

export const DEFAULT_TEXT_FUND_ID = 'fund-tithes';

/** Words that never pick a fund. */
const FILLER = new Set([
  'give', 'giving', 'gift', 'gifts', 'donate', 'donation', 'for', 'to', 'the', 'my', 'a', 'an', 'and', 'of',
  'fund', 'funds', 'dollar', 'dollars', 'usd', 'please', 'pls', 'thanks', 'thank', 'you', 'amp',
  // The church's initials start many fund names ("AWC GRAND FAMILY CELEBRATION 2026" → text "40 GRAND").
  'awc',
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** "Tithes" → "tithe", "Marrieds" → "married" (only a trailing s). */
function stem(w: string): string {
  return w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;
}

export function fundWords(text: string): string[] {
  return words(text).filter((w) => !FILLER.has(w));
}

function wordMatches(userWord: string, fundWord: string): boolean {
  const u = stem(userWord);
  const f = stem(fundWord);
  if (/^\d+$/.test(u)) return u === f;
  return u.length >= 3 && (f.startsWith(u) || (u.startsWith(f) && f.length >= 4));
}

/** Every word the giver typed must match a word in the fund's name. */
export function fundMatches(fund: FundRecord, typed: string[]): boolean {
  const name = words(fund.name);
  return typed.length > 0 && typed.every((t) => name.some((n) => wordMatches(t, n)));
}

/** The word to text for a fund: its first distinctive name word. */
export function fundKeyword(fund: FundRecord): string {
  const w = words(fund.name).find((x) => !FILLER.has(x) && !/^\d+$/.test(x));
  return (w || fund.name.split(' ')[0] || 'fund').toUpperCase();
}

export type FundChoice =
  | { kind: 'ok'; fund: FundRecord }
  | { kind: 'none' | 'many'; options: FundRecord[] };

export function chooseFund(typed: string[], active: FundRecord[]): FundChoice {
  const funds = active.filter((f) => f.active);
  if (typed.length === 0) {
    const def = funds.find((f) => f.id === DEFAULT_TEXT_FUND_ID) || funds[0];
    return def ? { kind: 'ok', fund: def } : { kind: 'none', options: [] };
  }
  const hits = funds.filter((f) => fundMatches(f, typed));
  if (hits.length === 1) return { kind: 'ok', fund: hits[0] };
  // "tithe" also matches a separate "Tithe" fund name exactly — prefer an exact first word.
  if (hits.length > 1) {
    const exact = hits.filter((f) => stem(words(f.name)[0] || '') === stem(typed[0]));
    if (exact.length === 1) return { kind: 'ok', fund: exact[0] };
    return { kind: 'many', options: hits };
  }
  return { kind: 'none', options: funds };
}

/** "Text 50 for Tithes & Offerings, or 50 MARRIEDS for Marrieds Dinner 2026." */
export function fundHelpText(amount: string, choice: FundChoice, typedText: string): string {
  const opts = choice.kind === 'ok' ? [] : choice.options.slice(0, 4);
  const list = opts
    .map((f) => (f.id === DEFAULT_TEXT_FUND_ID ? `${amount} for ${f.name}` : `${amount} ${fundKeyword(f)} for ${f.name}`))
    .join(', ');
  if (choice.kind === 'many') {
    return `"${typedText}" matches more than one fund. Please text ${list}. Nothing was charged.`;
  }
  return opts.length
    ? `We couldn't find a fund called "${typedText}". Text ${list}. Nothing was charged.`
    : `We couldn't find that fund. Nothing was charged.`;
}
