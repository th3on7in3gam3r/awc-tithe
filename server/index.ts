import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { toNodeHandler } from 'better-auth/node';
import {
  assertProductionEnv,
  allowedOrigins,
  databaseStatus,
  env,
  isProduction,
  stripeStatus,
} from './config';
import { initGiftStore, giftStoreMode } from './gifts/store';
import { auth } from './auth/betterAuth';
import { staffAuth } from './auth/staffAuth';
import stripeRoutes, { stripeWebhookHandler } from './routes/stripe';
import dcbRoutes from './routes/dcb';
import giftsRoutes from './routes/gifts';
import staffRoutes from './routes/staff';
import donorRoutes from './routes/donor';
import fundsRoutes from './routes/funds';
import churchRoutes from './routes/church';
import auditRoutes from './routes/audit';
import statementsRoutes from './routes/statements';
import { seedDefaultFund } from './funds/store';
import { ensureChurchSettings, getChurchSettings } from './church/settings';
import { startDcbOutboxWorker } from './dcb/worker';

// Run production guard before anything else — exits with clear message if vars are missing
assertProductionEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist');

const app = express();

/**
 * Trust the first proxy hop (Render). Express populates req.ip from
 * X-Forwarded-For; we never parse that header ourselves (avoids client spoofing).
 */
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security headers — helmet with explicit CSP
// ---------------------------------------------------------------------------

app.use(
  helmet({
    // HSTS: tell browsers to always use HTTPS (production only)
    hsts: isProduction()
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    // CSP: allow Stripe, Cloudflare Turnstile, and Google Fonts
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://js.stripe.com',
          'https://*.js.stripe.com',
          'https://connect-js.stripe.com',
          'https://challenges.cloudflare.com',
        ],
        workerSrc: ["'self'", 'blob:'],
        frameSrc: [
          "'self'",
          'https://js.stripe.com',
          'https://*.js.stripe.com',
          'https://hooks.stripe.com',
          'https://*.stripe.com',
          'https://connect-js.stripe.com',
          'https://link.com',
          'https://*.link.com',
          'https://pay.google.com',
          'https://challenges.cloudflare.com',
        ],
        connectSrc: [
          "'self'",
          'https://api.stripe.com',
          'https://errors.stripe.com',
          'https://hooks.stripe.com',
          'https://*.stripe.com',
          'https://link.com',
          'https://*.link.com',
          'https://challenges.cloudflare.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Tailwind inlines styles; refine when/if we adopt a nonce
          'https://fonts.googleapis.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: isProduction() ? [] : null,
      },
    },
    // Other sensible defaults helmet sets automatically:
    // X-Content-Type-Options: nosniff
    // X-Frame-Options: SAMEORIGIN (overridden by frame-ancestors in CSP)
    // Referrer-Policy: no-referrer (helmet default; we keep it)
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false, // Stripe Elements needs cross-origin resources
  })
);

// ---------------------------------------------------------------------------
// CORS — locked to PUBLIC_APP_URL; never reflected
// ---------------------------------------------------------------------------

const origins = allowedOrigins();

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Same-origin requests (e.g. Stripe webhook from the same host) have no Origin
      if (!requestOrigin) return callback(null, true);
      if (origins.includes(requestOrigin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  })
);

// Better Auth must mount before express.json() so it can read the raw body.
const authHandler = toNodeHandler(auth);
app.all('/api/auth', authHandler);
app.all('/api/auth/*', authHandler);
const staffAuthHandler = toNodeHandler(staffAuth);
app.all('/api/staff-auth', staffAuthHandler);
app.all('/api/staff-auth/*', staffAuthHandler);

/**
 * Stripe webhooks MUST see the raw body Buffer for signature verification.
 * Mount before express.json() so the JSON parser never touches this path.
 */
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    product: 'AWC Tithe',
    timestamp: new Date().toISOString(),
    integrations: {
      stripe: stripeStatus(),
      database: databaseStatus(),
    },
    giftStore: giftStoreMode(),
  });
});

app.get('/api/config', async (_req, res) => {
  const stripe = stripeStatus();
  const database = databaseStatus();
  const church = await getChurchSettings().catch(() => null);
  res.json({
    product: 'AWC Tithe',
    stripePublishableKey: stripe.configured ? env.stripePublishableKey : null,
    turnstileSiteKey: process.env.VITE_TURNSTILE_SITE_KEY?.trim() || null,
    minGiftCents: env.minGiftCents,
    integrations: { stripe, database },
    giftStore: giftStoreMode(),
    church: church
      ? {
          name: church.name,
          legalEntityName: church.legalEntityName,
          address: church.address,
          cityStateZip: church.cityStateZip,
          ein: church.ein,
          phone: church.phone,
          email: church.email,
          website: church.website,
        }
      : {
          name: env.churchName,
          legalEntityName: env.churchLegalName || '',
          address: env.churchAddress || '',
          cityStateZip: env.churchCityStateZip || '',
          ein: env.churchEin || '',
          phone: env.churchPhone || '',
          email: env.churchSupportEmail,
          website: env.churchWebsite,
        },
  });
});

app.use('/api/stripe', stripeRoutes);
app.use('/api/dcb', dcbRoutes);
app.use('/api/gifts', giftsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/donor', donorRoutes);
app.use('/api/funds', fundsRoutes);
app.use('/api/church', churchRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/statements', statementsRoutes);

// Serve Vite production build (Render single-service deploy)
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (res.headersSent) return next(err);
    console.error('[server] unhandled error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
);

async function boot() {
  // DCB_REQUIRED=true → refuse to start without the per-app key
  if (env.dcbRequired && (!env.awcDcbApiUrl || !env.awcDcbKeyTithe)) {
    const missing = [
      !env.awcDcbApiUrl && 'AWC_DCB_API_URL',
      !env.awcDcbKeyTithe && 'AWC_DCB_KEY_TITHE',
    ]
      .filter(Boolean)
      .join(', ');
    console.error(`[boot] DCB_REQUIRED=true but ${missing} is not set. Refusing to start.`);
    process.exit(1);
  }
  if (!env.awcDcbApiUrl || !env.awcDcbKeyTithe) {
    console.warn(
      '[dcb] AWC_DCB_API_URL or AWC_DCB_KEY_TITHE not set — outbox rows will stay pending'
    );
  }

  const store = await initGiftStore();
  await seedDefaultFund();
  await ensureChurchSettings();

  // Start DCB outbox delivery worker (no-ops if no DATABASE_URL)
  startDcbOutboxWorker();

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`AWC Tithe listening on http://0.0.0.0:${env.port}`);
    console.log(`NODE_ENV:      ${process.env.NODE_ENV ?? 'unset'}`);
    console.log(`Secure cookies:    ${isProduction()}`);
    console.log(`Webhook sig required: ${isProduction() || Boolean(env.stripeWebhookSecret)}`);
    console.log(`Turnstile required:   ${Boolean(env.turnstileSecretKey)}`);
    console.log(`CORS allowed origins: ${origins.join(', ')}`);
    console.log(`Stripe: ${stripeStatus().mode} | DB: ${store.mode}`);
    if (store.error) {
      console.warn(`[db] schema warning: ${store.error}`);
    }
  });
}

boot().catch((err) => {
  console.error('[boot] failed:', err.message);
  process.exit(1);
});
