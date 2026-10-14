import type { PaymentStatus } from '../../constants';

export interface InitiatePaymentInput {
  transactionId: string;
  amount: number;
  currency: string;
  description: string;
  customer: { id: string; email: string; firstName: string };
  notifyUrl: string;
  returnUrl: string;
}

export interface InitiatePaymentResult {
  /** Page de paiement hébergée par le prestataire, à ouvrir dans l'app. */
  paymentUrl: string;
}

export interface PaymentVerification {
  status: PaymentStatus;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  message?: string;
  paidAt?: Date;
}

/**
 * Contrat commun des prestataires de paiement (CinetPay, Stripe, PayDunya…).
 * Le statut d'un paiement est toujours confirmé via `verify` auprès du prestataire,
 * jamais à partir des seules données reçues par webhook.
 */
export interface PaymentProvider {
  readonly name: string;
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verify(transactionId: string): Promise<PaymentVerification>;
}
