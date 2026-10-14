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

describe('Back-office', () => {
  it('refuse les routes admin à un utilisateur ordinaire', async () => {
    const user = await registerUser();
    await api().get('/api/v1/admin/stats/overview').set(user.auth).expect(403);
    await api().get('/api/v1/admin/stats/overview').expect(401);
  });

  it('résume utilisateurs, paiements et revenus', async () => {
    const admin = await registerAdmin();
    const awa = await registerUser('awa@example.com', 'Awa');

    // Un paiement accepté, un autre resté en attente.
    const checkout = await api()
      .post('/api/v1/payments/checkout')
      .set(awa.auth)
      .send({ offer: 'premium_monthly' })
      .expect(201);
    await paymentService.handleNotification(
      'mock',
      (checkout.body.data as { transactionId: string }).transactionId,
    );
    await api()
      .post('/api/v1/payments/checkout')
      .set(awa.auth)
      .send({ offer: 'premium_yearly' })
      .expect(201);

    const overview = await api().get('/api/v1/admin/stats/overview').set(admin.auth).expect(200);
    const data = overview.body.data as {
      users: { total: number; premium: number; admins: number; new7d: number };
      payments: { revenueTotal: number; byStatus: Record<string, number>; currency: string };
      videos: { total: number; successRate: number | null };
    };
    // Les administrateurs ne sont pas des utilisateurs de l'app : comptés à part.
    expect(data.users).toMatchObject({ total: 1, premium: 1, admins: 1, new7d: 1 });
    expect(data.payments.revenueTotal).toBe(30_000);
    expect(data.payments.byStatus).toMatchObject({ accepted: 1, pending: 1 });
    expect(data.videos).toMatchObject({ total: 0, successRate: null });

    const series = await api()
      .get('/api/v1/admin/stats/timeseries?days=7')
      .set(admin.auth)
      .expect(200);
    const days = series.body.data as { date: string; signups: number; revenue: number }[];
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toMatchObject({ signups: 1, revenue: 30_000 });

    const payments = await api().get('/api/v1/admin/payments?q=awa').set(admin.auth).expect(200);
    const list = payments.body.data as {
      items: { user: { email: string } | null; status: string }[];
      acceptedAmount: number;
    };
    expect(list.items).toHaveLength(2);
    expect(list.items[0]?.user?.email).toBe('awa@example.com');
    expect(list.acceptedAmount).toBe(30_000);

    const activity = await api().get('/api/v1/admin/activity').set(admin.auth).expect(200);
    const kinds = (activity.body.data as { kind: string }[]).map((event) => event.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['signup', 'payment_accepted', 'payment_pending']),
    );
  });

  it('affiche la fiche d’un utilisateur et gère son Premium', async () => {
    const admin = await registerAdmin();
    const awa = await registerUser('awa@example.com', 'Awa');

    const users = await api().get('/api/v1/admin/users').set(admin.auth).expect(200);
    expect(users.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'awa@example.com', videoCount: 0 }),
      ]),
    );

    const granted = await api()
      .patch(`/api/v1/admin/users/${awa.userId}/subscription`)
      .set(admin.auth)
      .send({ plan: 'premium', days: 30 })
      .expect(200);
    expect(granted.body.data).toMatchObject({ subscription: { plan: 'premium', isActive: true } });

    const detail = await api().get(`/api/v1/admin/users/${awa.userId}`).set(admin.auth).expect(200);
    expect(detail.body.data).toMatchObject({
      user: { email: 'awa@example.com' },
      totalPaid: 0,
      videos: [],
      payments: [],
    });

    await api()
      .patch(`/api/v1/admin/users/${awa.userId}/subscription`)
      .set(admin.auth)
      .send({ plan: 'free' })
      .expect(200);
    const user = await findUserById(awa.userId);
    expect(user && isPremium(user)).toBe(false);

    await api()
      .patch(`/api/v1/admin/users/${awa.userId}/subscription`)
      .set(admin.auth)
      .send({ plan: 'premium' })
      .expect(400);
  });

  it('gère les administrateurs à part des utilisateurs mobiles', async () => {
    const admin = await registerAdmin();
    await registerUser('awa@example.com', 'Awa');

    // « Utilisateurs » : uniquement les comptes de l'app mobile.
    const users = await api().get('/api/v1/admin/users').set(admin.auth).expect(200);
    expect((users.body.data as { email: string }[]).map((u) => u.email)).toEqual([
      'awa@example.com',
    ]);
    await api().get(`/api/v1/admin/users/${admin.userId}`).set(admin.auth).expect(404);

    // Ajout d'un administrateur, connectable aussitôt.
    const created = await api()
      .post('/api/v1/admin/admins')
      .set(admin.auth)
      .send({ firstName: 'Mariam', email: 'mariam@example.com', password: 'Storya2026' })
      .expect(201);
    const mariamId = (created.body.data as { id: string }).id;
    expect(created.body.data).toMatchObject({ role: 'admin', isEmailVerified: true });
    await api()
      .post('/api/v1/admin/admins')
      .set(admin.auth)
      .send({ firstName: 'Awa', email: 'awa@example.com', password: 'Storya2026' })
      .expect(409);

    const admins = await api().get('/api/v1/admin/admins').set(admin.auth).expect(200);
    expect((admins.body.data as { email: string }[]).map((a) => a.email).sort()).toEqual([
      'admin@example.com',
      'mariam@example.com',
    ]);

    // Premium d'office dans l'app mobile, sans paiement.
    const login = await api()
      .post('/api/v1/auth/login')
      .set('X-Client-Type', 'mobile')
      .send({ email: 'mariam@example.com', password: 'Storya2026' })
      .expect(200);
    const mariam = login.body.data as {
      accessToken: string;
      user: { subscription: { plan: string; isActive: boolean } };
    };
    expect(mariam.user.subscription).toMatchObject({ plan: 'premium', isActive: true });
    const mariamAuth = { Authorization: `Bearer ${mariam.accessToken}` };
    await api()
      .post('/api/v1/payments/checkout')
      .set(mariamAuth)
      .send({ offer: 'premium_monthly' })
      .expect(400);
    const quota = await api().get('/api/v1/videos/quota').set(mariamAuth).expect(200);
    expect((quota.body.data as { limit: number }).limit).toBeGreaterThan(3);
    await api()
      .patch(`/api/v1/admin/users/${mariamId}/subscription`)
      .set(admin.auth)
      .send({ plan: 'free' })
      .expect(400);

    // Suppression : jamais son propre compte.
    await api().delete(`/api/v1/admin/admins/${admin.userId}`).set(admin.auth).expect(400);
    await api().delete(`/api/v1/admin/admins/${mariamId}`).set(admin.auth).expect(200);
    expect(await findUserById(mariamId)).toBeUndefined();
  });

  it('indique quels services sont configurés sans exposer les clés', async () => {
    const admin = await registerAdmin();
    const res = await api().get('/api/v1/admin/system').set(admin.auth).expect(200);
    const body = JSON.stringify(res.body);
    expect(body).toContain('"configured"');
    expect(body).not.toMatch(/sk-[A-Za-z0-9]/);
  });
});
