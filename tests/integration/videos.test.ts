import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../../src/integrations/ai';
import { AiProviderError, getAiClients } from '../../src/integrations/ai';
import { eq } from 'drizzle-orm';

import { db } from '../../src/config/database';
import { videos } from '../../src/db/schema';
import { runVideoJob } from '../../src/services/videoGenerator.service';
import { generationQueue } from '../../src/utils/jobQueue';
import { api, countRows, fakeComposer, insertVideo, PNG_1PX, registerUser } from '../helpers';

/** Réponse GPT : le nombre de scènes est volontairement faux pour vérifier qu'il est corrigé. */
function mockScript() {
  return vi.spyOn(getAiClients().openai, 'chatJson').mockResolvedValue({
    title: 'La légende du fleuve',
    description: 'Un griot raconte la légende du fleuve qui chante.',
    scenes: [
      { narration: 'Le soleil se couche sur le fleuve.', visualPrompt: 'Sunset over a river' },
      { narration: 'Le vieux griot accorde sa kora.', visualPrompt: 'Old griot tuning a kora' },
    ],
  });
}

function mockSora(fail = false) {
  return vi.spyOn(getAiClients().openai, 'generateVideo').mockImplementation(async () => {
    if (fail)
      throw new AiProviderError('Sora', 'Sora : crédit ou quota épuisé côté fournisseur.', 429);
    return Buffer.from('mp4');
  });
}

beforeEach(() => {
  fakeComposer.calls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /videos — génération', () => {
  it('génère une vidéo storytelling découpée en scènes, avec musique et montage', async () => {
    const session = await registerUser();
    mockScript();
    const sora = mockSora();

    const created = await api()
      .post('/api/v1/videos')
      .set(session.auth)
      .send({
        type: 'storytelling',
        prompt: 'Un vieux griot raconte la légende du fleuve qui chante',
        style: 'Conte africain',
        durationSeconds: 30,
        voice: 'masculine',
        music: 'epique',
      })
      .expect(202);
    expect(created.body.data).toMatchObject({
      status: 'queued',
      aspectRatio: '9:16',
      durationSeconds: 30,
    });
    expect(created.headers.location).toBe(`/api/v1/videos/${created.body.data.id as string}`);

    await generationQueue.drain();

    const res = await api()
      .get(`/api/v1/videos/${created.body.data.id as string}`)
      .set(session.auth)
      .expect(200);
    const video = res.body.data;
    expect(video).toMatchObject({
      status: 'completed',
      title: 'Un vieux griot raconte la légende du fleuve qui chante',
      description: 'Un griot raconte la légende du fleuve qui chante.',
      typeLabel: 'Storytelling',
      voiceLabel: 'Masculine',
      progress: { step: 4, total: 4, ratio: 1 },
      error: null,
      demo: false,
    });
    expect(video.videoUrl).toMatch(/\/uploads\/test\//);
    expect(video.thumbnailUrl).toMatch(/\/uploads\/test\//);

    // 30 s → 4 scènes de 8, 8, 7, 7 s (GPT n'en a renvoyé que 2 : complétées).
    expect(video.scenes.map((s: { durationSeconds: number }) => s.durationSeconds)).toEqual([
      8, 8, 7, 7,
    ]);
    expect(sora).toHaveBeenCalledTimes(4);
    expect(sora.mock.calls[0]?.[0]).toMatchObject({ seconds: 8, size: '720x1280' });
    expect(sora.mock.calls[0]?.[0].prompt).toContain('Sunset over a river');
    expect(sora.mock.calls[0]?.[0].prompt).toContain('West African storytelling');

    // Sans clé ElevenLabs : pas de voix, mais la musique (nappe synthétisée) est mixée.
    expect(video.warnings).toContain('Voix off désactivée : aucune clé ElevenLabs configurée.');
    expect(fakeComposer.calls.find((c) => c.op === 'ambientMusic')?.args).toEqual(['epique', 30]);
    expect(fakeComposer.calls.find((c) => c.op === 'concat')?.args).toEqual([4]);
    expect(fakeComposer.calls.find((c) => c.op === 'mixAudio')?.args).toEqual([false, true, 30]);
  });

  it('utilise les images envoyées : montrées au script et données à Sora comme point de départ', async () => {
    const session = await registerUser();
    const script = mockScript();
    const sora = mockSora();

    const created = await api()
      .post('/api/v1/videos')
      .set(session.auth)
      .field('type', 'publicite')
      .field('prompt', 'Un café torréfié à Conakry, servi au lever du soleil')
      .field('brand', 'Café Kaloum')
      .field('callToAction', 'Commander')
      .field('durationSeconds', '15')
      .field('aspectRatio', '1:1')
      .attach('images', PNG_1PX, 'produit.png')
      .attach('images', PNG_1PX, 'boutique.png')
      .expect(202);
    expect(created.body.data.imageUrls).toHaveLength(2);
    expect(created.body.data.title).toBe('Pub Café Kaloum');
    expect(created.body.data.style).toBe('Dynamique');

    await generationQueue.drain();
    const res = await api()
      .get(`/api/v1/videos/${created.body.data.id as string}`)
      .set(session.auth);
    expect(res.body.data.status).toBe('completed');
    // 15 s → 2 scènes, chacune partant d'une image.
    expect(res.body.data.scenes.map((s: { imageIndex: number }) => s.imageIndex)).toEqual([0, 1]);

    const userMessage = (script.mock.calls[0]?.[0] as ChatMessage[])[1];
    const parts = userMessage?.content as { type: string }[];
    expect(parts.filter((part) => part.type === 'image_url')).toHaveLength(2);
    const systemPrompt = (script.mock.calls[0]?.[0] as ChatMessage[])[0]?.content as string;
    expect(systemPrompt).toContain('PUBLICITÉ pour « Café Kaloum »');
    expect(systemPrompt).toContain('« Commander »');

    // Format carré : Sora génère en vertical, recadré au montage en 960×960.
    expect(sora.mock.calls[0]?.[0].inputReference).toBeInstanceOf(Buffer);
    expect(sora.mock.calls[0]?.[0].size).toBe('720x1280');
    const normalize = fakeComposer.calls.find((c) => c.op === 'normalizeClip');
    expect(normalize?.args[1]).toEqual({ width: 960, height: 960 });
  });

  it('enregistre une erreur lisible quand le fournisseur vidéo échoue, puis permet de relancer', async () => {
    const session = await registerUser();
    mockScript();
    mockSora(true);

    const created = await api()
      .post('/api/v1/videos')
      .set(session.auth)
      .send({ type: 'cartoon', prompt: 'Un petit baobab qui rêve de voyager', durationSeconds: 10 })
      .expect(202);
    await generationQueue.drain();

    const url = `/api/v1/videos/${created.body.data.id as string}`;
    const failed = await api().get(url).set(session.auth);
    expect(failed.body.data).toMatchObject({
      status: 'failed',
      error: 'Sora : crédit ou quota épuisé côté fournisseur.',
      aspectRatio: '16:9',
      style: 'Animation 3D',
    });

    vi.restoreAllMocks();
    mockScript();
    mockSora();
    await api().post(`${url}/retry`).set(session.auth).expect(202);
    await generationQueue.drain();
    const retried = await api().get(url).set(session.auth);
    expect(retried.body.data.status).toBe('completed');
  });
});

describe('POST /videos — validation et limites', () => {
  it('refuse une durée de plus de 2 min 30, un style hors type et une pub sans marque', async () => {
    const session = await registerUser();
    const tooLong = await api()
      .post('/api/v1/videos')
      .set(session.auth)
      .send({ type: 'storytelling', prompt: 'Une histoire', durationSeconds: 151 })
      .expect(400);
    expect(tooLong.body.errors[0]).toEqual({
      field: 'durationSeconds',
      message: 'Une vidéo ne peut pas dépasser 2 min 30 (150 secondes).',
    });

    const style = await api()
      .post('/api/v1/videos')
      .set(session.auth)
      .send({ type: 'cartoon', prompt: 'Une histoire', style: 'Cinématique' })
      .expect(400);
    expect(style.body.errors[0].field).toBe('style');

    const ad = await api()
      .post('/api/v1/videos')
      .set(session.auth)
      .send({ type: 'publicite', prompt: 'Une super offre' })
      .expect(400);
    expect(ad.body.errors[0].field).toBe('brand');
  });

  it('refuse plus de 5 images et les fichiers qui ne sont pas de vraies images', async () => {
    const session = await registerUser();
    let tooMany = api()
      .post('/api/v1/videos')
      .set(session.auth)
      .field('type', 'storytelling')
      .field('prompt', 'Une histoire');
    for (let i = 0; i < 6; i += 1) tooMany = tooMany.attach('images', PNG_1PX, `image-${i}.png`);
    await tooMany.expect(400);

    const fake = await api()
      .post('/api/v1/videos')
      .set(session.auth)
      .field('type', 'storytelling')
      .field('prompt', 'Une histoire')
      .attach('images', Buffer.from('<?php echo 1;'), {
        filename: 'piege.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(fake.body.message).toMatch(/n'est pas un fichier image valide/);
    expect(await countRows(videos)).toBe(0);
  });

  it('une seule génération à la fois et quota journalier', async () => {
    const session = await registerUser();
    const body = { type: 'storytelling', prompt: 'Retour au pays', durationSeconds: 10 };
    const base = { userId: session.userId, type: 'storytelling' } as const;

    await insertVideo({ ...base, status: 'processing' });
    const busy = await api().post('/api/v1/videos').set(session.auth).send(body).expect(409);
    expect(busy.body.message).toMatch(/déjà en cours/);

    // Quota de test : 2 par jour (les échecs ne comptent pas).
    await db.update(videos).set({ status: 'completed' });
    await insertVideo({ ...base, status: 'completed' });
    await insertVideo({ ...base, status: 'failed' });
    const quota = await api().get('/api/v1/videos/quota').set(session.auth).expect(200);
    expect(quota.body.data).toEqual({ limit: 2, used: 2, remaining: 0 });
    const res = await api().post('/api/v1/videos').set(session.auth).send(body).expect(429);
    expect(res.body.message).toMatch(/Quota atteint/);
  });
});

describe('Mes vidéos', () => {
  it('liste, filtre, renomme et supprime ; les vidéos des autres restent invisibles', async () => {
    const awa = await registerUser('awa@example.com');
    const fanta = await registerUser('fanta@example.com', 'Fanta');
    const base = { durationSeconds: 30, status: 'completed' } as const;
    const mine = await insertVideo({
      ...base,
      userId: awa.userId,
      title: 'Ma pub',
      type: 'publicite',
    });
    await insertVideo({ ...base, userId: awa.userId, title: 'Mon conte', type: 'storytelling' });
    await insertVideo({ ...base, userId: fanta.userId, title: 'Autre', type: 'publicite' });

    const all = await api().get('/api/v1/videos').set(awa.auth).expect(200);
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data[0].scenes).toBeUndefined();

    const ads = await api().get('/api/v1/videos').query({ type: 'publicite' }).set(awa.auth);
    expect(ads.body.data.map((v: { title: string }) => v.title)).toEqual(['Ma pub']);

    const url = `/api/v1/videos/${mine.id}`;
    await api().get(url).set(fanta.auth).expect(404);
    const renamed = await api()
      .patch(url)
      .set(awa.auth)
      .send({ title: 'Pub du week-end' })
      .expect(200);
    expect(renamed.body.data.title).toBe('Pub du week-end');

    await api().delete(url).set(fanta.auth).expect(404);
    await api().delete(url).set(awa.auth).expect(200);
    expect(await countRows(videos, eq(videos.userId, awa.userId))).toBe(1);
  });

  it('expose le référentiel de création', async () => {
    const res = await api().get('/api/v1/config').expect(200);
    expect(res.body.data.videoTypes.map((t: { id: string }) => t.id)).toEqual([
      'storytelling',
      'cartoon',
      'publicite',
    ]);
    expect(res.body.data.durations.maxSeconds).toBe(150);
    expect(res.body.data.images.max).toBe(5);
    expect(res.body.data.aspectRatios.map((a: { id: string }) => a.id)).toEqual([
      '9:16',
      '16:9',
      '1:1',
    ]);
  });
});

describe('Mode démo', () => {
  it('monte une vraie vidéo à partir des images, sans aucun appel IA', async () => {
    const session = await registerUser();
    const chat = vi.spyOn(getAiClients().openai, 'chatJson');
    const sora = vi.spyOn(getAiClients().openai, 'generateVideo');

    const upload = await api()
      .post('/api/v1/videos')
      .set(session.auth)
      .field('type', 'cartoon')
      .field('prompt', 'Le lion organise une course dans la savane')
      .field('durationSeconds', '20')
      .field('voice', 'aucune')
      .field('music', 'joyeuse')
      .attach('images', PNG_1PX, 'lion.png')
      .expect(202);
    await generationQueue.drain();
    vi.clearAllMocks();
    fakeComposer.calls.length = 0;

    // Même vidéo relancée en mode démo.
    const videoId = upload.body.data.id as string;
    await db
      .update(videos)
      .set({ status: 'queued', demo: true, scenes: [], warnings: [], output: null })
      .where(eq(videos.id, videoId));
    await runVideoJob(videoId);

    const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
    expect(video?.status).toBe('completed');
    expect(video?.providers).toMatchObject({ script: 'demo', video: 'demo', music: 'ambient' });
    expect(video?.scenes).toHaveLength(3);
    expect(video?.narration).toBe('');
    expect(chat).not.toHaveBeenCalled();
    expect(sora).not.toHaveBeenCalled();
    expect(fakeComposer.calls.filter((c) => c.op === 'imageClip')).toHaveLength(3);
    expect(fakeComposer.calls.find((c) => c.op === 'mixAudio')?.args).toEqual([false, true, 20]);
  });
});
