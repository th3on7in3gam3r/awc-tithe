process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.BETTER_AUTH_SECRET = 'staff-mfa-test-secret-at-least-32-characters';

async function main() {
  const mfa = await import('../auth/staffMfa');
  mfa.__resetStaffMfaForTests();

  const sessionId = 'sess-mfa-1';
  const userId = 'user-mfa-1';
  if (await mfa.isStaffSessionMfaVerified(sessionId)) {
    throw new Error('new session must not be MFA verified');
  }
  await mfa.markStaffSessionMfaVerified(sessionId, userId);
  if (!(await mfa.isStaffSessionMfaVerified(sessionId))) {
    throw new Error('verified session must pass MFA check');
  }

  mfa.__resetStaffMfaForTests();
  let revoked = false;
  for (let i = 1; i <= 5; i += 1) {
    const result = await mfa.recordStaffMfaFailure(sessionId, userId);
    if (i < 5 && result.revoked) throw new Error(`revoked too early on attempt ${i}`);
    if (i === 5) revoked = result.revoked;
  }
  if (!revoked) throw new Error('5 wrong codes must revoke the session');
  if (await mfa.isStaffSessionMfaVerified(sessionId)) {
    throw new Error('revoked session must not remain MFA verified');
  }

  console.log('Staff session MFA verify, failure count, and revoke checks passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
