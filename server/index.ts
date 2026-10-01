import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dcbStatus, env, plaidStatus, stripeStatus } from './config';
import stripeRoutes from './routes/stripe';
import plaidRoutes from './routes/plaid';
import dcbRoutes from './routes/dcb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist');

const app = express();

app.use(cors({ origin: true }));

// Stripe webhooks need raw body for signature verification
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, _res, next) => {
  (req as express.Request & { rawBody?: Buffer }).rawBody = req.body as Buffer;
  try {
    const text = (req.body as Buffer).toString('utf8');
    req.body = JSON.parse(text);
  } catch {
    // leave as buffer if not JSON
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    product: 'AWC Tithe',
    timestamp: new Date().toISOString(),
    integrations: {
      stripe: stripeStatus(),
      plaid: plaidStatus(),
      dcb: dcbStatus(),
    },
  });
});

app.get('/api/config', (_req, res) => {
  const stripe = stripeStatus();
  const plaid = plaidStatus();
  const dcb = dcbStatus();
  res.json({
    product: 'AWC Tithe',
    stripePublishableKey: stripe.configured ? env.stripePublishableKey : null,
    integrations: { stripe, plaid, dcb },
    dcbBookId: env.awcDcbBookId,
  });
});

app.use('/api/stripe', stripeRoutes);
app.use('/api/plaid', plaidRoutes);
app.use('/api/dcb', dcbRoutes);

// Serve Vite production build (Render single-service deploy)
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(env.port, '0.0.0.0', () => {
  console.log(`AWC Tithe listening on http://0.0.0.0:${env.port}`);
  console.log(
    `Integrations — Stripe: ${stripeStatus().mode}, Plaid: ${plaidStatus().mode}, DCB: ${dcbStatus().mode}`
  );
});
