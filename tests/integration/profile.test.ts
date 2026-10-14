import { describe, expect, it } from 'vitest';

import { api, makeAdmin, phoneFor, registerUser } from '../helpers';

describe('PATCH /users/me — téléphone', () => {
  it('modifie le numéro en le normalisant', async () => {
    const session = await registerUser();
    const res = await api()
      .patch('/api/v1/users/me')
      .set(session.auth)
      .send({ phone: '00224 655-00.11 22' })
      .expect(200);
    expect(res.body.data.phone).toBe('+224655001122');

    const me = await api().get('/api/v1/auth/me').set(session.auth).expect(200);
    expect(me.body.data.phone).toBe('+224655001122');
  });

  it("refuse le numéro d'un autre compte (409)", async () => {
    await registerUser('awa@example.com');
    const fanta = await registerUser('fanta@example.com', 'Fanta');
    const res = await api()
      .patch('/api/v1/users/me')
      .set(fanta.auth)
      .send({ phone: phoneFor('awa@example.com') })
      .expect(409);
    expect(res.body.message).toBe('Un compte existe déjà avec ce numéro de téléphone.');
  });

  it('accepte de renvoyer son propre numéro et rejette un numéro invalide', async () => {
    const session = await registerUser();
    await api()
      .patch('/api/v1/users/me')
      .set(session.auth)
      .send({ phone: phoneFor('awa@example.com'), firstName: 'Awa D.' })
      .expect(200);
    const invalid = await api()
      .patch('/api/v1/users/me')
      .set(session.auth)
      .send({ phone: 'abc' })
      .expect(400);
    expect(invalid.body.errors[0].field).toBe('phone');
    await api().patch('/api/v1/users/me').set(session.auth).send({}).expect(400);
  });

  it('permet à un admin de chercher un utilisateur par téléphone', async () => {
    const admin = await registerUser('admin@example.com', 'Admin');
    await registerUser('awa@example.com');
    await makeAdmin(admin.userId);

    const res = await api()
      .get('/api/v1/admin/users')
      .query({ q: phoneFor('awa@example.com').slice(-6) })
      .set(admin.auth)
      .expect(200);
    expect(res.body.data.map((u: { email: string }) => u.email)).toEqual(['awa@example.com']);
  });
});
