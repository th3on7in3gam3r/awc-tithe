import { env, memoryStoreAllowed } from '../config';
import { getSql } from '../db';

export type ChurchSettings = {
  id: string;
  name: string;
  legalEntityName: string;
  address: string;
  cityStateZip: string;
  ein: string;
  phone: string;
  email: string;
  website: string;
  seniorPastor: string;
  financialOfficer: string;
  taxExemptStatus: string;
  updatedAt: string;
  updatedBy: string;
};

const SETTINGS_ID = 'default';

let memorySettings: ChurchSettings | null = null;

function envDefaults(): ChurchSettings {
  return {
    id: SETTINGS_ID,
    name: env.churchName || 'Anointed Worship Center',
    legalEntityName: env.churchLegalName || '',
    address: env.churchAddress || '',
    cityStateZip: env.churchCityStateZip || '',
    ein: env.churchEin || '',
    phone: env.churchPhone || '',
    email: env.churchSupportEmail || 'stewardship@anointedworshipcenter.com',
    website: env.churchWebsite || '',
    seniorPastor: 'Pastor Kenneth Mutegyeki',
    financialOfficer: '',
    taxExemptStatus: '501(c)(3) Public Religious Organization',
    updatedAt: new Date().toISOString(),
    updatedBy: 'env',
  };
}

function mapRow(row: Record<string, unknown>): ChurchSettings {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    legalEntityName: String(row.legal_entity_name || ''),
    address: String(row.address || ''),
    cityStateZip: String(row.city_state_zip || ''),
    ein: String(row.ein || ''),
    phone: String(row.phone || ''),
    email: String(row.email || ''),
    website: String(row.website || ''),
    seniorPastor: String(row.senior_pastor || ''),
    financialOfficer: String(row.financial_officer || ''),
    taxExemptStatus: String(row.tax_exempt_status || ''),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : new Date().toISOString(),
    updatedBy: String(row.updated_by || ''),
  };
}

/** Insert the default row from env when none exists. Never overwrites an admin edit. */
export async function ensureChurchSettings(): Promise<ChurchSettings> {
  const defaults = envDefaults();
  const client = getSql();
  if (!client) {
    if (!memoryStoreAllowed()) {
      throw new Error('DATABASE_URL is required unless DEV_MEMORY_STORE=true');
    }
    if (!memorySettings) memorySettings = defaults;
    return memorySettings;
  }
  const existing = await client`SELECT * FROM church_settings WHERE id = ${SETTINGS_ID} LIMIT 1`;
  if (existing[0]) return mapRow(existing[0] as Record<string, unknown>);
  await client`
    INSERT INTO church_settings (
      id, name, legal_entity_name, address, city_state_zip, ein, phone, email, website,
      senior_pastor, financial_officer, tax_exempt_status, updated_by
    ) VALUES (
      ${SETTINGS_ID},
      ${defaults.name},
      ${defaults.legalEntityName},
      ${defaults.address},
      ${defaults.cityStateZip},
      ${defaults.ein},
      ${defaults.phone},
      ${defaults.email},
      ${defaults.website},
      ${defaults.seniorPastor},
      ${defaults.financialOfficer},
      ${defaults.taxExemptStatus},
      ${'env-seed'}
    )
    ON CONFLICT (id) DO NOTHING
  `;
  const rows = await client`SELECT * FROM church_settings WHERE id = ${SETTINGS_ID} LIMIT 1`;
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : defaults;
}

export async function getChurchSettings(): Promise<ChurchSettings> {
  return ensureChurchSettings();
}

export async function updateChurchSettings(
  patch: Partial<Omit<ChurchSettings, 'id' | 'updatedAt' | 'updatedBy'>>,
  updatedBy: string
): Promise<ChurchSettings> {
  const current = await ensureChurchSettings();
  const next: ChurchSettings = {
    ...current,
    name: patch.name != null ? patch.name.trim() : current.name,
    legalEntityName: patch.legalEntityName != null ? patch.legalEntityName.trim() : current.legalEntityName,
    address: patch.address != null ? patch.address.trim() : current.address,
    cityStateZip: patch.cityStateZip != null ? patch.cityStateZip.trim() : current.cityStateZip,
    ein: patch.ein != null ? patch.ein.trim() : current.ein,
    phone: patch.phone != null ? patch.phone.trim() : current.phone,
    email: patch.email != null ? patch.email.trim() : current.email,
    website: patch.website != null ? patch.website.trim() : current.website,
    seniorPastor: patch.seniorPastor != null ? patch.seniorPastor.trim() : current.seniorPastor,
    financialOfficer: patch.financialOfficer != null ? patch.financialOfficer.trim() : current.financialOfficer,
    taxExemptStatus: patch.taxExemptStatus != null ? patch.taxExemptStatus.trim() : current.taxExemptStatus,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  if (!next.name) next.name = current.name;

  const client = getSql();
  if (!client) {
    if (!memoryStoreAllowed()) {
      throw new Error('DATABASE_URL is required unless DEV_MEMORY_STORE=true');
    }
    memorySettings = next;
    return next;
  }
  await client`
    UPDATE church_settings SET
      name = ${next.name},
      legal_entity_name = ${next.legalEntityName},
      address = ${next.address},
      city_state_zip = ${next.cityStateZip},
      ein = ${next.ein},
      phone = ${next.phone},
      email = ${next.email},
      website = ${next.website},
      senior_pastor = ${next.seniorPastor},
      financial_officer = ${next.financialOfficer},
      tax_exempt_status = ${next.taxExemptStatus},
      updated_at = NOW(),
      updated_by = ${updatedBy}
    WHERE id = ${SETTINGS_ID}
  `;
  return next;
}
