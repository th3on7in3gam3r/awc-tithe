import { Resend } from 'resend';
import { env, isProduction } from '../config';

export async function sendStaffInviteEmail(input: {
  email: string;
  role: 'admin' | 'staff';
  inviteUrl: string;
  expiresAt: string;
}): Promise<void> {
  const to = input.email.trim().toLowerCase();
  if (!env.resendApiKey) {
    if (isProduction()) throw new Error('RESEND_API_KEY is required to send staff invites.');
    console.info(`[email] staff invite (${input.role}) for ${to}: ${input.inviteUrl}`);
    return;
  }

  const expires = new Date(input.expiresAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
  const resend = new Resend(env.resendApiKey);
  const { error } = await resend.emails.send({
    from: env.receiptFromEmail || env.churchSupportEmail,
    to,
    subject: 'You are invited to the AWC Tithe Staff Portal',
    html: `<p>You have been invited to the AWC Tithe Staff Portal as ${input.role}.</p>
<p><a href="${input.inviteUrl}">Accept your staff invitation</a></p>
<p>This single-use invitation expires ${expires} UTC. Sign in with this email address to accept it.</p>`,
  });
  if (error) throw new Error(`Could not send staff invitation: ${error.message}`);
}
