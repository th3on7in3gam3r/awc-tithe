import { getSql } from '../db';
import { memoryStoreAllowed } from '../config';

function requireMemoryFunds(): void {
  if (!memoryStoreAllowed()) {
    throw new Error('DATABASE_URL is required unless DEV_MEMORY_STORE=true');
  }
}

export type FundRecord = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
  glCode: string;
  /** Event RSVP fund: paid only from an AWC Vault RSVP link, hidden from the public fund list. */
  isEvent?: boolean;
};

export type GivingGoalProgress = {
  fundId: string;
  fundName: string;
  year: number;
  goalAmount: number | null;
  totalReceived: number;
  percent: number | null;
};

export type OfflineGiftRecord = {
  id: string;
  fundId: string;
  fundName: string;
  amount: number;
  giftDate: string;
  enteredBy: string;
  note: string;
  donorEmail: string;
  donorName: string;
  createdAt: string;
};

const DEFAULT_FUND: FundRecord = {
  id: 'fund-tithes',
  name: 'Tithes & Offerings',
  description: 'General tithes and offerings supporting worship and church ministry.',
  active: true,
  sortOrder: 0,
  glCode: '',
  isEvent: false,
};

const memoryFunds = new Map<string, FundRecord>([[DEFAULT_FUND.id, { ...DEFAULT_FUND }]]);
const memoryGoals = new Map<string, { fundId: string; year: number; goalAmount: number; updatedBy: string }>();
const memoryOfflineGifts: OfflineGiftRecord[] = [];
const memoryCompletedGifts: Array<{ fundId: string; amount: number; year: number; status: string }> = [];

function goalKey(fundId: string, year: number) {
  return `${fundId}:${year}`;
}

export async function seedDefaultFund(): Promise<void> {
  const client = getSql();
  if (!client) {
    requireMemoryFunds();
    if (!memoryFunds.has(DEFAULT_FUND.id)) memoryFunds.set(DEFAULT_FUND.id, { ...DEFAULT_FUND });
    return;
  }
  await client`
    INSERT INTO funds (id, name, description, active, sort_order, gl_code)
    VALUES (
      ${DEFAULT_FUND.id},
      ${DEFAULT_FUND.name},
      ${DEFAULT_FUND.description},
      TRUE,
      ${DEFAULT_FUND.sortOrder},
      ${DEFAULT_FUND.glCode}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

function mapFund(row: Record<string, unknown>): FundRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description || ''),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order ?? 0),
    glCode: String(row.gl_code || row.code || ''),
    isEvent: Boolean(row.is_event),
  };
}

/** Public: active funds only — never includes goals or raised totals. */
export async function listActiveFunds(): Promise<FundRecord[]> {
  const client = getSql();
  if (!client) {
    requireMemoryFunds();
    return Array.from(memoryFunds.values())
      .filter((f) => f.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  const rows = await client`
    SELECT id, name, description, active, sort_order, gl_code, is_event
    FROM funds
    WHERE active = TRUE
    ORDER BY sort_order ASC, name ASC
  `;
  return rows.map((r) => mapFund(r as Record<string, unknown>));
}

/** Admin: all funds. */
export async function listAllFunds(): Promise<FundRecord[]> {
  const client = getSql();
  if (!client) {
    requireMemoryFunds();
    return Array.from(memoryFunds.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
  }
  const rows = await client`
    SELECT id, name, description, active, sort_order, gl_code, is_event
    FROM funds
    ORDER BY sort_order ASC, name ASC
  `;
  return rows.map((r) => mapFund(r as Record<string, unknown>));
}

export async function getFundById(id: string): Promise<FundRecord | null> {
  const client = getSql();
  if (!client) {
    requireMemoryFunds();
    return memoryFunds.get(id) || null;
  }
  const rows = await client`
    SELECT id, name, description, active, sort_order, gl_code, is_event FROM funds WHERE id = ${id} LIMIT 1
  `;
  const row = rows[0];
  return row ? mapFund(row as Record<string, unknown>) : null;
}

export async function createFund(input: {
  name: string;
  description?: string;
  active?: boolean;
  sortOrder?: number;
  glCode?: string;
  isEvent?: boolean;
}): Promise<FundRecord> {
  const id = `fund-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const record: FundRecord = {
    id,
    name: input.name.trim(),
    description: (input.description || '').trim(),
    active: input.active !== false,
    sortOrder: Number(input.sortOrder ?? 0),
    glCode: (input.glCode || '').trim(),
    isEvent: Boolean(input.isEvent),
  };
  const client = getSql();
  if (!client) {
    requireMemoryFunds();
    memoryFunds.set(id, record);
    return record;
  }
  await client`
    INSERT INTO funds (id, name, description, active, sort_order, gl_code, is_event)
    VALUES (${record.id}, ${record.name}, ${record.description}, ${record.active}, ${record.sortOrder}, ${record.glCode}, ${Boolean(record.isEvent)})
  `;
  return record;
}

/** Clean event fund name: one line, 2–60 characters, plain text (same rule as give-link labels). */
export function cleanEventFundName(raw: unknown): string | null {
  const name = String(raw ?? '')
    .replace(/[^\p{L}\p{N} '&.,:()\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return name.length >= 2 ? name : null;
}

/**
 * Make sure an event RSVP fund exists and is active (e.g. "Thanksgiving Dinner 2026").
 * Matches an existing fund by name, ignoring case; creates it otherwise.
 */
export async function ensureEventFund(rawName: unknown): Promise<{ fund: FundRecord; created: boolean } | null> {
  const name = cleanEventFundName(rawName);
  if (!name) return null;
  const all = await listAllFunds();
  const existing = all.find((f) => f.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) {
    if (!existing.isEvent) await markEventFund(existing.id);
    if (existing.active) return { fund: { ...existing, isEvent: true }, created: false };
    const reactivated = await updateFund(existing.id, { active: true });
    return { fund: { ...(reactivated || existing), active: true, isEvent: true }, created: false };
  }
  const fund = await createFund({
    name,
    description: 'Event RSVP payments.',
    sortOrder: 100,
    isEvent: true,
  });
  return { fund, created: true };
}

/** Flag a fund as an event RSVP fund (hidden from the public Give list). */
async function markEventFund(id: string): Promise<void> {
  const client = getSql();
  if (!client) {
    const f = memoryFunds.get(id);
    if (f) memoryFunds.set(id, { ...f, isEvent: true });
    return;
  }
  await client`UPDATE funds SET is_event = TRUE, updated_at = NOW() WHERE id = ${id}`;
}

export async function updateFund(
  id: string,
  patch: Partial<Pick<FundRecord, 'name' | 'description' | 'active' | 'sortOrder' | 'glCode'>>
): Promise<FundRecord | null> {
  const existing = await getFundById(id);
  if (!existing) return null;
  const next: FundRecord = {
    ...existing,
    name: patch.name != null ? patch.name.trim() : existing.name,
    description: patch.description != null ? patch.description.trim() : existing.description,
    active: patch.active != null ? Boolean(patch.active) : existing.active,
    sortOrder: patch.sortOrder != null ? Number(patch.sortOrder) : existing.sortOrder,
    glCode: patch.glCode != null ? patch.glCode.trim() : existing.glCode,
  };
  const client = getSql();
  if (!client) {
    requireMemoryFunds();
    memoryFunds.set(id, next);
    return next;
  }
  await client`
    UPDATE funds SET
      name = ${next.name},
      description = ${next.description},
      active = ${next.active},
      sort_order = ${next.sortOrder},
      gl_code = ${next.glCode},
      updated_at = NOW()
    WHERE id = ${id}
  `;
  return next;
}

export async function setGivingGoal(input: {
  fundId: string;
  year: number;
  goalAmount: number | null;
  updatedBy: string;
}): Promise<void> {
  const client = getSql();
  const key = goalKey(input.fundId, input.year);
  if (!client) {
    requireMemoryFunds();
    if (input.goalAmount == null || input.goalAmount <= 0) {
      memoryGoals.delete(key);
      return;
    }
    memoryGoals.set(key, {
      fundId: input.fundId,
      year: input.year,
      goalAmount: input.goalAmount,
      updatedBy: input.updatedBy,
    });
    return;
  }
  if (input.goalAmount == null || input.goalAmount <= 0) {
    await client`DELETE FROM giving_goals WHERE fund_id = ${input.fundId} AND year = ${input.year}`;
    return;
  }
  await client`
    INSERT INTO giving_goals (fund_id, year, goal_amount, updated_by, updated_at)
    VALUES (${input.fundId}, ${input.year}, ${input.goalAmount}, ${input.updatedBy}, NOW())
    ON CONFLICT (fund_id, year) DO UPDATE SET
      goal_amount = EXCLUDED.goal_amount,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `;
}

/**
 * Admin progress: completed donations (all channels) for the calendar year
 * + offline_gifts rows. Excludes pending/failed/refunded.
 */
export async function listGivingGoalProgress(year: number): Promise<GivingGoalProgress[]> {
  const funds = await listAllFunds();
  const client = getSql();

  const receivedByFund = new Map<string, number>();

  if (!client) {
    requireMemoryFunds();
    for (const g of memoryCompletedGifts) {
      if (g.year === year && g.status === 'completed') {
        receivedByFund.set(g.fundId, (receivedByFund.get(g.fundId) || 0) + g.amount);
      }
    }
    for (const o of memoryOfflineGifts) {
      const y = Number(o.giftDate.slice(0, 4));
      if (y === year) {
        receivedByFund.set(o.fundId, (receivedByFund.get(o.fundId) || 0) + o.amount);
      }
    }
    const out: GivingGoalProgress[] = [];
    for (const f of funds) {
      const goal = memoryGoals.get(goalKey(f.id, year));
      const totalReceived = receivedByFund.get(f.id) || 0;
      const goalAmount = goal?.goalAmount ?? null;
      out.push({
        fundId: f.id,
        fundName: f.name,
        year,
        goalAmount,
        totalReceived,
        percent:
          goalAmount && goalAmount > 0
            ? Math.min(999, Math.round((totalReceived / goalAmount) * 1000) / 10)
            : null,
      });
    }
    return out;
  }

  const donationRows = await client`
    SELECT fund_id, COALESCE(SUM(amount), 0)::float AS total
    FROM donations
    WHERE status = 'completed'
      AND EXTRACT(YEAR FROM contributed_at) = ${year}
    GROUP BY fund_id
  `;
  for (const row of donationRows) {
    receivedByFund.set(String(row.fund_id), Number(row.total) || 0);
  }

  const offlineRows = await client`
    SELECT fund_id, COALESCE(SUM(amount), 0)::float AS total
    FROM offline_gifts
    WHERE EXTRACT(YEAR FROM gift_date) = ${year}
    GROUP BY fund_id
  `;
  for (const row of offlineRows) {
    const id = String(row.fund_id);
    receivedByFund.set(id, (receivedByFund.get(id) || 0) + (Number(row.total) || 0));
  }

  const goalRows = await client`
    SELECT fund_id, goal_amount FROM giving_goals WHERE year = ${year}
  `;
  const goals = new Map<string, number>();
  for (const row of goalRows) {
    goals.set(String(row.fund_id), Number(row.goal_amount) || 0);
  }

  return funds.map((f) => {
    const totalReceived = receivedByFund.get(f.id) || 0;
    const goalAmount = goals.has(f.id) ? goals.get(f.id)! : null;
    return {
      fundId: f.id,
      fundName: f.name,
      year,
      goalAmount,
      totalReceived,
      percent:
        goalAmount != null && goalAmount > 0
          ? Math.min(999, Math.round((totalReceived / goalAmount) * 1000) / 10)
          : null,
    };
  });
}

export async function createOfflineGift(input: {
  fundId: string;
  amount: number;
  giftDate: string;
  enteredBy: string;
  note?: string;
  donorEmail?: string;
  donorName?: string;
}): Promise<OfflineGiftRecord> {
  const id = `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const fund = await getFundById(input.fundId);
  const record: OfflineGiftRecord = {
    id,
    fundId: input.fundId,
    fundName: fund?.name || input.fundId,
    amount: Number(input.amount),
    giftDate: input.giftDate.slice(0, 10),
    enteredBy: input.enteredBy,
    note: (input.note || '').trim(),
    donorEmail: (input.donorEmail || '').trim().toLowerCase(),
    donorName: (input.donorName || '').trim(),
    createdAt: new Date().toISOString(),
  };
  const client = getSql();
  if (!client) {
    requireMemoryFunds();
    memoryOfflineGifts.push(record);
    return record;
  }
  await client`
    INSERT INTO offline_gifts (id, fund_id, amount, gift_date, entered_by, note, donor_email, donor_name)
    VALUES (
      ${record.id},
      ${record.fundId},
      ${record.amount},
      ${record.giftDate}::date,
      ${record.enteredBy},
      ${record.note},
      ${record.donorEmail},
      ${record.donorName}
    )
  `;
  return record;
}

export async function listOfflineGifts(opts?: {
  fundId?: string;
  year?: number;
}): Promise<OfflineGiftRecord[]> {
  const client = getSql();
  if (!client) {
    requireMemoryFunds();
    return memoryOfflineGifts
      .filter((g) => {
        if (opts?.fundId && g.fundId !== opts.fundId) return false;
        if (opts?.year && Number(g.giftDate.slice(0, 4)) !== opts.year) return false;
        return true;
      })
      .slice()
      .sort((a, b) => b.giftDate.localeCompare(a.giftDate));
  }
  if (opts?.fundId && opts?.year) {
    const rows = await client`
      SELECT id, fund_id, amount, gift_date, entered_by, note, donor_email, donor_name, created_at
      FROM offline_gifts
      WHERE fund_id = ${opts.fundId} AND EXTRACT(YEAR FROM gift_date) = ${opts.year}
      ORDER BY gift_date DESC, created_at DESC
    `;
    return rows.map(mapOffline);
  }
  if (opts?.year) {
    const rows = await client`
      SELECT id, fund_id, amount, gift_date, entered_by, note, donor_email, donor_name, created_at
      FROM offline_gifts
      WHERE EXTRACT(YEAR FROM gift_date) = ${opts.year}
      ORDER BY gift_date DESC, created_at DESC
    `;
    return rows.map(mapOffline);
  }
  const rows = await client`
    SELECT id, fund_id, amount, gift_date, entered_by, note, donor_email, donor_name, created_at
    FROM offline_gifts
    ORDER BY gift_date DESC, created_at DESC
    LIMIT 200
  `;
  return rows.map(mapOffline);
}

function mapOffline(row: Record<string, unknown>): OfflineGiftRecord {
  const fundId = String(row.fund_id);
  return {
    id: String(row.id),
    fundId,
    fundName: memoryFunds.get(fundId)?.name || fundId,
    amount: Number(row.amount),
    giftDate: String(row.gift_date).slice(0, 10),
    enteredBy: String(row.entered_by),
    note: String(row.note || ''),
    donorEmail: String(row.donor_email || ''),
    donorName: String(row.donor_name || ''),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

/** Test helpers */
export async function listOfflineGiftsByEmail(email: string): Promise<OfflineGiftRecord[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return [];
  const all = await listOfflineGifts();
  return all.filter((g) => g.donorEmail === normalized);
}

export function __resetFundsMemoryForTests(): void {
  memoryFunds.clear();
  memoryFunds.set(DEFAULT_FUND.id, { ...DEFAULT_FUND });
  memoryGoals.clear();
  memoryOfflineGifts.length = 0;
  memoryCompletedGifts.length = 0;
}

export function __addMemoryCompletedGiftForTests(g: {
  fundId: string;
  amount: number;
  year: number;
  status?: string;
}): void {
  memoryCompletedGifts.push({
    fundId: g.fundId,
    amount: g.amount,
    year: g.year,
    status: g.status || 'completed',
  });
}

/* ------------------------------------------------------------------ */
/* Fund usage + delete (Funds tab in the admin)                        */
/* ------------------------------------------------------------------ */

/** What still points at a fund. A fund can only be deleted when every count is 0. */
export type FundUsage = {
  gifts: number; // online gifts (any status)
  offlineGifts: number; // Contribution Log entries
  manualGifts: number; // Zelle / Venmo / Cash App gifts waiting or verified
  textGive: number; // text-to-give links and pending text gifts
  total: number;
};

export const PROTECTED_FUND_IDS = new Set<string>([DEFAULT_FUND.id]);

function emptyUsage(): FundUsage {
  return { gifts: 0, offlineGifts: 0, manualGifts: 0, textGive: 0, total: 0 };
}

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === '42P01' || /does not exist/i.test(String(e?.message || ''));
}

/** Rows grouped by fund_id. A table that hasn't been created yet counts as empty. */
async function countByFund(run: () => Promise<unknown[]>): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const rows = (await run()) as Array<{ fund_id: string; n: number | string }>;
    for (const r of rows) out.set(String(r.fund_id), Number(r.n) || 0);
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  return out;
}

/** Usage for every fund, keyed by fund id. */
export async function listFundUsage(): Promise<Map<string, FundUsage>> {
  const usage = new Map<string, FundUsage>();
  const bump = (id: string, key: keyof Omit<FundUsage, 'total'>, n: number) => {
    if (!n) return;
    const u = usage.get(id) || emptyUsage();
    u[key] += n;
    u.total += n;
    usage.set(id, u);
  };
  const client = getSql();
  if (!client) {
    requireMemoryFunds();
    for (const g of memoryCompletedGifts) bump(g.fundId, 'gifts', 1);
    for (const g of memoryOfflineGifts) bump(g.fundId, 'offlineGifts', 1);
    return usage;
  }
  const [gifts, offline, manual, links, pending] = await Promise.all([
    countByFund(() => client`SELECT fund_id, COUNT(*) AS n FROM donations GROUP BY fund_id`),
    countByFund(() => client`SELECT fund_id, COUNT(*) AS n FROM offline_gifts GROUP BY fund_id`),
    countByFund(() => client`SELECT fund_id, COUNT(*) AS n FROM manual_gifts GROUP BY fund_id`),
    countByFund(() => client`SELECT fund_id, COUNT(*) AS n FROM text_give_links GROUP BY fund_id`),
    countByFund(() => client`SELECT fund_id, COUNT(*) AS n FROM text_give_pending GROUP BY fund_id`),
  ]);
  for (const [id, n] of gifts) bump(id, 'gifts', n);
  for (const [id, n] of offline) bump(id, 'offlineGifts', n);
  for (const [id, n] of manual) bump(id, 'manualGifts', n);
  for (const [id, n] of links) bump(id, 'textGive', n);
  for (const [id, n] of pending) bump(id, 'textGive', n);
  return usage;
}

export async function getFundUsage(id: string): Promise<FundUsage> {
  return (await listFundUsage()).get(id) || emptyUsage();
}

export type DeleteFundResult =
  | { ok: true; fund: FundRecord }
  | { ok: false; error: 'FUND_NOT_FOUND' | 'FUND_PROTECTED' | 'FUND_IN_USE'; usage?: FundUsage };

/**
 * Delete a fund for good — only when nothing was ever given to it (no online gifts,
 * Contribution Log entries, Zelle/Venmo/Cash App gifts or text-to-give links), so
 * giving records are never lost. "Tithes & Offerings" can never be deleted.
 */
export async function deleteFund(id: string): Promise<DeleteFundResult> {
  const fund = await getFundById(id);
  if (!fund) return { ok: false, error: 'FUND_NOT_FOUND' };
  if (PROTECTED_FUND_IDS.has(id)) return { ok: false, error: 'FUND_PROTECTED' };
  const usage = await getFundUsage(id);
  if (usage.total > 0) return { ok: false, error: 'FUND_IN_USE', usage };
  const client = getSql();
  if (!client) {
    requireMemoryFunds();
    memoryFunds.delete(id);
    for (const k of Array.from(memoryGoals.keys())) if (k.startsWith(`${id}:`)) memoryGoals.delete(k);
    return { ok: true, fund };
  }
  // Giving goals cascade with the fund. The guard on donations/offline_gifts makes this a
  // no-op if a gift landed between the check and the delete.
  const rows = await client`
    DELETE FROM funds
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.fund_id = ${id})
      AND NOT EXISTS (SELECT 1 FROM offline_gifts o WHERE o.fund_id = ${id})
    RETURNING id
  `;
  if (!rows.length) return { ok: false, error: 'FUND_IN_USE', usage: await getFundUsage(id) };
  return { ok: true, fund };
}
