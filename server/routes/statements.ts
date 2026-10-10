import { Router } from 'express';
import { requireAdminSession, getStaffSessionOrNull } from '../auth/staffGate';
import { clientIp } from '../middleware/rateLimit';
import { previewYearEnd, sendYearEndStatements } from '../statements/yearEnd';

const router = Router();

function yearFrom(value: unknown): number | null {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

/** Admin preview of one sample statement. Does not send email. */
router.get('/year-end/preview', requireAdminSession, async (req, res) => {
  try {
    const year = yearFrom(req.query.year);
    if (!year) return res.status(400).json({ ok: false, error: 'INVALID_YEAR' });
    const preview = await previewYearEnd(year);
    return res.json({ ok: true, ...preview });
  } catch (err) {
    console.error('[statements] preview', err);
    return res.status(500).json({
      ok: false,
      error: 'STATEMENT_PREVIEW_FAILED',
      message: 'Request failed',
    });
  }
});

/**
 * Admin send. Idempotent per donor per year.
 * Body.resendEmail resends to that one donor only.
 */
router.post('/year-end/send', requireAdminSession, async (req, res) => {
  try {
    const year = yearFrom(req.body?.year);
    if (!year) return res.status(400).json({ ok: false, error: 'INVALID_YEAR' });
    const session = getStaffSessionOrNull(req);
    const result = await sendYearEndStatements({
      year,
      resendEmail: req.body?.resendEmail ? String(req.body.resendEmail) : undefined,
      actorId: session?.accountId || 'admin',
      actorLabel: session?.label || 'Administrator',
      ipAddress: clientIp(req),
    });
    return res.json({ ok: true, year, ...result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'STATEMENT_SEND_FAILED',
      message: 'Request failed',
    });
  }
});

export default router;
