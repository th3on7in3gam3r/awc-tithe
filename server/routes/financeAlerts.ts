import { Router } from 'express';
import { requireAdminSession, getStaffSessionOrNull } from '../auth/staffGate';
import {
  addFinanceAlertRecipient,
  listFinanceAlertRecipients,
  removeFinanceAlertRecipient,
} from '../financeAlerts/store';
import { financeAlertExtraEmails } from '../email/sendP2pGiftAlert';
import { listStaffAccounts } from '../auth/staffRoles';
import { writeActivityAudit } from '../audit/activity';
import { clientIp } from '../middleware/rateLimit';

const router = Router();

/** GET /api/finance-alerts — who gets finance emails (admin only). */
router.get('/', requireAdminSession, async (_req, res) => {
  try {
    const [extra, accounts] = await Promise.all([listFinanceAlertRecipients(), listStaffAccounts()]);
    return res.json({
      ok: true,
      admins: accounts
        .filter((a) => a.role === 'admin' && a.status === 'active')
        .map((a) => a.email.toLowerCase()),
      recipients: extra,
      fromServerSettings: financeAlertExtraEmails().length,
    });
  } catch {
    return res.status(500).json({ ok: false, error: 'FINANCE_ALERTS_LIST_FAILED', message: 'Request failed' });
  }
});

/** POST /api/finance-alerts { email, name? } — add someone (admin only). */
router.post('/', requireAdminSession, async (req, res) => {
  const staff = getStaffSessionOrNull(req);
  try {
    const rec = await addFinanceAlertRecipient({
      email: String(req.body?.email || ''),
      name: String(req.body?.name || ''),
      addedBy: staff?.email || '',
    });
    if (staff) {
      await writeActivityAudit({
        actorId: staff.userId,
        actorLabel: staff.email,
        actorRole: staff.role,
        action: 'FINANCE_ALERT_RECIPIENT_ADDED',
        resource: rec.email,
        details: `${rec.email} will get finance emails`,
        ipAddress: clientIp(req),
      }).catch(() => undefined);
    }
    return res.status(201).json({ ok: true, recipient: rec });
  } catch (err) {
    const bad = err instanceof Error && err.message === 'INVALID_EMAIL';
    return res.status(bad ? 400 : 500).json({
      ok: false,
      error: bad ? 'INVALID_EMAIL' : 'FINANCE_ALERT_ADD_FAILED',
      message: bad ? 'Enter a valid email address.' : 'Request failed',
    });
  }
});

/** DELETE /api/finance-alerts/:email — remove someone (admin only). */
router.delete('/:email', requireAdminSession, async (req, res) => {
  const staff = getStaffSessionOrNull(req);
  try {
    const email = String(req.params.email);
    const removed = await removeFinanceAlertRecipient(email);
    if (!removed) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Not on the list.' });
    if (staff) {
      await writeActivityAudit({
        actorId: staff.userId,
        actorLabel: staff.email,
        actorRole: staff.role,
        action: 'FINANCE_ALERT_RECIPIENT_REMOVED',
        resource: email.toLowerCase(),
        details: `${email.toLowerCase()} no longer gets finance emails`,
        ipAddress: clientIp(req),
      }).catch(() => undefined);
    }
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: 'FINANCE_ALERT_REMOVE_FAILED', message: 'Request failed' });
  }
});

export default router;
