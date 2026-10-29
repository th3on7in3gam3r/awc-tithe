import { Router } from 'express';
import { requireAdminSession, getStaffSessionOrNull } from '../auth/staffGate';
import {
  createFund,
  deleteFund,
  getFundById,
  listFundUsage,
  listActiveFunds,
  listAllFunds,
  listGivingGoalProgress,
  listOfflineGifts,
  setGivingGoal,
  updateFund,
} from '../funds/store';
import { recordStaffOfflineGift } from '../gifts/recordOffline';
import { clientIp } from '../middleware/rateLimit';
import { writeActivityAudit } from '../audit/activity';

const router = Router();

/**
 * GET /api/funds
 * Public: active funds only (id, name, description, sortOrder). No goals or raised totals.
 */
router.get('/', async (_req, res) => {
  try {
    const funds = await listActiveFunds();
    return res.json({
      ok: true,
      funds: funds.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        sortOrder: f.sortOrder,
        // Event RSVP funds stay out of the Give page list; an RSVP link still selects them.
        isEvent: Boolean(f.isEvent),
        // An event fund's earlier names, so pay links sent before a rename still pick it.
        ...(f.isEvent && f.formerNames?.length ? { formerNames: f.formerNames } : {}),
      })),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'FUNDS_LIST_FAILED',
      message: 'Request failed',
    });
  }
});

/**
 * GET /api/funds/admin/goals?year=YYYY — admin only progress (no donor counts / averages)
 * Registered before /admin/:id so "goals" is not captured as an id.
 */
router.get('/admin/goals', requireAdminSession, async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const progress = await listGivingGoalProgress(year);
    return res.json({ ok: true, year, progress });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'GOALS_LIST_FAILED',
      message: 'Request failed',
    });
  }
});

/** PUT /api/funds/admin/goals — set optional annual goal (admin) */
router.put('/admin/goals', requireAdminSession, async (req, res) => {
  try {
    const session = getStaffSessionOrNull(req);
    const fundId = String(req.body?.fundId || '');
    const year = Number(req.body?.year) || new Date().getFullYear();
    const rawGoal = req.body?.goalAmount;
    const goalAmount =
      rawGoal === null || rawGoal === '' || rawGoal === undefined ? null : Number(rawGoal);

    if (!fundId) return res.status(400).json({ ok: false, error: 'FUND_REQUIRED' });
    const fund = await getFundById(fundId);
    if (!fund) return res.status(404).json({ ok: false, error: 'FUND_NOT_FOUND' });
    if (goalAmount != null && (!Number.isFinite(goalAmount) || goalAmount < 0)) {
      return res.status(400).json({ ok: false, error: 'INVALID_GOAL' });
    }

    await setGivingGoal({
      fundId,
      year,
      goalAmount,
      updatedBy: session?.label || session?.accountId || 'admin',
    });
    const progress = await listGivingGoalProgress(year);
    return res.json({ ok: true, year, progress });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'GOAL_SET_FAILED',
      message: 'Request failed',
    });
  }
});

/** GET /api/funds/admin/offline-gifts — admin only */
router.get('/admin/offline-gifts', requireAdminSession, async (req, res) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const fundId = req.query.fundId ? String(req.query.fundId) : undefined;
    const gifts = await listOfflineGifts({ year, fundId });
    return res.json({ ok: true, gifts });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'OFFLINE_LIST_FAILED',
      message: 'Request failed',
    });
  }
});

/** POST /api/funds/admin/offline-gifts — admin only */
router.post('/admin/offline-gifts', requireAdminSession, async (req, res) => {
  try {
    const session = getStaffSessionOrNull(req);
    const fundId = String(req.body?.fundId || '');
    const amount = Number(req.body?.amount);
    const giftDate = String(req.body?.giftDate || new Date().toISOString().slice(0, 10));
    const note = String(req.body?.note || '');
    if (!session) return res.status(401).json({ ok: false, error: 'STAFF_AUTH_REQUIRED' });

    const recorded = await recordStaffOfflineGift({
      fundId,
      amount,
      giftDate,
      note,
      donorEmail: req.body?.donorEmail != null ? String(req.body.donorEmail) : '',
      donorName: req.body?.donorName != null ? String(req.body.donorName) : '',
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      ipAddress: clientIp(req),
    });
    if (!recorded.ok) return res.status(recorded.status).json({ ok: false, error: recorded.error });
    return res.status(201).json({ ok: true, gift: recorded.gift });
  } catch (err) {
    console.error('[funds] offline', err);
    return res.status(500).json({
      ok: false,
      error: 'OFFLINE_CREATE_FAILED',
    });
  }
});

/** GET /api/funds/admin — all funds including inactive (admin only) */
router.get('/admin', requireAdminSession, async (_req, res) => {
  try {
    const [funds, usage] = await Promise.all([listAllFunds(), listFundUsage()]);
    return res.json({
      ok: true,
      funds: funds.map((f) => ({
        ...f,
        usage: usage.get(f.id) || { gifts: 0, offlineGifts: 0, manualGifts: 0, textGive: 0, total: 0 },
      })),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'FUNDS_ADMIN_LIST_FAILED',
      message: 'Request failed',
    });
  }
});

/** POST /api/funds/admin — create fund (admin) */
router.post('/admin', requireAdminSession, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
    }
    const fund = await createFund({
      name,
      description: String(req.body?.description || ''),
      active: req.body?.active !== false,
      sortOrder: Number(req.body?.sortOrder ?? 0),
      code: String(req.body?.code || ''),
    });
    return res.status(201).json({ ok: true, fund });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'FUND_CREATE_FAILED',
      message: 'Request failed',
    });
  }
});

/** PATCH /api/funds/admin/:id — update fund (admin) */
router.patch('/admin/:id', requireAdminSession, async (req, res) => {
  try {
    const fund = await updateFund(String(req.params.id), {
      name: req.body?.name != null ? String(req.body.name) : undefined,
      description: req.body?.description != null ? String(req.body.description) : undefined,
      active: req.body?.active != null ? Boolean(req.body.active) : undefined,
      sortOrder: req.body?.sortOrder != null ? Number(req.body.sortOrder) : undefined,
      glCode: req.body?.glCode != null ? String(req.body.glCode) : req.body?.code != null ? String(req.body.code) : undefined,
    });
    if (!fund) return res.status(404).json({ ok: false, error: 'FUND_NOT_FOUND' });
    return res.json({ ok: true, fund });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'FUND_UPDATE_FAILED',
      message: 'Request failed',
    });
  }
});

/**
 * DELETE /api/funds/admin/:id — delete a fund for good (admin).
 * Refused for "Tithes & Offerings" and for any fund that has gifts or text-to-give links.
 */
router.delete('/admin/:id', requireAdminSession, async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await deleteFund(id);
    if (result.ok === false) {
      const status = result.error === 'FUND_NOT_FOUND' ? 404 : 409;
      const message =
        result.error === 'FUND_PROTECTED'
          ? 'Tithes & Offerings can never be deleted.'
          : result.error === 'FUND_IN_USE'
            ? 'This fund has gifts recorded, so it cannot be deleted. Turn it off instead.'
            : 'Fund not found.';
      return res.status(status).json({ ok: false, error: result.error, message, usage: result.usage });
    }
    const staff = getStaffSessionOrNull(req);
    if (staff) {
      await writeActivityAudit({
        actorId: staff.userId,
        actorLabel: staff.email,
        actorRole: staff.role,
        action: 'FUND_DELETED',
        resource: id,
        details: JSON.stringify({ name: result.fund.name, isEvent: Boolean(result.fund.isEvent) }),
        ipAddress: clientIp(req),
      }).catch(() => undefined);
    }
    return res.json({ ok: true, deletedId: id });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'FUND_DELETE_FAILED',
      message: 'Request failed',
    });
  }
});

export default router;
