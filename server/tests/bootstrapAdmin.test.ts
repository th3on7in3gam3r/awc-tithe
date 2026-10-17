/**
 * BOOTSTRAP_ADMIN_EMAIL creates a single-use admin invite only while no admin
 * exists, and the invited email becomes eligible for a staff sign-in code.
 *
 * Run: npx tsx server/tests/bootstrapAdmin.test.ts
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'test-only-secret-not-used-in-production-000';

async function main() {
  const { maybeBootstrapAdminInvite } = await import('../auth/bootstrapAdmin');
  const { emailEligibleForStaffOtp, __resetStaffRoleMemoryForTests } = await import('../auth/staffRoles');
  __resetStaffRoleMemoryForTests();
  let failed = 0;
  const check = (name: string, ok: boolean) => {
    console.log(`${ok ? 'OK ' : 'FAIL'} ${name}`);
    if (!ok) failed++;
  };
  const lines: string[] = [];
  const log = (l: string) => lines.push(l);

  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
  check('no variable: nothing happens', (await maybeBootstrapAdminInvite(log)) === 'skipped');

  process.env.BOOTSTRAP_ADMIN_EMAIL = 'not-an-email';
  check('invalid email is ignored', (await maybeBootstrapAdminInvite(log)) === 'invalid-email');

  process.env.BOOTSTRAP_ADMIN_EMAIL = '  Pastor@Example.org ';
  check('ineligible before invite', !(await emailEligibleForStaffOtp('pastor@example.org')));
  check('creates an invite when no admin exists', (await maybeBootstrapAdminInvite(log)) === 'invited');
  check('invite link is logged', lines.some((l) => l.includes('?staffInvite=')));
  check('invited email can now receive a staff code', await emailEligibleForStaffOtp('pastor@example.org'));
  check('other emails still cannot', !(await emailEligibleForStaffOtp('someone@example.org')));

  if (failed) process.exit(1);
  console.log('Bootstrap admin checks passed.');
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
