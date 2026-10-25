/* AWC Tithe service worker — only here so phones can add Tithe to the home
 * screen. It never caches or touches giving, sign-in, Stripe, or API traffic:
 * every request goes straight to the network as if this file didn't exist.
 * The one exception: if a page can't load because the phone is offline,
 * show a short "you're offline" note instead of the browser's error page.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>AWC Tithe — offline</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#3B0A0D;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}
img{width:96px;height:96px;border-radius:20px}h1{font-size:22px;margin:16px 0 8px}p{opacity:.8;margin:0 0 20px}
a{display:inline-block;background:#E9C979;color:#3B0A0D;font-weight:700;padding:12px 22px;border-radius:999px;text-decoration:none}</style></head>
<body><div><img src="/icons/icon-192.png" alt=""><h1>You're offline</h1><p>Connect to Wi-Fi or data to give.</p><a href="/">Try again</a></div></body></html>`;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only full page loads on our own site; everything else is left alone.
  if (req.mode !== 'navigate' || req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  );
});
