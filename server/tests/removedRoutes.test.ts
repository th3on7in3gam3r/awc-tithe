process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.BETTER_AUTH_SECRET = 'route-test-secret-with-at-least-32-chars';

async function main(): Promise<void> {
  const express = (await import('express')).default;
  const [stripeRoutes, dcbRoutes, giftsRoutes] = await Promise.all([
    import('../routes/stripe'),
    import('../routes/dcb'),
    import('../routes/gifts'),
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/stripe', stripeRoutes.default);
  app.use('/api/dcb', dcbRoutes.default);
  app.use('/api/gifts', giftsRoutes.default);

  const server = await new Promise<import('http').Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a port.');

  const removedRoutes: Array<{ method: 'GET' | 'POST'; path: string }> = [
    { method: 'GET', path: '/api/dcb/mock/entries' },
    { method: 'POST', path: '/api/dcb/mock/entries' },
    { method: 'GET', path: '/api/vault/interest' },
    { method: 'POST', path: '/api/vault/interest' },
    { method: 'POST', path: '/api/gifts' },
    { method: 'POST', path: '/api/stripe/confirm-and-sync' },
  ];

  try {
    for (const route of removedRoutes) {
      const response = await fetch(`http://127.0.0.1:${address.port}${route.path}`, {
        method: route.method,
      });
      if (response.status !== 404) {
        throw new Error(`${route.method} ${route.path} returned ${response.status}, expected 404.`);
      }
    }
    const statusResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/stripe/payment-status/pi_not_in_browser_cookie`
    );
    if (statusResponse.status !== 404) {
      throw new Error(`Unowned PaymentIntent status returned ${statusResponse.status}, expected 404.`);
    }
    const statusBody = (await statusResponse.json()) as Record<string, unknown>;
    if (Object.keys(statusBody).some((key) => key !== 'error')) {
      throw new Error('Payment status denial returned fields beyond the generic error.');
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }

  console.log('Removed public payment and lead routes all return 404.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
