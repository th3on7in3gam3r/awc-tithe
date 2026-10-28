/**
 * Once a day at 9 AM Eastern, email Finance a list of Zelle / Venmo / Cash App gifts that
 * have waited more than a day to be checked. A day is "claimed" in the database first, so a
 * restart or a second server instance never sends it twice. Nothing is sent when no gift
 * has waited that long.
 */
import { getSql } from '../db';
import { sendPendingGiftsReminder } from '../email/sendPendingGiftsReminder';

const CHECK_EVERY_MS = 15 * 60_000;
export const DAILY_REMINDER_HOUR_ET = 9;
export const DAILY_REMINDER_MIN_AGE_HOURS = 24;

/** Eastern calendar day and hour for a moment in time. Exported for tests. */
export function easternDayAndHour(now: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

async function claimDay(day: string): Promise<boolean> {
  const client = getSql();
  if (!client) return false;
  await client`
    CREATE TABLE IF NOT EXISTS finance_reminder_runs (
      day TEXT PRIMARY KEY,
      ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      gifts INTEGER NOT NULL DEFAULT 0,
      sent_to INTEGER NOT NULL DEFAULT 0
    )
  `;
  const rows = await client`
    INSERT INTO finance_reminder_runs (day) VALUES (${day})
    ON CONFLICT (day) DO NOTHING
    RETURNING day
  `;
  return rows.length > 0;
}

export async function runDailyReminderCheck(now = new Date()): Promise<void> {
  const { day, hour } = easternDayAndHour(now);
  if (hour < DAILY_REMINDER_HOUR_ET) return;
  if (!(await claimDay(day))) return;
  const result = await sendPendingGiftsReminder({ reason: 'daily', minAgeHours: DAILY_REMINDER_MIN_AGE_HOURS });
  const client = getSql();
  if (client) {
    await client`UPDATE finance_reminder_runs SET gifts = ${result.count}, sent_to = ${result.sent} WHERE day = ${day}`;
  }
  if (result.count) console.log(`[pending-reminder] daily: ${result.count} gifts, emailed ${result.sent}`);
}

export function startDailyFinanceReminder(): ReturnType<typeof setInterval> | null {
  if (!getSql()) return null;
  const tick = () =>
    void runDailyReminderCheck().catch((err) =>
      console.warn('[pending-reminder] daily check failed:', err instanceof Error ? err.message : err)
    );
  setTimeout(tick, 30_000);
  return setInterval(tick, CHECK_EVERY_MS);
}
