import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  PaymentVerification,
} from './PaymentProvider';

/**
 * Développement / tests uniquement (refusé en production par config/env.ts) :
 * tout paiement est immédiatement accepté.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly amounts = new Map<string, { amount: number; currency: string }>();

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    this.amounts.set(input.transactionId, { amount: input.amount, currency: input.currency });
    const separator = input.returnUrl.includes('?') ? '&' : '?';
    return {
      paymentUrl: `${input.returnUrl}${separator}transaction_id=${input.transactionId}&mock=1`,
    };
  }

  async verify(transactionId: string): Promise<PaymentVerification> {
    const known = this.amounts.get(transactionId);
    return { status: 'accepted', ...known, paymentMethod: 'MOCK', paidAt: new Date() };
  }
}
