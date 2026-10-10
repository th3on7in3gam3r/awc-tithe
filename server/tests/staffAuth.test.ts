process.env.NODE_ENV = 'test';
process.env.STAFF_TEST_MODE = '1';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.BETTER_AUTH_SECRET = 'staff-auth-test-secret-at-least-32-characters';

async function main() {
  const express = (await import('express')).default;
  const staffRoutes = (await import('../routes/staff')).default;
  const giftsRoutes = (await import('../routes/gifts')).default;

  const app = express();
  app.use(express.json());
  app.use('/api/staff', staffRoutes);
  app.use('/api/gifts', giftsRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start test server');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let failed = 0;

  async function request(path: string, identity?: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      headers: identity ? { Cookie: `awc_staff_test=${identity}` } : {},
    });
  }

  try {
    const staffOnlyPaths = [
      '/api/staff/session',
      '/api/staff/me',
      '/api/staff/accounts',
      '/api/staff/2fa/audit',
      '/api/staff/invites',
      '/api/staff/invites/accept',
      '/api/staff/logout',
      '/api/gifts?limit=10',
    ];
    for (const path of staffOnlyPaths) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: path.includes('/2fa/') || path.includes('/invites') || path.includes('/logout') ? 'POST' : 'GET',
        headers: {
          Cookie: 'awc_staff_test=donor',
          'Content-Type': 'application/json',
        },
        body: path.endsWith('/accept') ? JSON.stringify({ token: 'invalid' }) : undefined,
      });
      if (response.status !== 403) {
        console.error(`FAIL donor access ${path}: expected 403, got ${response.status}`);
        failed++;
      }
    }

    const enrollSession = await request('/api/staff/session', 'admin-unenrolled');
    const enrollBody = (await enrollSession.json()) as { needsEnrollment?: boolean };
    if (enrollSession.status !== 200 || enrollBody.needsEnrollment !== true) {
      console.error('FAIL un-enrolled admin should reach the enrollment status screen only');
      failed++;
    }
    for (const path of ['/api/staff/me', '/api/staff/accounts', '/api/gifts?limit=10']) {
      const response = await request(path, 'admin-unenrolled');
      if (response.status !== 403) {
        console.error(`FAIL un-enrolled admin access ${path}: expected 403, got ${response.status}`);
        failed++;
      }
    }

    const activeStaff = await request('/api/staff/me', 'staff');
    if (activeStaff.status !== 200) {
      console.error(`FAIL active staff session: expected 200, got ${activeStaff.status}`);
      failed++;
    }

    const deactivated = await request('/api/staff/me', 'deactivated');
    if (deactivated.status !== 403) {
      console.error(`FAIL deactivated staff session: expected 403, got ${deactivated.status}`);
      failed++;
    }

    const adminAccounts = await request('/api/staff/accounts', 'admin');
    if (adminAccounts.status !== 200) {
      console.error(`FAIL enrolled admin access: expected 200, got ${adminAccounts.status}`);
      failed++;
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }

  if (failed) process.exitCode = 1;
  else console.log('Staff auth, role, enrollment, and deactivation checks passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
