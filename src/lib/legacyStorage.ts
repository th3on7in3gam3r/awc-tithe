const PREFIX = 'awc_tithe_stewardship_v2';
const THEME_KEY = `${PREFIX}_dark`;

/** Drop legacy browser copies of donor, gift, and config data. Theme may stay. */
export function purgeLegacyStewardshipStorage(): void {
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      if (key === THEME_KEY) continue;
      drop.push(key);
    }
    for (const key of drop) localStorage.removeItem(key);
  } catch {
    // private mode
  }
}
