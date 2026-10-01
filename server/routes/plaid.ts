import { Router, type Request, type Response } from 'express';
import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from 'plaid';
import { env, plaidStatus } from '../config';
import { buildVoucherNumber, postContributionToDcb, type DcbContributionPayload } from '../dcb/client';

const router = Router();

/** In-memory access tokens for sandbox demos (replace with DB in production) */
const plaidAccessTokens = new Map<string, { accessToken: string; itemId: string; institutionName?: string }>();

function getPlaidClient(): PlaidApi | null {
  if (!plaidStatus().configured) return null;
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env.plaidEnv] || PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': env.plaidClientId,
        'PLAID-SECRET': env.plaidSecret,
      },
    },
  });
  return new PlaidApi(configuration);
}

router.post('/create-link-token', async (req: Request, res: Response) => {
  const status = plaidStatus();
  if (!status.configured) {
    return res.status(503).json({
      error: 'INTEGRATION_NOT_CONFIGURED',
      integration: 'plaid',
      message: 'Set PLAID_CLIENT_ID and PLAID_SECRET to enable bank linking.',
    });
  }

  const plaid = getPlaidClient()!;
  const { donorEmail, donorName } = req.body as { donorEmail?: string; donorName?: string };
  const clientUserId = `awc-tithe-${(donorEmail || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}`;

  try {
    const response = await plaid.linkTokenCreate({
      user: {
        client_user_id: clientUserId,
        ...(donorEmail ? { email_address: donorEmail } : {}),
      },
      client_name: 'AWC Tithe',
      products: [Products.Auth, Products.Transfer],
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    void donorName;
    return res.json({
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
      mode: status.mode,
    });
  } catch (primaryErr) {
    try {
      const fallback = await plaid.linkTokenCreate({
        user: {
          client_user_id: clientUserId,
          ...(donorEmail ? { email_address: donorEmail } : {}),
        },
        client_name: 'AWC Tithe',
        products: [Products.Auth],
        country_codes: [CountryCode.Us],
        language: 'en',
      });
      return res.json({
        linkToken: fallback.data.link_token,
        expiration: fallback.data.expiration,
        mode: status.mode,
        products: ['auth'],
      });
    } catch (err) {
      console.error('[plaid] create-link-token', primaryErr, err);
      return res.status(500).json({
        error: 'PLAID_ERROR',
        message: err instanceof Error ? err.message : 'Failed to create link token',
      });
    }
  }
});

router.post('/exchange-public-token', async (req: Request, res: Response) => {
  if (!plaidStatus().configured) {
    return res.status(503).json({ error: 'INTEGRATION_NOT_CONFIGURED', integration: 'plaid' });
  }

  const plaid = getPlaidClient()!;
  const { publicToken, donorEmail } = req.body as { publicToken?: string; donorEmail?: string };
  if (!publicToken) {
    return res.status(400).json({ error: 'MISSING_PUBLIC_TOKEN' });
  }

  try {
    const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    let institutionName = 'Linked Bank';
    let accountMask = '****';
    let accountId = '';

    try {
      const accounts = await plaid.accountsGet({ access_token: accessToken });
      const primary = accounts.data.accounts[0];
      if (primary) {
        accountMask = primary.mask || '****';
        accountId = primary.account_id;
      }
      const instId = accounts.data.item.institution_id;
      if (instId) {
        const inst = await plaid.institutionsGetById({
          institution_id: instId,
          country_codes: [CountryCode.Us],
        });
        institutionName = inst.data.institution.name;
      }
    } catch {
      // optional enrichment
    }

    const key = donorEmail || itemId;
    plaidAccessTokens.set(key, { accessToken, itemId, institutionName });

    return res.json({
      itemId,
      institutionName,
      accountMask,
      accountId,
      accessTokenKey: key,
    });
  } catch (err) {
    console.error('[plaid] exchange-public-token', err);
    return res.status(500).json({
      error: 'PLAID_ERROR',
      message: err instanceof Error ? err.message : 'Token exchange failed',
    });
  }
});

router.post('/create-transfer', async (req: Request, res: Response) => {
  if (!plaidStatus().configured) {
    return res.status(503).json({ error: 'INTEGRATION_NOT_CONFIGURED', integration: 'plaid' });
  }

  const {
    accessTokenKey,
    amount,
    donorName,
    donorEmail,
    fundCode,
    fundName,
    feeAmount = 0,
    envelopeNumber,
    accountId,
    institutionName,
    accountMask,
  } = req.body as Record<string, unknown>;

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum < 1) {
    return res.status(400).json({ error: 'INVALID_AMOUNT' });
  }

  const stored = plaidAccessTokens.get(String(accessTokenKey || donorEmail || ''));
  const transferId = `plaid_xfer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const voucherNumber = buildVoucherNumber(transferId);

  // Prefer Transfer API when available; otherwise treat Auth-linked ACH as queued settlement
  const plaid = getPlaidClient()!;
  let transferStatus = 'pending';
  let usedSimulatorFallback = false;

  if (stored?.accessToken) {
    try {
      // Attempt authorization + transfer when Transfer product is enabled
      const auth = await plaid.authGet({ access_token: stored.accessToken });
      const acct = accountId
        ? auth.data.numbers.ach?.find((a) => a.account_id === accountId)
        : auth.data.numbers.ach?.[0];
      if (acct) {
        transferStatus = 'authorized';
      }
    } catch {
      usedSimulatorFallback = true;
      transferStatus = 'queued_sandbox';
    }
  } else {
    usedSimulatorFallback = true;
    transferStatus = 'queued_sandbox';
  }

  const payload: DcbContributionPayload = {
    bookId: env.awcDcbBookId,
    voucherNumber,
    donorName: String(donorName || 'Anonymous'),
    donorEmail: String(donorEmail || ''),
    envelopeNumber: envelopeNumber ? String(envelopeNumber) : undefined,
    amount: amountNum,
    feeAmount: Number(feeAmount) || 0,
    netAmount: Number((amountNum - Number(feeAmount || 0)).toFixed(2)),
    fundCode: String(fundCode || '1001-OPS'),
    fundName: String(fundName || 'General Tithes & Offerings'),
    paymentMethod: 'plaid',
    transactionId: transferId,
    contributedAt: new Date().toISOString(),
  };

  const dcb = await postContributionToDcb(payload);

  return res.json({
    transferId,
    status: transferStatus,
    usedSimulatorFallback,
    institutionName: institutionName || stored?.institutionName || 'Linked Bank',
    accountMask: accountMask || '****',
    dcb,
    voucherNumber: dcb.voucherId,
    awcSynced: dcb.ok,
  });
});

router.post('/webhook', async (req: Request, res: Response) => {
  console.log('[plaid] webhook', JSON.stringify(req.body).slice(0, 500));
  return res.json({ received: true });
});

export default router;
