/** Shared processing-fee constants and math (client labels + authoritative server totals). */

export const CARD_FEE_PERCENT = 0.029;
export const CARD_FEE_FIXED = 0.3;
export const BANK_FEE_PERCENT = 0.008;
export const BANK_FEE_CAP = 5.0;

export type FeePaymentMethod = 'card' | 'us_bank_account' | 'apple_pay' | string;

export interface ComputeProcessingFeeInput {
  /** Gift principal in dollars (not including fees). */
  principal: number;
  method: FeePaymentMethod;
  coverFees: boolean;
}

export interface ComputeProcessingFeeResult {
  feeAmount: number;
  totalCharged: number;
  principal: number;
}

function roundMoney(n: number): number {
  return Number(n.toFixed(2));
}

/** Card-style processor fee (also used for apple_pay / wallet). */
export function computeCardFee(principal: number): number {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  return roundMoney(principal * CARD_FEE_PERCENT + CARD_FEE_FIXED);
}

/** Stripe US bank account fee: percent of principal, capped. */
export function computeBankFee(principal: number): number {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  return roundMoney(Math.min(BANK_FEE_CAP, principal * BANK_FEE_PERCENT));
}

/**
 * Authoritative fee + total. Client may use this for UI labels;
 * server must recompute before charging or writing the ledger.
 */
export function computeProcessingFee(input: ComputeProcessingFeeInput): ComputeProcessingFeeResult {
  const principal = Number.isFinite(input.principal) ? roundMoney(input.principal) : 0;
  if (!input.coverFees || principal <= 0) {
    return { principal, feeAmount: 0, totalCharged: principal };
  }

  const method = String(input.method || 'card').toLowerCase();
  const bank =
    method === 'us_bank_account' ||
    method === 'bank_account';
  const feeAmount = bank ? computeBankFee(principal) : computeCardFee(principal);

  return {
    principal,
    feeAmount,
    totalCharged: roundMoney(principal + feeAmount),
  };
}

export function formatFeeLabel(feeAmount: number, principal: number): string {
  return `Cover processing fees (+$${feeAmount.toFixed(2)}) so 100% of $${principal.toFixed(2)} reaches ministry`;
}
