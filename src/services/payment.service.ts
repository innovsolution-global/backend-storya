import crypto from 'node:crypto';

import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { db } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { PremiumOfferId } from '../constants';
import { PREMIUM_OFFERS } from '../constants';
import { payments } from '../db/schema';
import { findUserById, updateUser } from '../db/users';
import { localize, resolveUserLang } from '../i18n';
import { getPaymentProvider } from '../integrations/payment';
import type { IPayment } from '../models';
import { isPremium } from '../models';
import { AppError } from '../utils/AppError';
import type { PaginationInput } from '../utils/pagination';
import { paginationMeta, skipFor } from '../utils/pagination';
import { emailService } from './email.service';
import { notificationService } from './notification.service';
import { promotionService } from './promotion.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export const ADMIN_ALREADY_PREMIUM =
  'Les administrateurs ont Premium d’office : aucun paiement n’est nécessaire.';

export interface PaymentDto {
  transactionId: string;
  offer: PremiumOfferId;
  amount: number;
  currency: string;
  status: IPayment['status'];
  provider: string;
  paymentUrl: string | null;
  paymentMethod: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

function toPaymentDto(payment: IPayment): PaymentDto {
  return {
    transactionId: payment.transactionId,
    offer: payment.offer,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    paymentUrl: payment.status === 'pending' ? (payment.paymentUrl ?? null) : null,
    paymentMethod: payment.paymentMethod ?? null,
    paidAt: payment.paidAt ?? null,
    createdAt: payment.createdAt,
  };
}

/** Identifiant alphanumérique unique exigé par CinetPay. */
function newTransactionId(): string {
  return `STY${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`.toUpperCase();
}

/**
 * Crédite l'abonnement une seule fois par paiement, même si le webhook
 * et la vérification côté app arrivent en même temps.
 */
async function fulfill(payment: IPayment): Promise<void> {
  const fulfilledAt = new Date();
  const [claimed] = await db
    .update(payments)
    .set({ fulfilledAt })
    .where(
      and(
        eq(payments.id, payment.id),
        eq(payments.status, 'accepted'),
        isNull(payments.fulfilledAt),
      ),
    )
    .returning({ id: payments.id });
  if (!claimed) return;
  payment.fulfilledAt = fulfilledAt;

  const user = payment.userId ? await findUserById(payment.userId) : undefined;
  if (!user) return;
  const offer = PREMIUM_OFFERS[payment.offer];
  const base =
    isPremium(user) && user.subscriptionExpiresAt
      ? user.subscriptionExpiresAt.getTime()
      : Date.now();
  const expiresAt = new Date(base + offer.durationDays * DAY_MS);
  await updateUser(user, { subscriptionPlan: 'premium', subscriptionExpiresAt: expiresAt });
  if (payment.promotionId) await promotionService.countUse(payment.promotionId);
  logger.info(
    { userId: user.id, transactionId: payment.transactionId },
    'Abonnement Premium activé',
  );
  await notificationService.premiumActivated(user.id, expiresAt);
  await emailService.sendPremiumConfirmation(
    user.email,
    user.firstName,
    expiresAt,
    resolveUserLang(user.settings?.language),
  );
}

/** Enregistre les changements du paiement en base et sur l'objet en mémoire. */
async function updatePayment(payment: IPayment, changes: Partial<Omit<IPayment, 'id'>>) {
  Object.assign(payment, changes);
  await db.update(payments).set(changes).where(eq(payments.id, payment.id));
}

/** Interroge le prestataire et applique le statut confirmé. */
async function synchronize(payment: IPayment): Promise<IPayment> {
  if (payment.status !== 'pending') {
    if (payment.status === 'accepted' && !payment.fulfilledAt) await fulfill(payment);
    return payment;
  }

  const verification = await getPaymentProvider().verify(payment.transactionId);
  if (verification.status === 'pending') return payment;

  // Garde-fou : le montant confirmé doit correspondre à celui de la commande.
  if (
    verification.status === 'accepted' &&
    verification.amount !== undefined &&
    (verification.amount !== payment.amount ||
      (verification.currency && verification.currency !== payment.currency))
  ) {
    logger.error(
      {
        transactionId: payment.transactionId,
        expected: payment.amount,
        received: verification.amount,
      },
      'Montant de paiement incohérent',
    );
    await updatePayment(payment, { status: 'refused', operatorMessage: 'Montant incohérent' });
    return payment;
  }

  await updatePayment(payment, {
    status: verification.status,
    paymentMethod: verification.paymentMethod ?? null,
    operatorMessage: verification.message ?? null,
    ...(verification.status === 'accepted' ? { paidAt: verification.paidAt ?? new Date() } : {}),
  });
  if (verification.status === 'accepted') await fulfill(payment);
  return payment;
}

export const paymentService = {
  /** Offres avec leur libellé dans la langue de la requête et la réduction en cours. */
  async offers() {
    return Promise.all(
      Object.values(PREMIUM_OFFERS).map(async (offer) => {
        const discount = await promotionService.discountFor(offer.id, offer.amount);
        return {
          ...offer,
          label: localize(offer.label),
          amount: discount?.amount ?? offer.amount,
          originalAmount: discount ? offer.amount : null,
          discountPercent: discount?.percent ?? null,
          promotion: discount
            ? { title: discount.promotion.title, endsAt: discount.promotion.endsAt ?? null }
            : null,
        };
      }),
    );
  },

  async checkout(userId: string, offerId: PremiumOfferId): Promise<PaymentDto> {
    const user = await findUserById(userId);
    if (!user) throw AppError.unauthorized();
    if (user.role === 'admin') throw AppError.badRequest(ADMIN_ALREADY_PREMIUM);
    const offer = PREMIUM_OFFERS[offerId];
    const provider = getPaymentProvider();
    const transactionId = newTransactionId();
    // Offre limitée en cours : le prix réduit est figé au moment du paiement.
    const discount = await promotionService.discountFor(offer.id, offer.amount);
    const amount = discount?.amount ?? offer.amount;

    const [payment] = await db
      .insert(payments)
      .values({
        userId: user.id,
        provider: provider.name,
        transactionId,
        offer: offer.id,
        amount,
        currency: offer.currency,
        promotionId: discount?.promotion.id ?? null,
        originalAmount: discount ? offer.amount : null,
      })
      .returning();
    if (!payment) throw new Error('Insertion paiement sans résultat');

    try {
      const { paymentUrl } = await provider.initiate({
        transactionId,
        amount,
        currency: offer.currency,
        description: `Storya ${offer.label}`,
        customer: { id: user.id, email: user.email, firstName: user.firstName },
        notifyUrl: new URL(`/api/v1/payments/${provider.name}/notify`, env.APP_URL).toString(),
        returnUrl: env.PAYMENT_RETURN_URL,
      });
      await updatePayment(payment, { paymentUrl });
    } catch (error) {
      await updatePayment(payment, {
        status: 'cancelled',
        operatorMessage: 'Initialisation impossible',
      });
      throw error;
    }
    return toPaymentDto(payment);
  },

  /** Appelé par l'app au retour de la page de paiement. */
  async status(userId: string, transactionId: string): Promise<PaymentDto> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.transactionId, transactionId), eq(payments.userId, userId)))
      .limit(1);
    if (!payment) throw AppError.notFound('Paiement introuvable.');
    return toPaymentDto(await synchronize(payment));
  },

  async history(userId: string, pagination: PaginationInput) {
    const filter = eq(payments.userId, userId);
    const [items, [total]] = await Promise.all([
      db
        .select()
        .from(payments)
        .where(filter)
        .orderBy(desc(payments.createdAt))
        .offset(skipFor(pagination))
        .limit(pagination.limit),
      db.select({ value: count() }).from(payments).where(filter),
    ]);
    return { items: items.map(toPaymentDto), meta: paginationMeta(pagination, total?.value ?? 0) };
  },

  /**
   * Webhook du prestataire : son contenu n'est pas considéré comme fiable,
   * il déclenche seulement une vérification auprès de l'API du prestataire.
   */
  async handleNotification(providerName: string, transactionId: string): Promise<void> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.transactionId, transactionId), eq(payments.provider, providerName)))
      .limit(1);
    if (!payment) {
      logger.warn({ transactionId, providerName }, 'Notification de paiement inconnue');
      return;
    }
    await synchronize(payment);
  },
};
