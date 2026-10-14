import { beforeEach, describe, expect, it } from 'vitest';

import { ConsolePushProvider, setPushProvider } from '../../src/integrations/push';
import { notificationService } from '../../src/services/notification.service';
import { api, insertVideo, makeAdmin, registerUser } from '../helpers';

const TOKEN = (n: number) => `fcm-token-${n}-${'x'.repeat(40)}`;

let push: ConsolePushProvider;

beforeEach(() => {
  push = new ConsolePushProvider();
  setPushProvider(push);
});

describe('Notifications push', () => {
  it('enregistre le téléphone et prévient quand une vidéo est prête', async () => {
    const awa = await registerUser('awa@example.com', 'Awa');
    await api()
      .post('/api/v1/users/me/devices')
      .set(awa.auth)
      .send({ token: TOKEN(1), platform: 'android' })
      .expect(200);

    const video = await insertVideo({ userId: awa.userId, type: 'cartoon', title: 'Le baobab' });
    await notificationService.videoFinished({ ...video, title: 'Le baobab' }, 'completed');

    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]?.tokens).toEqual([TOKEN(1)]);
    expect(push.sent[0]?.message).toMatchObject({
      title: 'Votre vidéo est prête',
      data: { type: 'video', videoId: video.id },
    });

    // Réglage « Vidéo prête » désactivé : plus de notification.
    await api()
      .patch('/api/v1/users/me/settings')
      .set(awa.auth)
      .send({ notifications: { videoReady: false } })
      .expect(200);
    await notificationService.videoFinished(video, 'failed');
    expect(push.sent).toHaveLength(1);

    // Déconnexion : le téléphone est retiré.
    await api()
      .delete('/api/v1/users/me/devices')
      .set(awa.auth)
      .send({ token: TOKEN(1) })
      .expect(200);
    await notificationService.premiumActivated(awa.userId, new Date('2027-01-01'));
    expect(push.sent).toHaveLength(1);
  });

  it('un jeton déjà connu passe au compte qui vient de se connecter', async () => {
    const awa = await registerUser('awa@example.com', 'Awa');
    const moussa = await registerUser('moussa@example.com', 'Moussa');
    await api()
      .post('/api/v1/users/me/devices')
      .set(awa.auth)
      .send({ token: TOKEN(2), platform: 'android' });
    await api()
      .post('/api/v1/users/me/devices')
      .set(moussa.auth)
      .send({ token: TOKEN(2), platform: 'android' });

    await notificationService.premiumActivated(awa.userId, new Date('2027-01-01'));
    expect(push.sent).toHaveLength(0);
    await notificationService.premiumActivated(moussa.userId, new Date('2027-01-01'));
    expect(push.sent[0]?.message.title).toBe('Bienvenue dans Storya Premium');
  });

  it('les campagnes ne touchent que les utilisateurs qui acceptent les offres', async () => {
    const admin = await registerUser('admin@example.com', 'Admin');
    await makeAdmin(admin.userId);
    const awa = await registerUser('awa@example.com', 'Awa');
    const moussa = await registerUser('moussa@example.com', 'Moussa');
    for (const [session, n] of [
      [admin, 3],
      [awa, 4],
      [moussa, 5],
    ] as const) {
      await api()
        .post('/api/v1/users/me/devices')
        .set(session.auth)
        .send({ token: TOKEN(n), platform: 'android' });
    }
    // Seule Awa accepte les offres (désactivé par défaut).
    await api()
      .patch('/api/v1/users/me/settings')
      .set(awa.auth)
      .send({ notifications: { offers: true } })
      .expect(200);

    await api()
      .post('/api/v1/admin/notifications')
      .set(awa.auth)
      .send({ title: 'Nouveau', body: 'Message', audience: 'all' })
      .expect(403);
    const sent = await api()
      .post('/api/v1/admin/notifications')
      .set(admin.auth)
      .send({ title: 'Nouveaux styles', body: 'Découvrez le style Aquarelle.', audience: 'all' })
      .expect(201);
    expect(sent.body.data).toMatchObject({ recipients: 1, sent: 1, devices: 1 });
    expect(push.sent[0]?.tokens).toEqual([TOKEN(4)]);

    // Public « Premium » : Awa est gratuite, personne n'est visé.
    await api()
      .post('/api/v1/admin/notifications')
      .set(admin.auth)
      .send({ title: 'Premium', body: 'Merci !', audience: 'premium' })
      .expect(201);

    const history = await api().get('/api/v1/admin/notifications').set(admin.auth).expect(200);
    expect(history.body.data).toMatchObject({ devices: 2 });
    expect((history.body.data as { items: unknown[] }).items).toHaveLength(2);
  });

  it('prévient l’auteur quand un admin retire sa vidéo d’Explorer ou lui offre Premium', async () => {
    const admin = await registerUser('admin@example.com', 'Admin');
    await makeAdmin(admin.userId);
    const awa = await registerUser('awa@example.com', 'Awa');
    await api()
      .post('/api/v1/users/me/devices')
      .set(awa.auth)
      .send({ token: TOKEN(6), platform: 'ios' });
    const video = await insertVideo({ userId: awa.userId, type: 'cartoon', status: 'completed' });
    await api().post(`/api/v1/videos/${video.id}/publish`).set(awa.auth).expect(200);

    await api().delete(`/api/v1/admin/videos/${video.id}/publish`).set(admin.auth).expect(200);
    await api()
      .patch(`/api/v1/admin/users/${awa.userId}/subscription`)
      .set(admin.auth)
      .send({ plan: 'premium', days: 30 })
      .expect(200);

    expect(push.sent.map((item) => item.message.title)).toEqual([
      'Vidéo retirée d’Explorer',
      'Premium vous est offert',
    ]);
  });

  it('garde chaque notification dans la boîte de réception, lue ou non', async () => {
    const awa = await registerUser('awa@example.com', 'Awa');
    const video = await insertVideo({ userId: awa.userId, type: 'cartoon', title: 'Le baobab' });
    // Sans téléphone enregistré : rien n'est poussé, mais la notification est gardée.
    await notificationService.videoFinished({ ...video, title: 'Le baobab' }, 'completed');
    await notificationService.premiumActivated(awa.userId, new Date('2027-01-01'));
    expect(push.sent).toHaveLength(0);

    const inbox = await api().get('/api/v1/users/me/notifications').set(awa.auth).expect(200);
    const data = inbox.body.data as {
      unread: number;
      items: { id: string; title: string; read: boolean; data: Record<string, string> }[];
    };
    expect(data.unread).toBe(2);
    expect(data.items.map((item) => item.title)).toEqual([
      'Bienvenue dans Storya Premium',
      'Votre vidéo est prête',
    ]);
    expect(data.items[1]?.data).toEqual({ type: 'video', videoId: video.id });

    await api()
      .post(`/api/v1/users/me/notifications/${data.items[1]?.id}/read`)
      .set(awa.auth)
      .expect(200);
    const one = await api().get('/api/v1/users/me/notifications').set(awa.auth).expect(200);
    expect(one.body.data.unread).toBe(1);

    await api().post('/api/v1/users/me/notifications/read').set(awa.auth).expect(200);
    const none = await api().get('/api/v1/users/me/notifications').set(awa.auth).expect(200);
    expect(none.body.data.unread).toBe(0);

    // Chacun ne voit que les siennes.
    const moussa = await registerUser('moussa@example.com', 'Moussa');
    const other = await api().get('/api/v1/users/me/notifications').set(moussa.auth).expect(200);
    expect(other.body.data.items).toEqual([]);
  });
});
