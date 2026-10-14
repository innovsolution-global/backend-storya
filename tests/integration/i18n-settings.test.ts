import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAiClients } from '../../src/integrations/ai';
import { generationQueue } from '../../src/utils/jobQueue';
import { api, outbox, PASSWORD, phoneFor, registerUser } from '../helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const DEFAULT_SETTINGS = {
  language: 'system',
  defaultFormat: null,
  exportQuality: '1080p',
  downloadNetwork: 'wifi',
  notifications: { videoReady: true, tips: true, offers: false },
};

describe('Réglages du compte (/users/me/settings)', () => {
  it('valeurs par défaut, renvoyées aussi avec le profil', async () => {
    const session = await registerUser();
    const res = await api().get('/api/v1/users/me/settings').set(session.auth).expect(200);
    expect(res.body.data).toEqual(DEFAULT_SETTINGS);

    const me = await api().get('/api/v1/auth/me').set(session.auth).expect(200);
    expect(me.body.data.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('seuls les réglages envoyés changent, notifications une à une', async () => {
    const session = await registerUser();
    const res = await api()
      .patch('/api/v1/users/me/settings')
      .set(session.auth)
      .send({ language: 'en', defaultFormat: '1:1', notifications: { videoReady: false } })
      .expect(200);
    expect(res.body.data).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'en',
      defaultFormat: '1:1',
      notifications: { videoReady: false, tips: true, offers: false },
    });

    // Retour au format conseillé pour chaque type.
    const reset = await api()
      .patch('/api/v1/users/me/settings')
      .set(session.auth)
      .send({ defaultFormat: null, exportQuality: '720p', downloadNetwork: 'any' })
      .expect(200);
    expect(reset.body.data).toMatchObject({
      language: 'en',
      defaultFormat: null,
      exportQuality: '720p',
      downloadNetwork: 'any',
    });
  });

  it('refuse les valeurs inconnues et les champs en trop', async () => {
    const session = await registerUser();
    const res = await api()
      .patch('/api/v1/users/me/settings')
      .set(session.auth)
      .send({ language: 'de' })
      .expect(400);
    expect(res.body.errors[0]).toMatchObject({
      field: 'language',
      message: 'Langue inconnue (system, fr, en).',
    });

    await api().patch('/api/v1/users/me/settings').set(session.auth).send({}).expect(400);
    await api()
      .patch('/api/v1/users/me/settings')
      .set(session.auth)
      .send({ notifications: { sms: true } })
      .expect(400);
  });

  it('réservé aux utilisateurs connectés', async () => {
    await api().get('/api/v1/users/me/settings').expect(401);
  });
});

describe('API bilingue (Accept-Language)', () => {
  it('erreurs et validations en anglais quand l’app est en anglais', async () => {
    const session = await registerUser();
    const res = await api()
      .patch('/api/v1/users/me/settings')
      .set(session.auth)
      .set('Accept-Language', 'en-US,en;q=0.9')
      .send({ language: 'de' })
      .expect(400);
    expect(res.headers['content-language']).toBe('en');
    expect(res.body.message).toBe('Invalid data.');
    expect(res.body.errors[0].message).toBe('Unknown language (system, fr, en).');

    const login = await api()
      .post('/api/v1/auth/login')
      .set('Accept-Language', 'en')
      .send({ email: 'awa@example.com', password: 'Mauvais2026' })
      .expect(401);
    expect(login.body.message).toBe('Incorrect email or password.');
  });

  it('français par défaut', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'personne@example.com', password: 'Mauvais2026' })
      .expect(401);
    expect(res.headers['content-language']).toBe('fr');
    expect(res.body.message).toBe('Email ou mot de passe incorrect.');
  });

  it('messages de succès et offres Premium traduits', async () => {
    const session = await registerUser();
    const res = await api()
      .patch('/api/v1/users/me/settings')
      .set(session.auth)
      .set('Accept-Language', 'en')
      .send({ exportQuality: '720p' })
      .expect(200);
    expect(res.body.message).toBe('Settings updated.');

    const offers = await api()
      .get('/api/v1/payments/offers')
      .set('Accept-Language', 'en')
      .expect(200);
    expect(offers.body.data.map((o: { label: string }) => o.label)).toEqual([
      'Monthly Premium',
      'Yearly Premium',
    ]);
  });
});

describe('Emails dans la langue de l’utilisateur', () => {
  it('inscription depuis une app en anglais : email de confirmation en anglais', async () => {
    await api()
      .post('/api/v1/auth/register')
      .set('Accept-Language', 'en')
      .send({
        firstName: 'John',
        email: 'john@example.com',
        phone: phoneFor('john@example.com'),
        password: PASSWORD,
      })
      .expect(201);
    const email = outbox.outbox.at(-1);
    expect(email?.to).toBe('john@example.com');
    expect(email?.subject).toBe('Confirm your email address');
    expect(email?.html).toContain('<html lang="en">');
  });

  it('le réglage du compte l’emporte sur la langue du téléphone', async () => {
    const session = await registerUser('lea@example.com', 'Léa');
    await api()
      .patch('/api/v1/users/me/settings')
      .set(session.auth)
      .send({ language: 'fr' })
      .expect(200);

    await api()
      .post('/api/v1/auth/forgot-password')
      .set('Accept-Language', 'en')
      .send({ email: 'lea@example.com' })
      .expect(200);
    expect(outbox.outbox.at(-1)?.subject).toMatch(/^\d{6} est votre code Storya$/);
  });
});

describe('Email « Votre vidéo est prête »', () => {
  function mockAi() {
    const chat = vi.spyOn(getAiClients().openai, 'chatJson').mockResolvedValue({
      title: 'The singing river',
      description: 'A griot tells the legend.',
      scenes: [{ narration: 'The sun sets.', visualPrompt: 'Sunset over a river' }],
    });
    vi.spyOn(getAiClients().openai, 'generateVideo').mockResolvedValue(Buffer.from('mp4'));
    return chat;
  }

  const body = {
    type: 'storytelling',
    prompt: 'An old griot tells the legend of the singing river',
    style: 'Conte africain',
    durationSeconds: 15,
    voice: 'aucune',
    music: 'aucune',
  };

  it('envoyé dans la langue de l’app, avec un script dans la langue de l’idée', async () => {
    const session = await registerUser('kofi@example.com', 'Kofi');
    const chat = mockAi();
    const created = await api()
      .post('/api/v1/videos')
      .set(session.auth)
      .set('Accept-Language', 'en')
      .send(body)
      .expect(202);
    expect(created.body.data.typeLabel).toBe('Storytelling');
    await generationQueue.drain();

    const system = String(chat.mock.calls[0]?.[0][0]?.content);
    expect(system).toContain("dans la langue de l'idée de l'utilisateur");
    expect(system).toContain('si elle est ambiguë : anglais');

    const email = outbox.outbox.at(-1);
    expect(email?.to).toBe('kofi@example.com');
    // Titre de la vidéo : première phrase de l'idée (comme dans l'app).
    expect(email?.subject).toBe(
      'Your video “An old griot tells the legend of the singing river” is ready',
    );

    const video = await api()
      .get(`/api/v1/videos/${created.body.data.id as string}`)
      .set(session.auth)
      .set('Accept-Language', 'en')
      .expect(200);
    expect(video.body.data.progress.message).toBe('Your video is ready!');
  });

  it('pas d’email si la notification « Vidéo prête » est désactivée', async () => {
    const session = await registerUser('ama@example.com', 'Ama');
    await api()
      .patch('/api/v1/users/me/settings')
      .set(session.auth)
      .send({ notifications: { videoReady: false } })
      .expect(200);
    mockAi();
    const before = outbox.outbox.length;
    await api().post('/api/v1/videos').set(session.auth).send(body).expect(202);
    await generationQueue.drain();
    expect(outbox.outbox.slice(before).filter((m) => m.subject.includes('prête'))).toHaveLength(0);
    expect(outbox.outbox.slice(before).filter((m) => m.subject.includes('ready'))).toHaveLength(0);
  });
});
