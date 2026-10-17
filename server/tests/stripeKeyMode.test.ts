/**
 * Live/test detection must treat restricted keys (rk_live_) as live, and
 * catch a live/test mix-up between the secret and publishable keys.
 *
 * Run: npx tsx server/tests/stripeKeyMode.test.ts
 */
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'test-only-secret-not-used-in-production-000';

async function main() {
  const { isLiveStripeKey, stripeKeyModeMismatch } = await import('../config');
  let failed = 0;
  const check = (name: string, ok: boolean) => {
    console.log(`${ok ? 'OK ' : 'FAIL'} ${name}`);
    if (!ok) failed++;
  };
  check('sk_live_ is live', isLiveStripeKey('sk_live_abc'));
  check('rk_live_ (restricted) is live', isLiveStripeKey('rk_live_abc'));
  check('sk_test_ is test', !isLiveStripeKey('sk_test_abc'));
  check('rk_test_ is test', !isLiveStripeKey('rk_test_abc'));
  check('restricted live + pk_live matches', !stripeKeyModeMismatch('rk_live_a', 'pk_live_b'));
  check('test + test matches', !stripeKeyModeMismatch('sk_test_a', 'pk_test_b'));
  check('live secret + test publishable is flagged', stripeKeyModeMismatch('rk_live_a', 'pk_test_b'));
  check('test secret + live publishable is flagged', stripeKeyModeMismatch('sk_test_a', 'pk_live_b'));
  if (failed) process.exit(1);
  console.log('Stripe key mode checks passed.');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
