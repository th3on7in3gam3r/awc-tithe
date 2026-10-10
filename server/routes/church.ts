import { Router } from 'express';
import { getChurchSettings, updateChurchSettings } from '../church/settings';
import { requireAdminSession, getStaffSessionOrNull } from '../auth/staffGate';

const router = Router();

/** Public church identity (no secrets). */
router.get('/', async (_req, res) => {
  try {
    const settings = await getChurchSettings();
    return res.json({ ok: true, settings });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'CHURCH_SETTINGS_FAILED',
      message: 'Request failed',
    });
  }
});

/** Admin-only update. Staff cannot change identity. */
router.patch('/', requireAdminSession, async (req, res) => {
  try {
    const session = getStaffSessionOrNull(req);
    const body = req.body || {};
    const settings = await updateChurchSettings(
      {
        name: body.name != null ? String(body.name) : undefined,
        legalEntityName: body.legalEntityName != null ? String(body.legalEntityName) : undefined,
        address: body.address != null ? String(body.address) : undefined,
        cityStateZip: body.cityStateZip != null ? String(body.cityStateZip) : undefined,
        ein: body.ein != null ? String(body.ein) : undefined,
        phone: body.phone != null ? String(body.phone) : undefined,
        email: body.email != null ? String(body.email) : undefined,
        website: body.website != null ? String(body.website) : undefined,
        seniorPastor: body.seniorPastor != null ? String(body.seniorPastor) : undefined,
        financialOfficer: body.financialOfficer != null ? String(body.financialOfficer) : undefined,
        taxExemptStatus: body.taxExemptStatus != null ? String(body.taxExemptStatus) : undefined,
      },
      session?.label || session?.accountId || 'admin'
    );
    return res.json({ ok: true, settings });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'CHURCH_SETTINGS_UPDATE_FAILED',
      message: 'Request failed',
    });
  }
});

export default router;
