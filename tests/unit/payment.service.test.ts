import { afterEach, describe, expect, it } from 'vitest';

import type { PaymentProvider } from '../../src/integrations/payment';
import { getPaymentProvider, setPaymentProvider } from '../../src/integrations/payment';
import { eq } from 'drizzle-orm';

import { db } from '../../src/config/database';
import { payments, users } from '../../src/db/schema';
import { findUserById } from '../../src/db/users';
import { hashPassword, isPremium } from '../../src/models';
import { paymentService } from '../../src/services/payment.service';
import '../helpers';

const original = getPaymentProvider();

function fakeProvider(
  verification: Awaited<ReturnType<PaymentProvider['verify']>>,
): PaymentProvider {
  return {
    name: 'mock',
    initiate: async () => ({ paymentUrl: 'https://pay.example/checkout' }),
    verify: async () => verification,
  };
}

async function createUser() {
  const [user] = await db
    .insert(users)
    .values({
      firstName: 'Awa',
      email: 'awa@example.com',
      password: await hashPassword('Storya2026'),
    })
    .returning();
  if (!user) throw new Error('Utilisateur non créé');
  return user;
}

async function findPayment(transactionId?: string) {
  const query = db.select().from(payments);
  const [payment] = await (transactionId
    ? query.where(eq(payments.transactionId, transactionId))
    : query);
  return payment;
}

afterEach(() => {
  setPaymentProvider(original);
});

describe('paymentService', () => {
  it('refuse un paiement dont le montant confirmé ne correspond pas à la commande', async () => {
    const user = await createUser();
    setPaymentProvider(fakeProvider({ status: 'accepted', amount: 5, currency: 'GNF' }));

    const payment = await paymentService.checkout(user.id, 'premium_yearly');
    const status = await paymentService.status(user.id, payment.transactionId);

    expect(status.status).toBe('refused');
    const saved = await findUserById(user.id);
    expect(saved && isPremium(saved)).toBe(false);
  });

  it('laisse le paiement en attente tant que le prestataire ne confirme pas', async () => {
    const user = await createUser();
    setPaymentProvider(fakeProvider({ status: 'pending' }));

    const payment = await paymentService.checkout(user.id, 'premium_monthly');
    const status = await paymentService.status(user.id, payment.transactionId);

    expect(status.status).toBe('pending');
    expect(status.paymentUrl).toBe('https://pay.example/checkout');
    expect((await findPayment(payment.transactionId))?.fulfilledAt).toBeNull();
  });

  it("annule le paiement si le prestataire ne peut pas l'initialiser", async () => {
    const user = await createUser();
    setPaymentProvider({
      name: 'mock',
      initiate: async () => {
        throw new Error('réseau');
      },
      verify: async () => ({ status: 'pending' }),
    });

    await expect(paymentService.checkout(user.id, 'premium_monthly')).rejects.toThrow('réseau');
    expect((await findPayment())?.status).toBe('cancelled');
  });
});
