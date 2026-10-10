process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';

async function main() {
  const roles = await import('../auth/staffRoles');
  const { listActivityAudit } = await import('../audit/activity');
  roles.__resetStaffRoleMemoryForTests();

  const bootstrapInvite = await roles.createStaffInvite({
    email: 'admin@example.com',
    role: 'admin',
    invitedBy: null,
    actorLabel: 'bootstrap',
    ipAddress: 'local-cli',
  });
  const admin = await roles.acceptStaffInvite({
    token: bootstrapInvite.token,
    userId: 'user-admin',
    email: 'admin@example.com',
    ipAddress: '203.0.113.10',
  });

  const staffInvite = await roles.createStaffInvite({
    email: 'staff@example.com',
    role: 'staff',
    invitedBy: admin.userId,
    actorLabel: admin.email,
    ipAddress: '203.0.113.10',
  });
  const staff = await roles.acceptStaffInvite({
    token: staffInvite.token,
    userId: 'user-staff',
    email: 'staff@example.com',
    ipAddress: '203.0.113.11',
  });

  await roles.updateStaffRole({
    targetId: staff.id,
    newRole: 'admin',
    actorUserId: admin.userId,
    actorLabel: admin.email,
    ipAddress: '203.0.113.10',
  });
  await roles.updateStaffRole({
    targetId: admin.id,
    newRole: 'staff',
    actorUserId: staff.userId,
    actorLabel: staff.email,
    ipAddress: '203.0.113.11',
  });

  for (const operation of [
    () =>
      roles.updateStaffRole({
        targetId: staff.id,
        newRole: 'staff',
        actorUserId: staff.userId,
        actorLabel: staff.email,
        ipAddress: '203.0.113.11',
      }),
    () =>
      roles.deactivateStaffAccount({
        targetId: staff.id,
        actorUserId: staff.userId,
        actorLabel: staff.email,
        ipAddress: '203.0.113.11',
      }),
  ]) {
    try {
      await operation();
      throw new Error('Expected last active admin protection');
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'LAST_ADMIN') throw error;
    }
  }

  await roles.resetStaffTwoFactor({
    targetId: admin.id,
    actorUserId: staff.userId,
    actorLabel: staff.email,
    ipAddress: '203.0.113.11',
  });
  await roles.deactivateStaffAccount({
    targetId: admin.id,
    actorUserId: staff.userId,
    actorLabel: staff.email,
    ipAddress: '203.0.113.11',
  });

  const audit = await listActivityAudit(100);
  const requiredActions = [
    ['STAFF_INVITE', admin.userId, '203.0.113.10'],
    ['STAFF_INVITE_ACCEPTED', admin.userId, '203.0.113.10'],
    ['STAFF_INVITE_ACCEPTED', staff.userId, '203.0.113.11'],
    ['STAFF_ROLE_CHANGE', admin.userId, '203.0.113.10'],
    ['STAFF_ROLE_CHANGE', staff.userId, '203.0.113.11'],
    ['STAFF_2FA_RESET', staff.userId, '203.0.113.11'],
    ['STAFF_DEACTIVATED', staff.userId, '203.0.113.11'],
  ] as const;
  for (const [action, actorId, ipAddress] of requiredActions) {
    if (!audit.some((entry) => entry.action === action && entry.actorId === actorId && entry.ipAddress === ipAddress)) {
      throw new Error(`Missing actor/IP audit entry for ${action}`);
    }
  }

  try {
    await roles.acceptStaffInvite({
      token: staffInvite.token,
      userId: 'user-staff',
      email: 'staff@example.com',
      ipAddress: '203.0.113.11',
    });
    throw new Error('Expected single-use invite rejection');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('invalid or expired')) throw error;
  }

  roles.__resetStaffRoleMemoryForTests();
  const claimInvite = await roles.createStaffInvite({
    email: 'claim@example.com',
    role: 'admin',
    invitedBy: null,
    actorLabel: 'bootstrap',
    ipAddress: 'local-cli',
  });
  const claimed = await roles.claimPendingStaffAccess({
    userId: 'user-claim',
    email: 'claim@example.com',
    ipAddress: '198.51.100.10',
  });
  if (!claimed || claimed.role !== 'admin' || claimed.userId !== 'user-claim') {
    throw new Error('Expected unused invite to be claimed after OTP without the invite URL');
  }
  const rebound = await roles.claimPendingStaffAccess({
    userId: 'user-claim-2',
    email: 'claim@example.com',
    ipAddress: '198.51.100.11',
  });
  if (!rebound || rebound.userId !== 'user-claim-2') {
    throw new Error('Expected staff row to rebind to the new Staff Portal user id');
  }
  const stranger = await roles.claimPendingStaffAccess({
    userId: 'user-stranger',
    email: 'nobody@example.com',
    ipAddress: '198.51.100.12',
  });
  if (stranger) throw new Error('Expected uninvited email to stay unclaimed');
  void claimInvite;

  console.log('Staff invites, audit attribution, role changes, and last-admin checks passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
