import pg from 'pg';
import { env } from '../config';

let pool: pg.Pool | null = null;

/** Shared pg Pool for Better Auth (Neon needs a real TCP Pool, not HTTP neon()). */
export function getPgPool(): pg.Pool | null {
  if (!env.databaseUrl) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseUrl.includes('localhost') ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}
