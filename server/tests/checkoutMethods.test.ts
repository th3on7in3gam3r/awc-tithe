/**
 * Checkout must show only the method the donor picked on the Give page,
 * and never offer buy-now-pay-later (Klarna, Affirm, Afterpay) for tithes.
 *
 * Run: npx tsx server/tests/checkoutMethods.test.ts
 */
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'test-only-secret-not-used-in-production-000';
process.env.DEV_MEMORY_STORE = process.env.DEV_MEMORY_STORE || 'true';

async function main() {
  const { env } = await import('../config');
  const { checkoutMethodTypes } = await import('../routes/stripe');
  let failed = 0;
  const check = (name: string, ok: boolean) => {
    console.log(`${ok ? 'OK ' : 'FAIL'} ${name}`);
    if (!ok) failed++;
  };
  const same = (a: string[] | null, b: string[]) => JSON.stringify(a) === JSON.stringify(b);
  const bnpl = ['klarna', 'affirm', 'afterpay_clearpay'];

  (env as { stripeCashAppPay: boolean }).stripeCashAppPay = true;
  check('Cash App tile → only Cash App Pay', same(checkoutMethodTypes('cashapp'), ['cashapp']));
  check('Card tile → card + Link only', same(checkoutMethodTypes('card'), ['card', 'link']));
  check('Bank tile → bank only', same(checkoutMethodTypes('us_bank_account'), ['us_bank_account']));
  const fallback = checkoutMethodTypes('') || [];
  check('No tile → card, Link, bank, Cash App', same(fallback, ['card', 'link', 'us_bank_account', 'cashapp']));
  for (const m of ['', 'card', 'cashapp', 'us_bank_account', 'klarna']) {
    check(`never pay-later for "${m}"`, !(checkoutMethodTypes(m) || []).some((t) => bnpl.includes(t)));
  }

  (env as { stripeCashAppPay: boolean }).stripeCashAppPay = false;
  check('Cash App off → Cash App tile refused', checkoutMethodTypes('cashapp') === null);
  check('Cash App off → fallback has no Cash App', !(checkoutMethodTypes('') || []).includes('cashapp'));

  if (failed) {
    console.error(`${failed} checkout method check(s) failed.`);
    process.exit(1);
  }
  console.log('Checkout method checks passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
