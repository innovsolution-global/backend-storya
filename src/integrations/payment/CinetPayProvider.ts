import type { AxiosInstance } from 'axios';
import axios from 'axios';

import { logger } from '../../config/logger';
import type { PaymentStatus } from '../../constants';
import { AppError } from '../../utils/AppError';
import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  PaymentVerification,
} from './PaymentProvider';

interface CinetPayEnvelope<T> {
  code?: string;
  message?: string;
  description?: string;
  data?: T;
}

interface CinetPayCheckData {
  amount?: string | number;
  currency?: string;
  status?: string;
  payment_method?: string;
  payment_date?: string;
}

function mapStatus(status: string | undefined): PaymentStatus {
  switch (status?.toUpperCase()) {
    case 'ACCEPTED':
      return 'accepted';
    case 'REFUSED':
      return 'refused';
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
}

/**
 * CinetPay (Mobile Money Orange, MTN, Moov, Wave + cartes) — API Checkout v2.
 * https://docs.cinetpay.com/api/1.0-fr/checkout/initialisation
 */
export class CinetPayProvider implements PaymentProvider {
  readonly name = 'cinetpay';
  private readonly http: AxiosInstance;

  constructor(
    private readonly apiKey: string,
    private readonly siteId: string,
  ) {
    this.http = axios.create({
      baseURL: 'https://api-checkout.cinetpay.com/v2',
      timeout: 30_000,
      validateStatus: () => true,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const response = await this.http.post<CinetPayEnvelope<{ payment_url?: string }>>('/payment', {
      apikey: this.apiKey,
      site_id: this.siteId,
      transaction_id: input.transactionId,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      notify_url: input.notifyUrl,
      return_url: input.returnUrl,
      channels: 'ALL',
      lang: 'FR',
      metadata: input.customer.id,
      customer_id: input.customer.id,
      customer_name: input.customer.firstName,
      customer_email: input.customer.email,
    });

    const paymentUrl = response.data?.data?.payment_url;
    if (response.data?.code !== '201' || !paymentUrl) {
      logger.error(
        { status: response.status, body: response.data },
        'Initialisation CinetPay échouée',
      );
      throw AppError.serviceUnavailable(
        "Le paiement n'a pas pu être initialisé. Réessayez dans un instant.",
      );
    }
    return { paymentUrl };
  }

  async verify(transactionId: string): Promise<PaymentVerification> {
    const response = await this.http.post<CinetPayEnvelope<CinetPayCheckData>>('/payment/check', {
      apikey: this.apiKey,
      site_id: this.siteId,
      transaction_id: transactionId,
    });
    const data = response.data?.data;
    if (!data) {
      logger.warn(
        { status: response.status, body: response.data, transactionId },
        'Vérification CinetPay sans données',
      );
      return { status: 'pending', message: response.data?.message };
    }
    const status = mapStatus(data.status);
    return {
      status,
      amount: data.amount !== undefined ? Number(data.amount) : undefined,
      currency: data.currency,
      paymentMethod: data.payment_method,
      message: response.data?.message,
      paidAt: status === 'accepted' && data.payment_date ? new Date(data.payment_date) : undefined,
    };
  }
}
