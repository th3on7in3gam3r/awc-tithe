import { createAuthClient } from 'better-auth/client';
import { emailOTPClient, phoneNumberClient, twoFactorClient } from 'better-auth/client/plugins';

/** Better Auth client — cookies go to same origin (/api/auth via Vite proxy). */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [emailOTPClient(), phoneNumberClient()],
});

/** Sign in to My Giving with a texted code (phone already linked to an account). */
export async function signInWithPhoneOtp(phoneE164: string, code: string) {
  return authClient.phoneNumber.verify({ phoneNumber: phoneE164, code: code.trim() });
}

/** Signed-in donor confirms a texted code to add text sign-in to their account. */
export async function linkPhoneWithOtp(phoneE164: string, code: string) {
  return authClient.phoneNumber.verify({
    phoneNumber: phoneE164,
    code: code.trim(),
    updatePhoneNumber: true,
    disableSession: true,
  });
}

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
