-- My Giving phone sign-in (Better Auth phone-number plugin).
-- Applied automatically at boot by ensureSchema() in server/db.ts; kept here for reference.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phoneNumberVerified" BOOLEAN;
CREATE UNIQUE INDEX IF NOT EXISTS user_phone_number_key ON "user" ("phoneNumber");
