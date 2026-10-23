/**
 * Phone ↔ My Giving account lookups (Better Auth "user".phoneNumber).
 * Works with the Postgres adapter and the dev/test memory adapter.
 */
import { auth } from './betterAuth';

type PhoneUser = { id: string; email: string; phoneNumber?: string | null; phoneNumberVerified?: boolean | null };

async function adapter() {
  const ctx = await auth.$context;
  return ctx.adapter;
}

/** The account a verified phone signs in to, or null. */
export async function findUserByPhone(phoneE164: string): Promise<PhoneUser | null> {
  const db = await adapter();
  const user = (await db.findOne({
    model: 'user',
    where: [{ field: 'phoneNumber', value: phoneE164 }],
  })) as PhoneUser | null;
  return user && user.phoneNumberVerified ? user : null;
}

/** True when another account already uses this phone. */
export async function phoneTakenByOther(phoneE164: string, userId: string): Promise<boolean> {
  const db = await adapter();
  const user = (await db.findOne({
    model: 'user',
    where: [{ field: 'phoneNumber', value: phoneE164 }],
  })) as PhoneUser | null;
  return Boolean(user && user.id !== userId);
}

export async function getUserPhone(userId: string): Promise<string | null> {
  const db = await adapter();
  const user = (await db.findOne({ model: 'user', where: [{ field: 'id', value: userId }] })) as PhoneUser | null;
  return user?.phoneNumber && user.phoneNumberVerified ? user.phoneNumber : null;
}

export async function removeUserPhone(userId: string): Promise<void> {
  const db = await adapter();
  await db.update({
    model: 'user',
    where: [{ field: 'id', value: userId }],
    update: { phoneNumber: null, phoneNumberVerified: false },
  });
}
