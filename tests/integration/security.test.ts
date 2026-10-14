import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../../src/config/database';
import { users } from '../../src/db/schema';
import { api, makeAdmin, registerUser } from '../helpers';

describe('Sécurité', () => {
  it("bloque l'injection d'opérateurs dans le login", async () => {
    await registerUser();
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: { $gt: '' }, password: { $ne: null } })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('ignore les opérateurs MongoDB dans les query params', async () => {
    const session = await registerUser();
    const res = await api()
      .get('/api/v1/videos')
      .set(session.auth)
      .query({ 'type[$ne]': 'x' })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('supprime les balises HTML des saisies (XSS)', async () => {
    const session = await registerUser();
    const res = await api()
      .patch('/api/v1/users/me')
      .set(session.auth)
      .send({ firstName: '<script>alert(1)</script>Awa <b>Diallo</b>' })
      .expect(200);
    expect(res.body.data.firstName).toBe('Awa Diallo');
  });

  it('applique le contrôle d’accès par rôle', async () => {
    const session = await registerUser();
    await api().get('/api/v1/admin/users').expect(401);
    const forbidden = await api().get('/api/v1/admin/users').set(session.auth).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    await makeAdmin(session.userId);
    await api().get('/api/v1/admin/users').set(session.auth).expect(200);
  });

  it('coupe l’accès dès que le compte est supprimé', async () => {
    const session = await registerUser();
    await db.delete(users).where(eq(users.id, session.userId));
    await api().get('/api/v1/auth/me').set(session.auth).expect(401);
  });

  it('refuse un identifiant mal formé avec un 400 (pas d’erreur SQL)', async () => {
    const session = await registerUser();
    const res = await api().get('/api/v1/videos/not-a-uuid').set(session.auth).expect(400);
    expect(res.body.success).toBe(false);
  });

  it('cherche en traitant % et _ comme du texte', async () => {
    const session = await registerUser();
    await makeAdmin(session.userId);
    await registerUser('fanta@example.com', 'Fanta');
    const res = await api()
      .get('/api/v1/admin/users')
      .query({ q: '%' })
      .set(session.auth)
      .expect(200);
    expect(res.body.meta.total).toBe(0);
  });

  it('renvoie un 404 JSON standardisé pour une route inconnue', async () => {
    const res = await api().get('/api/v1/inexistant').expect(404);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });

  it('rejette un JSON mal formé avec un 400 lisible', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    expect(res.body.message).toBe('Corps de requête JSON invalide.');
  });

  it('pose les en-têtes de sécurité', async () => {
    const res = await api().get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeTypeOf('string');
  });

  it('refuse une origine CORS non autorisée', async () => {
    const res = await api()
      .get('/api/v1/config')
      .set('Origin', 'https://site-malveillant.example')
      .expect(403);
    expect(res.body.success).toBe(false);
  });
});
