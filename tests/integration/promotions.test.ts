import { describe, expect, it } from 'vitest';

import { findUserById } from '../../src/db/users';
import { isPremium } from '../../src/models';
import { paymentService } from '../../src/services/payment.service';
import type { TestSession } from '../helpers';
import { api, makeAdmin, registerUser } from '../helpers';

async function registerAdmin(): Promise<TestSession> {
  const session = await registerUser('admin@example.com', 'Admin');
  await makeAdmin(session.userId);
  return session;
}

const DAY = 24 * 60 * 60 * 1000;

describe('Promotions', () => {
  it('une offre limitée réduit le prix affiché et le montant payé', async () => {
    const admin = await registerAdmin();
    await api()
      .post('/api/v1/admin/promotions')
      .set(admin.auth)
      .send({
        kind: 'discount',
        title: 'Fin d’année',
        discountPercent: 20,
        offerIds: ['premium_yearly'],
        endsAt: new Date(Date.now() + 10 * DAY).toISOString(),
      })
      .expect(201);

    const offers = await api().get('/api/v1/payments/offers').expect(200);
    const list = offers.body.data as {
      id: string;
      amount: number;
      originalAmount: number | null;
      discountPercent: number | null;
    }[];
    expect(list.find((o) => o.id === 'premium_yearly')).toMatchObject({
      amount: 240_000,
      originalAmount: 300_000,
      discountPercent: 20,
    });
    expect(list.find((o) => o.id === 'premium_monthly')).toMatchObject({
      amount: 30_000,
      discountPercent: null,
    });

    const awa = await registerUser('awa@example.com', 'Awa');
    const checkout = await api()
      .post('/api/v1/payments/checkout')
      .set(awa.auth)
      .send({ offer: 'premium_yearly' })
      .expect(201);
    expect(checkout.body.data.amount).toBe(240_000);
    await paymentService.handleNotification(
      'mock',
      (checkout.body.data as { transactionId: string }).transactionId,
    );

    const promos = await api().get('/api/v1/admin/promotions').set(admin.auth).expect(200);
    expect(promos.body.data[0]).toMatchObject({ kind: 'discount', status: 'active', uses: 1 });
  });

  it('un essai gratuit rend Premium les nouveaux inscrits pendant la période', async () => {
    const admin = await registerAdmin();
    const created = await api()
      .post('/api/v1/admin/promotions')
      .set(admin.auth)
      .send({ kind: 'trial', title: 'Bienvenue', trialDays: 7 })
      .expect(201);

    const awa = await registerUser('awa@example.com', 'Awa');
    const user = await findUserById(awa.userId);
    expect(user && isPremium(user)).toBe(true);
    const days = ((user?.subscriptionExpiresAt?.getTime() ?? 0) - Date.now()) / DAY;
    expect(Math.round(days)).toBe(7);

    // En pause : plus d'essai.
    await api()
      .patch(`/api/v1/admin/promotions/${(created.body.data as { id: string }).id}`)
      .set(admin.auth)
      .send({ isActive: false })
      .expect(200);
    const moussa = await registerUser('moussa@example.com', 'Moussa');
    const other = await findUserById(moussa.userId);
    expect(other && isPremium(other)).toBe(false);
  });

  it('les bannières en cours sont visibles dans l’app, pas les programmées', async () => {
    const admin = await registerAdmin();
    await api()
      .post('/api/v1/admin/promotions')
      .set(admin.auth)
      .send({
        kind: 'banner',
        title: 'Nouveau : style Aquarelle',
        ctaLabel: 'Essayer',
        ctaTarget: 'create',
      })
      .expect(201);
    await api()
      .post('/api/v1/admin/promotions')
      .set(admin.auth)
      .send({
        kind: 'banner',
        title: 'Bientôt',
        startsAt: new Date(Date.now() + 5 * DAY).toISOString(),
      })
      .expect(201);

    const awa = await registerUser('awa@example.com', 'Awa');
    const banners = await api().get('/api/v1/promotions/banners').set(awa.auth).expect(200);
    expect((banners.body.data as { title: string }[]).map((b) => b.title)).toEqual([
      'Nouveau : style Aquarelle',
    ]);

    // Réservé aux administrateurs ; dates incohérentes refusées.
    await api().get('/api/v1/admin/promotions').set(awa.auth).expect(403);
    await api()
      .post('/api/v1/admin/promotions')
      .set(admin.auth)
      .send({
        kind: 'banner',
        title: 'Erreur',
        startsAt: new Date(Date.now() + DAY).toISOString(),
        endsAt: new Date().toISOString(),
      })
      .expect(400);
  });
});
