import os from 'node:os';
import { ensureSchema } from '../db';
import { countActiveAdmins, createStaffInvite } from '../auth/staffRoles';
import { env } from '../config';

const email = process.argv.slice(2).find((arg) => arg.includes('@'));
if (!email) {
  console.error('Usage: npm run create-admin -- email@example.com');
  process.exit(1);
}
if (!env.databaseUrl) {
  console.error('DATABASE_URL is required. This command writes the invite to Neon.');
  process.exit(1);
}

await ensureSchema();
const admins = await countActiveAdmins();
if (admins > 0) {
  console.error('Refusing to create an invite: an active admin already exists.');
  process.exit(1);
}

const invite = await createStaffInvite({
  email,
  role: 'admin',
  invitedBy: `bootstrap:${process.getuid?.() ?? os.userInfo().username}`,
  actorLabel: os.userInfo().username,
  ipAddress: '127.0.0.1',
});
const url = `${env.publicAppUrl.replace(/\/$/, '')}/?staffInvite=${encodeURIComponent(invite.token)}`;
console.log(`Invite for ${email.trim().toLowerCase()} expires ${invite.expiresAt}`);
console.log(url);
