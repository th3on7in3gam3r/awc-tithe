/**
 * server/tests/homeScreen.test.ts
 *
 * Add to Home Screen: the manifest, the AWC Tithe seal icons, the page links,
 * and a service worker that never touches giving, Stripe or API traffic.
 *
 * Run: npx tsx server/tests/homeScreen.test.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) console.log(`OK  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

/** Width/height from a PNG header. */
function pngSize(p: string): [number, number] {
  const b = fs.readFileSync(path.join(root, p));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const manifest = JSON.parse(read('public/manifest.webmanifest'));
check('manifest names the app AWC Tithe', manifest.name === 'AWC Tithe' && manifest.short_name === 'AWC Tithe');
check('manifest opens full-screen from the home screen', manifest.display === 'standalone' && manifest.start_url === '/');
for (const icon of manifest.icons as { src: string; sizes: string; purpose: string }[]) {
  const file = `public${icon.src}`;
  const exists = fs.existsSync(path.join(root, file));
  check(`icon exists: ${icon.src}`, exists);
  if (exists) {
    const [w, h] = pngSize(file);
    check(`icon ${icon.src} is ${icon.sizes}`, `${w}x${h}` === icon.sizes, `${w}x${h}`);
  }
}
check('has a maskable icon for Android', manifest.icons.some((i: any) => i.purpose === 'maskable'));
const [aw, ah] = pngSize('public/icons/apple-touch-icon.png');
check('iPhone icon is 180x180', aw === 180 && ah === 180, `${aw}x${ah}`);

const html = read('index.html');
check('page links the manifest', html.includes('<link rel="manifest" href="/manifest.webmanifest"'));
check('page links the iPhone icon', html.includes('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"'));
check('no inline scripts added to index.html', !/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));

const sw = read('public/sw.js');
check('service worker never caches', !/caches\.|cache\.put|CacheStorage/.test(sw));
check('service worker only handles same-site page loads', /req\.mode !== 'navigate'/.test(sw) && /origin !== self\.location\.origin/.test(sw));
check('service worker leaves POSTs (payments) alone', /req\.method !== 'GET'/.test(sw));
check('service worker is registered', read('src/main.tsx').includes("navigator.serviceWorker.register('/sw.js')"));

const comp = read('src/components/AddToHomeScreen.tsx');
check('one shared install offer for every button', /useSyncExternalStore\(subscribe/.test(comp));
check('"Not now" snoozes 30 days, then stops', /SNOOZE_DAYS = 30/.test(comp) && /count >= 2/.test(comp));
const nav = read('src/components/Navbar.tsx');
check('no ask in the staff view', nav.includes("<AddToHomeScreenBanner hidden={portalMode === 'admin'} />"));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nHome screen checks passed.');
