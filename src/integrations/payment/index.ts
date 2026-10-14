import { env } from '../../config/env';
import { CinetPayProvider } from './CinetPayProvider';
import { MockPaymentProvider } from './MockPaymentProvider';
import type { PaymentProvider } from './PaymentProvider';

export type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  PaymentVerification,
} from './PaymentProvider';

let provider: PaymentProvider | undefined;

function createProvider(): PaymentProvider {
  if (env.PAYMENT_PROVIDER === 'cinetpay') {
    // Présence des clés garantie par la validation de config/env.ts.
    return new CinetPayProvider(env.CINETPAY_API_KEY ?? '', env.CINETPAY_SITE_ID ?? '');
  }
  return new MockPaymentProvider();
}

export function getPaymentProvider(): PaymentProvider {
  provider ??= createProvider();
  return provider;
}

export function setPaymentProvider(next: PaymentProvider): void {
  provider = next;
}
