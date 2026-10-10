import { getSql } from '../db';
import { memoryStoreAllowed } from '../config';
import type { PoolClient } from 'pg';

export type ActivityAuditEntry = {
  id: string;
  at: string;
  actorId: string;
  actorLabel: string;
  actorRole: string;
  action: string;
  resource: string;
  details: string;
  ipAddress: string;
};

const memoryAudit: ActivityAuditEntry[] = [];

export async function writeActivityAudit(input: {
  actorId: string;
  actorLabel: string;
  actorRole: string;
  action: string;
  resource?: string;
  details?: string;
  ipAddress?: string;
}, transactionClient?: PoolClient): Promise<void> {
  const entry: ActivityAuditEntry = {
    id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    actorRole: input.actorRole,
    action: input.action,
    resource: input.resource || '',
    details: input.details || '',
    ipAddress: input.ipAddress || '',
  };
  if (transactionClient) {
    await transactionClient.query(
      `INSERT INTO activity_audit (
        id, at, actor_id, actor_label, actor_role, action, resource, details, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.id,
        entry.at,
        entry.actorId,
        entry.actorLabel,
        entry.actorRole,
        entry.action,
        entry.resource,
        entry.details,
        entry.ipAddress,
      ]
    );
    return;
  }

  const client = getSql();
  if (!client) {
    if (!memoryStoreAllowed()) {
      console.error('[audit] DATABASE_URL missing — audit entry not persisted', entry.action);
      return;
    }
    memoryAudit.unshift(entry);
    return;
  }
  await client`
    INSERT INTO activity_audit (
      id, actor_id, actor_label, actor_role, action, resource, details, ip_address
    ) VALUES (
      ${entry.id},
      ${entry.actorId},
      ${entry.actorLabel},
      ${entry.actorRole},
      ${entry.action},
      ${entry.resource},
      ${entry.details},
      ${entry.ipAddress}
    )
  `;
}

export async function listActivityAudit(limit = 200): Promise<ActivityAuditEntry[]> {
  const safe = Math.min(Math.max(limit, 1), 500);
  const client = getSql();
  if (!client) {
    if (!memoryStoreAllowed()) return [];
    return memoryAudit.slice(0, safe);
  }
  const rows = await client`
    SELECT id, at, actor_id, actor_label, actor_role, action, resource, details, ip_address
    FROM activity_audit
    ORDER BY at DESC
    LIMIT ${safe}
  `;
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      at: r.at ? new Date(String(r.at)).toISOString() : '',
      actorId: String(r.actor_id || ''),
      actorLabel: String(r.actor_label || ''),
      actorRole: String(r.actor_role || ''),
      action: String(r.action || ''),
      resource: String(r.resource || ''),
      details: String(r.details || ''),
      ipAddress: String(r.ip_address || ''),
    };
  });
}
