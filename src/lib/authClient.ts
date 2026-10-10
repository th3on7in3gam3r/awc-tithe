import { createAuthClient } from 'better-auth/client';
import { emailOTPClient, twoFactorClient } from 'better-auth/client/plugins';

/** Better Auth client — cookies go to same origin (/api/auth via Vite proxy). */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [emailOTPClient()],
});

export async function signInWithEmailOtp(email: string, otp: string) {
  return authClient.signIn.emailOtp({
    email: email.trim().toLowerCase(),
    otp: otp.trim(),
  });
}

export const staffAuthClient = createAuthClient({
  basePath: '/api/staff-auth',
  plugins: [emailOTPClient(), twoFactorClient()],
});

export async function signOutDonor() {
  try {
    await authClient.signOut();
  } catch {
    // ignore
  }
  try {
    await fetch('/api/donor/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // ignore
  }
}
