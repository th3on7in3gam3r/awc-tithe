import { Router, type Request, type Response } from 'express';
import { env } from '../config';
import { getSql, hasDatabaseUrl } from '../db';

const router = Router();

export type VaultInterestLead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  source: string;
  notes: string;
  createdAt: string;
  forwarded: boolean;
  forwardError?: string;
};

const memoryLeads: VaultInterestLead[] = [];

async function ensureVaultInterestTable() {
  const sql = getSql();
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS vault_interest_leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'awc_tithe_guided',
      notes TEXT NOT NULL DEFAULT '',
      forwarded BOOLEAN NOT NULL DEFAULT FALSE,
      forward_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

router.post('/interest', async (req: Request, res: Response) => {
  const body = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    source?: string;
    notes?: string;
  };

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const address = String(body.address || '').trim();
  const source = String(body.source || 'awc_tithe_guided').trim();
  const notes = String(body.notes || '').trim();

  if (!name || !email || !email.includes('@')) {
    return res.status(400).json({
      error: 'MISSING_FIELDS',
      message: 'name and a valid email are required to join AWC Vault interest list.',
    });
  }

  const id = `vault-lead-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();
  let forwarded = false;
  let forwardError: string | undefined;

  if (env.awcVaultInterestUrl) {
    try {
      const response = await fetch(env.awcVaultInterestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: 'awc_tithe',
          name,
          email,
          phone,
          address,
          source,
          notes,
          optedInAt: createdAt,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        forwardError = `Vault API ${response.status}: ${text.slice(0, 200)}`;
      } else {
        forwarded = true;
      }
    } catch (err) {
      forwardError = err instanceof Error ? err.message : 'Vault forward failed';
    }
  }

  const lead: VaultInterestLead = {
    id,
    name,
    email,
    phone,
    address,
    source,
    notes,
    createdAt,
    forwarded,
    forwardError,
  };

  try {
    if (hasDatabaseUrl()) {
      await ensureVaultInterestTable();
      const sql = getSql()!;
      await sql`
        INSERT INTO vault_interest_leads (
          id, name, email, phone, address, source, notes, forwarded, forward_error, created_at
        ) VALUES (
          ${id}, ${name}, ${email}, ${phone}, ${address}, ${source}, ${notes},
          ${forwarded}, ${forwardError || null}, ${createdAt}
        )
      `;
    } else {
      memoryLeads.unshift(lead);
    }
  } catch (err) {
    console.error('[vault/interest] persist', err);
    memoryLeads.unshift(lead);
  }

  return res.status(201).json({
    ok: true,
    leadId: id,
    forwarded,
    forwardError: forwardError || null,
    setupUrl: env.awcVaultSetupUrl,
    message: forwarded
      ? 'Vault interest submitted. Church team will follow up.'
      : 'Interest saved. Church team will follow up to help you join AWC Vault.',
  });
});

router.get('/interest', (_req: Request, res: Response) => {
  return res.json({
    count: memoryLeads.length,
    setupUrl: env.awcVaultSetupUrl,
    forwardConfigured: Boolean(env.awcVaultInterestUrl),
    leads: memoryLeads.slice(0, 50),
  });
});

export default router;
