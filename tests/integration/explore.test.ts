import { describe, expect, it } from 'vitest';

import { api, insertVideo, makeAdmin, registerUser } from '../helpers';

describe('Explorer', () => {
  it('ne montre que les vidéos terminées que leur auteur a publiées', async () => {
    const awa = await registerUser('awa@example.com', 'Awa');
    const moussa = await registerUser('moussa@example.com', 'Moussa');

    const done = await insertVideo({
      userId: awa.userId,
      type: 'cartoon',
      title: 'Le baobab voyageur',
      status: 'completed',
    });
    const failed = await insertVideo({
      userId: awa.userId,
      type: 'storytelling',
      status: 'failed',
    });
    await insertVideo({ userId: awa.userId, type: 'publicite', status: 'completed' });

    // Privées par défaut : le fil est vide.
    const empty = await api().get('/api/v1/videos/explore').set(moussa.auth).expect(200);
    expect(empty.body.data).toEqual([]);

    // Une vidéo échouée ne peut pas être publiée ; celle d'un autre non plus.
    await api().post(`/api/v1/videos/${failed.id}/publish`).set(awa.auth).expect(400);
    await api().post(`/api/v1/videos/${done.id}/publish`).set(moussa.auth).expect(404);

    const published = await api()
      .post(`/api/v1/videos/${done.id}/publish`)
      .set(awa.auth)
      .expect(200);
    expect(published.body.data.publishedAt).not.toBeNull();

    const feed = await api().get('/api/v1/videos/explore').set(moussa.auth).expect(200);
    const items = feed.body.data as {
      id: string;
      title: string;
      isMine: boolean;
      author: { firstName: string };
      error?: unknown;
    }[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: done.id,
      title: 'Le baobab voyageur',
      isMine: false,
      author: { firstName: 'Awa' },
    });
    expect(items[0]).not.toHaveProperty('error');

    // Filtre par type.
    const ads = await api()
      .get('/api/v1/videos/explore?type=publicite')
      .set(moussa.auth)
      .expect(200);
    expect(ads.body.data).toEqual([]);

    // L'auteur la retire : elle redevient privée.
    await api().delete(`/api/v1/videos/${done.id}/publish`).set(awa.auth).expect(200);
    const after = await api().get('/api/v1/videos/explore').set(awa.auth).expect(200);
    expect(after.body.data).toEqual([]);
  });

  it('un administrateur peut retirer une vidéo d’Explorer', async () => {
    const awa = await registerUser('awa@example.com', 'Awa');
    const admin = await registerUser('admin@example.com', 'Admin');
    await makeAdmin(admin.userId);
    const video = await insertVideo({ userId: awa.userId, type: 'cartoon', status: 'completed' });
    await api().post(`/api/v1/videos/${video.id}/publish`).set(awa.auth).expect(200);

    await api().delete(`/api/v1/admin/videos/${video.id}/publish`).set(awa.auth).expect(403);
    await api().delete(`/api/v1/admin/videos/${video.id}/publish`).set(admin.auth).expect(200);

    const feed = await api().get('/api/v1/videos/explore').set(awa.auth).expect(200);
    expect(feed.body.data).toEqual([]);
  });
});
