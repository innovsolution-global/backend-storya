import { describe, expect, it } from 'vitest';

import { findUserByEmail } from '../../src/db/users';
import {
  api,
  lastEmailCode,
  lastEmailToken,
  outbox,
  PASSWORD,
  phoneFor,
  registerUser,
} from '../helpers';

describe('POST /auth/register', () => {
  it('crée le compte, ouvre une session et envoie un email de confirmation', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Awa',
        email: 'AWA@Example.com',
        phone: '00224 622-12.34 56',
        password: PASSWORD,
        genres: ['Mystère', 'Mystère'],
        videoTypes: ['cartoon', 'publicite'],
        // Ancien champ encore envoyé par l'app : accepté et ignoré.
        format: 'Vidéo',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({
      firstName: 'Awa',
      email: 'awa@example.com',
      phone: '+224622123456',
      role: 'user',
      preferences: { genres: ['Mystère'], videoTypes: ['cartoon', 'publicite'] },
      isEmailVerified: false,
      subscription: { plan: 'free', isActive: false },
    });
    expect(res.body.data.accessToken).toBeTypeOf('string');
    // Client web : refresh token uniquement en cookie httpOnly.
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toMatch(/storya_rt=.*HttpOnly/i);
    expect(outbox.outbox.at(-1)?.to).toBe('awa@example.com');

    const stored = await findUserByEmail('awa@example.com');
    expect(stored?.password).not.toBe(PASSWORD);
    expect(stored?.password).toMatch(/^\$2[aby]\$/);
  });

  it('renvoie le refresh token dans le corps pour le client mobile', async () => {
    const session = await registerUser();
    expect(session.refreshToken).toMatch(/^[a-f0-9]{96}$/);
  });

  it('refuse un email déjà utilisé (409)', async () => {
    await registerUser();
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ firstName: 'Awa', email: 'awa@example.com', phone: '622123456', password: PASSWORD })
      .expect(409);
    expect(res.body).toEqual({
      success: false,
      message: 'Un compte existe déjà avec cet email.',
      code: 'CONFLICT',
    });
  });

  it('détaille les erreurs de validation par champ', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({
        firstName: '',
        email: 'pas-un-email',
        phone: '12-34',
        password: 'court',
        role: 'admin',
      })
      .expect(400);
    const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['firstName', 'email', 'phone', 'password']));
    // Champ inconnu (tentative d'élévation de privilèges) rejeté.
    expect(JSON.stringify(res.body.errors)).toContain('role');
  });

  it('refuse un numéro de téléphone déjà utilisé (409)', async () => {
    await registerUser('awa@example.com');
    const res = await api()
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Fanta',
        email: 'fanta@example.com',
        phone: phoneFor('awa@example.com'),
        password: PASSWORD,
      })
      .expect(409);
    expect(res.body.message).toBe('Un compte existe déjà avec ce numéro de téléphone.');
  });

  it('exige un numéro de téléphone', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ firstName: 'Awa', email: 'awa@example.com', password: PASSWORD })
      .expect(400);
    const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
    expect(fields).toContain('phone');
  });
});

describe('POST /auth/login', () => {
  it('connecte avec les bons identifiants', async () => {
    await registerUser();
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'awa@example.com', password: PASSWORD })
      .expect(200);
    expect(res.body.data.user.email).toBe('awa@example.com');
  });

  it('renvoie le même message pour un email inconnu ou un mauvais mot de passe', async () => {
    await registerUser();
    const wrong = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'awa@example.com', password: 'Mauvais123' })
      .expect(401);
    const unknown = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'inconnu@example.com', password: PASSWORD })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('verrouille le compte après 5 échecs, même avec le bon mot de passe ensuite', async () => {
    await registerUser();
    for (let i = 0; i < 5; i += 1) {
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'awa@example.com', password: 'Mauvais123' })
        .expect(401);
    }
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'awa@example.com', password: PASSWORD })
      .expect(423);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('Session et jetons', () => {
  it('protège /auth/me', async () => {
    await api().get('/api/v1/auth/me').expect(401);
    await api().get('/api/v1/auth/me').set('Authorization', 'Bearer faux.jeton.jwt').expect(401);
    const session = await registerUser();
    const res = await api().get('/api/v1/auth/me').set(session.auth).expect(200);
    expect(res.body.data.id).toBe(session.userId);
  });

  it('fait tourner le refresh token et détecte sa réutilisation', async () => {
    const session = await registerUser();

    const first = await api()
      .post('/api/v1/auth/refresh-token')
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    const rotated = first.body.data.refreshToken as string;
    expect(rotated).not.toBe(session.refreshToken);

    // L'ancien jeton ne fonctionne plus.
    await api()
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
    // Le nouveau fonctionne.
    await api()
      .post('/api/v1/auth/refresh-token')
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: rotated })
      .expect(200);
  });

  it('accepte le refresh token via le cookie httpOnly', async () => {
    await registerUser();
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'awa@example.com', password: PASSWORD });
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    await api().post('/api/v1/auth/refresh-token').set('Cookie', cookie).expect(200);
  });

  it('révoque le refresh token à la déconnexion', async () => {
    const session = await registerUser();
    await api()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    await api()
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });
});

describe('Mot de passe oublié et vérification email', () => {
  it('réinitialise le mot de passe et ferme les sessions existantes', async () => {
    const session = await registerUser();

    await api().post('/api/v1/auth/forgot-password').send({ email: 'awa@example.com' }).expect(200);
    const code = lastEmailCode();
    expect(code).toMatch(/^\d{6}$/);

    await api()
      .post('/api/v1/auth/reset-password')
      .send({ email: 'awa@example.com', code, password: 'NouveauMdp2026' })
      .expect(200);
    // Le code est à usage unique.
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ email: 'awa@example.com', code, password: 'Encore2026x' })
      .expect(400);

    await api()
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: 'awa@example.com', password: PASSWORD })
      .expect(401);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: 'awa@example.com', password: 'NouveauMdp2026' })
      .expect(200);
  });

  it('annule le code après 5 essais erronés', async () => {
    await registerUser();
    await api().post('/api/v1/auth/forgot-password').send({ email: 'awa@example.com' }).expect(200);
    const code = lastEmailCode();
    const wrong = code === '000000' ? '111111' : '000000';
    const attempt = (value: string) =>
      api()
        .post('/api/v1/auth/reset-password')
        .send({ email: 'awa@example.com', code: value, password: 'NouveauMdp2026' });

    const first = await attempt(wrong).expect(400);
    expect(first.body.message).toBe('Code incorrect. Il vous reste 4 essais.');
    for (let i = 0; i < 3; i += 1) await attempt(wrong).expect(400);
    const last = await attempt(wrong).expect(400);
    expect(last.body.message).toBe('Trop de codes erronés. Demandez un nouveau code.');

    // Même le bon code ne fonctionne plus.
    const after = await attempt(code).expect(400);
    expect(after.body.message).toBe('Code invalide ou expiré. Demandez un nouveau code.');
  });

  it("ne révèle pas si l'email existe", async () => {
    const before = outbox.outbox.length;
    const res = await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'personne@example.com' })
      .expect(200);
    expect(res.body.message).toMatch(/Si un compte existe/);
    expect(outbox.outbox.length).toBe(before);
  });

  it("confirme l'adresse email", async () => {
    const session = await registerUser();
    const token = lastEmailToken();
    await api().post('/api/v1/auth/verify-email').send({ token }).expect(200);
    const me = await api().get('/api/v1/auth/me').set(session.auth).expect(200);
    expect(me.body.data.isEmailVerified).toBe(true);
  });
});

describe('Changement de mot de passe', () => {
  it('exige le mot de passe actuel et renvoie une nouvelle session valide', async () => {
    const session = await registerUser();
    await api()
      .patch('/api/v1/users/me/password')
      .set(session.auth)
      .send({ currentPassword: 'Mauvais123', newPassword: 'NouveauMdp2026' })
      .expect(400);

    const res = await api()
      .patch('/api/v1/users/me/password')
      .set(session.auth)
      .send({ currentPassword: PASSWORD, newPassword: 'NouveauMdp2026' })
      .expect(200);

    await api()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken as string}`)
      .expect(200);
    await api()
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });
});
