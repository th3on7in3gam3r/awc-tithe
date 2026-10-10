import { Resend } from 'resend';
import { env, isProduction } from '../config';

/** Resend's sandbox sender — used locally when RECEIPT_FROM_EMAIL is unset or unverified. */
const DEV_FROM = 'AWC Tithe <beth.t@example.com>';

function fromAddress(): string {
  if (env.receiptFromEmail) return env.receiptFromEmail;
  if (!isProduction()) return DEV_FROM;
  return env.churchSupportEmail;
}

export async function sendDonorCode(email: string, code: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!env.resendApiKey) {
    if (isProduction()) throw new Error('RESEND_API_KEY is required to send sign-in codes.');
    console.info(`[email] sign-in code for ${normalized}: ${code}`);
    return;
  }

  const html = `<p>Your sign-in code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:0.25em">${code}</p><p>It expires in 10 minutes. If you did not request it, you can ignore this email.</p>`;
  const resend = new Resend(env.resendApiKey);

  const trySend = async (from: string) =>
    resend.emails.send({
      from,
      to: normalized,
      subject: 'Your AWC Tithe sign-in code',
      html,
    });

  let from = fromAddress();
  let { error } = await trySend(from);
  if (error && !isProduction() && from !== DEV_FROM) {
    console.warn(`[email] Resend rejected ${from}: ${error.message}. Retrying with ${DEV_FROM}.`);
    from = DEV_FROM;
    ({ error } = await trySend(from));
  }

  if (error) {
    if (!isProduction()) {
      console.error(`[email] Resend failed (${error.message}). Local sign-in code for ${normalized}: ${code}`);
      return;
    }
    throw new Error(`Could not send sign-in code: ${error.message}`);
  }
}
