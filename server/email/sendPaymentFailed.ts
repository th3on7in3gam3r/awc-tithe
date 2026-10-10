import { Resend } from 'resend';
import { env, isProduction } from '../config';

export async function sendGiftPaymentFailedEmail(input: {
  donorEmail: string;
  donorName: string;
}): Promise<void> {
  const to = input.donorEmail.trim().toLowerCase();
  if (!to.includes('@')) return;
  const link = `${env.publicAppUrl.replace(/\/$/, '')}/?tab=my-giving`;
  const subject = 'We could not process your gift';
  const html = `<p>Hello ${input.donorName || 'friend'},</p>
<p>A scheduled gift did not go through. No new gift was recorded as completed.</p>
<p>You can update the payment method from <a href="${link}">My Giving</a>.</p>`;

  if (!env.resendApiKey) {
    if (!isProduction()) {
      console.log('[email] payment failed (no RESEND_API_KEY)', to);
    }
    return;
  }

  const resend = new Resend(env.resendApiKey);
  await resend.emails.send({
    from: env.receiptFromEmail,
    to,
    subject,
    html,
  });
}
