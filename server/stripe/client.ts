import Stripe from 'stripe';
import { env } from '../config';

/** Pin basil so a stripe-node upgrade cannot silently change Invoice/Subscription shapes. */
export const STRIPE_API_VERSION = '2025-08-27.basil' as const;

export function createStripeClient(secretKey = env.stripeSecretKey): Stripe {
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

export function paymentIntentIdFromClientSecret(clientSecret: string | null | undefined): string | undefined {
  if (!clientSecret) return undefined;
  const [id] = clientSecret.split('_secret_');
  return id?.startsWith('pi_') ? id : undefined;
}
