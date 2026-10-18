/**
 * Links from AWC Connect and the church website pre-fill only safe choices.
 *
 * Run: npx tsx server/tests/giveLink.test.ts
 */
import { parseGiveLink, stripGiveLink } from '../../src/lib/giveLink';

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) console.log(`OK  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

check('zelle + amount', JSON.stringify(parseGiveLink('?method=zelle&amount=50')) === JSON.stringify({ method: 'zelle', amount: 50 }));
check('bank alias', parseGiveLink('?method=bank').method === 'us_bank_account');
check('cashapp alias is person-to-person Cash App', parseGiveLink('?method=CashApp').method === 'cash_app');
check('unknown method ignored', parseGiveLink('?method=paypal').method === undefined);
check('amount rounded to cents', parseGiveLink('?amount=25.555').amount === 25.56);
check('negative amount ignored', parseGiveLink('?amount=-5').amount === undefined);
check('huge amount ignored', parseGiveLink('?amount=5000000').amount === undefined);
check('text amount ignored', parseGiveLink('?amount=abc').amount === undefined);
check('frequency', parseGiveLink('?frequency=monthly').frequency === 'monthly');
check('bad frequency ignored', parseGiveLink('?frequency=hourly').frequency === undefined);
check('no params → empty', Object.keys(parseGiveLink('')).length === 0);
check('strip keeps other params', stripGiveLink('/', '?method=zelle&from=connect&staffInvite=abc') === '/?staffInvite=abc');
const RSVP = 'rsvp:a1b2c3d4-e5f6-4789-a012-202611221400';
const withRef = parseGiveLink(`?method=card&amount=40&ref=${RSVP}&for=Thanksgiving%202026%20RSVP&frequency=monthly`);
check('rsvp ref kept', withRef.ref === RSVP);
check('rsvp label kept', withRef.refLabel === 'Thanksgiving 2026 RSVP');
check('rsvp ref forces one-time', withRef.frequency === 'one-time');
check('bad ref ignored', parseGiveLink('?ref=donation:123').ref === undefined);
check('ref with script ignored', parseGiveLink('?ref=rsvp:<script>').ref === undefined);
check('label without ref ignored', parseGiveLink('?for=Hello').refLabel === undefined);
check('label strips markup', !/[<>/]/.test(parseGiveLink(`?ref=${RSVP}&for=%3Cb%3EHi%3C%2Fb%3E`).refLabel || ''));
check('fund kept', parseGiveLink('?fund=Special%20Offerings').fund === 'Special Offerings');
check('strip removes ref keys', stripGiveLink('/', `?ref=${RSVP}&for=x&fund=y&staffInvite=abc`) === '/?staffInvite=abc');
check('strip to bare path', stripGiveLink('/', '?amount=5&from=website') === '/');

if (failed > 0) {
  console.error(`\n${failed} give link check(s) failed.`);
  process.exit(1);
}
console.log('\nGive link checks passed.');
