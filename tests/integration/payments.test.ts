import { describe, expect, it } from 'vitest';

import { payments } from '../../src/db/schema';
import { findUserById } from '../../src/db/users';
import { isPremium } from '../../src/models';
import { paymentService } from '../../src/services/payment.service';
import { api, countRows, outbox, registerUser } from '../helpers';

describe('Paiements Premium', () => {
  it('active Premium une seule fois même si webhook et vérification arrivent ensemble', async () => {
    const session = await registerUser();

    const checkout = await api()
      .post('/api/v1/payments/checkout')
      .set(session.auth)
      .send({ offer: 'premium_monthly' })
      .expect(201);
    const { transactionId, paymentUrl, amount, currency, status } = checkout.body.data as Record<
      string,
      string | number
    >;
    expect({ amount, currency, status }).toEqual({
      amount: 30_000,
      currency: 'GNF',
      status: 'pending',
    });
    expect(paymentUrl).toContain(`transaction_id=${transactionId as string}`);

    await Promise.all([
      paymentService.handleNotification('mock', transactionId as string),
      api()
        .get(`/api/v1/payments/${transactionId as string}`)
        .set(session.auth)
        .expect(200),
      api()
        .get(`/api/v1/payments/${transactionId as string}`)
        .set(session.auth)
        .expect(200),
    ]);

    const user = await findUserById(session.userId);
    expect(user && isPremium(user)).toBe(true);
    const days = ((user?.subscriptionExpiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect(outbox.outbox.filter((m) => m.subject.includes('Premium'))).toHaveLength(1);

    const me = await api().get('/api/v1/auth/me').set(session.auth).expect(200);
    expect(me.body.data.subscription).toMatchObject({ plan: 'premium', isActive: true });
  });

  it('cumule la durée lors d’un renouvellement', async () => {
    const session = await registerUser();
    for (const offer of ['premium_monthly', 'premium_monthly']) {
      const res = await api()
        .post('/api/v1/payments/checkout')
        .set(session.auth)
        .send({ offer })
        .expect(201);
      await api()
        .get(`/api/v1/payments/${res.body.data.transactionId as string}`)
        .set(session.auth)
        .expect(200);
    }
    const user = await findUserById(session.userId);
    const days = ((user?.subscriptionExpiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(60);
  });

  it('ignore les notifications inconnues et répond toujours 200 au prestataire', async () => {
    await api()
      .post('/api/v1/payments/cinetpay/notify')
      .type('form')
      .send({ cpm_trans_id: 'STYINCONNU1234567' })
      .expect(200);
    await api()
      .post('/api/v1/payments/cinetpay/notify')
      .type('form')
      .send({ cpm_trans_id: '$gt' })
      .expect(200);
    expect(await countRows(payments)).toBe(0);
  });

  it("ne donne pas accès au paiement d'un autre utilisateur", async () => {
    const a = await registerUser('a@example.com');
    const b = await registerUser('b@example.com');
    const res = await api()
      .post('/api/v1/payments/checkout')
      .set(a.auth)
      .send({ offer: 'premium_yearly' })
      .expect(201);
    await api()
      .get(`/api/v1/payments/${res.body.data.transactionId as string}`)
      .set(b.auth)
      .expect(404);
  });

  it('refuse une offre inconnue', async () => {
    const session = await registerUser();
    await api()
      .post('/api/v1/payments/checkout')
      .set(session.auth)
      .send({ offer: 'gratuit_a_vie' })
      .expect(400);
  });
});
