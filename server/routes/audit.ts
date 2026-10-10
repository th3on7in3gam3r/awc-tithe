import { Router } from 'express';
import { requireStaffSession } from '../auth/staffGate';
import { listActivityAudit } from '../audit/activity';

const router = Router();

/** Server-written activity only. Staff may read; the browser never posts audit rows. */
router.get('/', requireStaffSession, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 200);
    const entries = await listActivityAudit(limit);
    return res.json({ ok: true, entries });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'AUDIT_LIST_FAILED',
      message: 'Request failed',
    });
  }
});

export default router;
