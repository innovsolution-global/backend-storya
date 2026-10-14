import fs from 'node:fs/promises';
import path from 'node:path';

import type { SQL } from 'drizzle-orm';
import { count, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import request from 'supertest';

import { createApp } from '../src/app';
import { db } from '../src/config/database';
import { users, videos } from '../src/db/schema';
import type { IMedia, NewVideo } from '../src/models';
import { ConsoleEmailProvider, setEmailProvider } from '../src/integrations/email';
import type { StorageProvider } from '../src/integrations/storage';
import { setStorageProvider } from '../src/integrations/storage';
import type { VideoComposer } from '../src/integrations/video';
import { setVideoComposer } from '../src/integrations/video';
import { UPLOAD_ROOT } from '../src/middlewares/upload';

export const app = createApp();
export const api = () => request(app);

export const outbox = new ConsoleEmailProvider();
setEmailProvider(outbox);

/** Stockage factice : aucun fichier écrit pendant les tests. */
export const memoryStorage: StorageProvider & { stored: IMedia[] } = {
  name: 'local',
  stored: [],
  /** Copie réelle sous uploads/test (le pipeline vidéo relit les images envoyées). */
  async uploadFile(source, { folder }) {
    const name = `${Date.now()}-${Math.random().toString(16).slice(2)}-${path.basename(source)}`;
    await fs.mkdir(path.join(UPLOAD_ROOT, 'test'), { recursive: true });
    await fs.copyFile(source, path.join(UPLOAD_ROOT, 'test', name));
    const media: IMedia = { url: `/uploads/test/${name}`, provider: 'local', publicId: folder };
    this.stored.push(media);
    return media;
  },
  async uploadBuffer(_buffer, { folder, extension }) {
    const media: IMedia = { url: `/uploads/${folder}/test${extension}`, provider: 'local' };
    this.stored.push(media);
    return media;
  },
  async uploadFromUrl(_url, { folder, extension }) {
    const media: IMedia = { url: `/uploads/${folder}/remote${extension}`, provider: 'local' };
    this.stored.push(media);
    return media;
  },
  async delete() {},
};
setStorageProvider(memoryStorage);

export const PASSWORD = 'Storya2026';

export interface TestSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  auth: { Authorization: string };
}

/** Numéro guinéen déterministe et distinct pour chaque email (le numéro est unique). */
export function phoneFor(email: string): string {
  let hash = 0;
  for (const char of email) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000;
  return `+224622${String(hash).padStart(6, '0')}`;
}

export async function registerUser(
  email = 'awa@example.com',
  firstName = 'Awa',
): Promise<TestSession> {
  const res = await api()
    .post('/api/v1/auth/register')
    .set('X-Client-Type', 'mobile')
    .send({
      firstName,
      email,
      phone: phoneFor(email),
      password: PASSWORD,
      genres: ['Mystère'],
      videoTypes: ['storytelling'],
    })
    .expect(201);
  const { accessToken, refreshToken, user } = res.body.data as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };
  return {
    accessToken,
    refreshToken,
    userId: user.id,
    auth: { Authorization: `Bearer ${accessToken}` },
  };
}

export async function makeAdmin(userId: string): Promise<void> {
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, userId));
}

/** Vidéo insérée directement en base (sans génération). */
export async function insertVideo(values: Partial<NewVideo> & Pick<NewVideo, 'userId' | 'type'>) {
  const [video] = await db
    .insert(videos)
    .values({ title: 'T', prompt: 'p', style: 'Réaliste', durationSeconds: 10, ...values })
    .returning();
  if (!video) throw new Error('Vidéo non insérée');
  return video;
}

export async function countRows(table: PgTable, filter?: SQL): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table).where(filter);
  return row?.value ?? 0;
}

/**
 * Compositeur vidéo factice : chaque opération écrit un petit fichier et
 * enregistre l'appel (aucun ffmpeg pendant les tests).
 */
export const fakeComposer: VideoComposer & { calls: { op: string; args: unknown[] }[] } = {
  calls: [],
  async normalizeClip(input, output, frame, seconds) {
    this.calls.push({ op: 'normalizeClip', args: [input, frame, seconds] });
    await fs.writeFile(output, 'clip');
  },
  async imageClip(image, output, frame, seconds) {
    this.calls.push({ op: 'imageClip', args: [image, frame, seconds] });
    await fs.writeFile(output, 'clip');
  },
  async fitImage(image, output, frame) {
    this.calls.push({ op: 'fitImage', args: [image, frame] });
    await fs.writeFile(output, 'jpeg');
  },
  async concat(clips, output) {
    this.calls.push({ op: 'concat', args: [clips.length] });
    await fs.writeFile(output, 'montage');
  },
  async mixAudio(_video, tracks, output, seconds) {
    this.calls.push({
      op: 'mixAudio',
      args: [Boolean(tracks.voice), Boolean(tracks.music), seconds],
    });
    await fs.writeFile(output, 'final');
  },
  async ambientMusic(mood, output, seconds) {
    this.calls.push({ op: 'ambientMusic', args: [mood, seconds] });
    await fs.writeFile(output, 'music');
  },
  async thumbnail(_video, output) {
    this.calls.push({ op: 'thumbnail', args: [] });
    await fs.writeFile(output, 'jpeg');
  },
  async duration() {
    return 0;
  },
};
setVideoComposer(fakeComposer);

/** Image PNG minimale valide (vraie signature, pour la vérification du contenu). */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Code à 6 chiffres du dernier email de réinitialisation. */
export function lastEmailCode(): string {
  const message = outbox.outbox.at(-1);
  const match = message?.text.match(/code de réinitialisation : (\d{6})/);
  if (!match?.[1]) throw new Error('Aucun code trouvé dans le dernier email');
  return match[1];
}

/** Dernier jeton présent dans un email (lien `…?token=xxx`). */
export function lastEmailToken(): string {
  const message = outbox.outbox.at(-1);
  const match = message?.text.match(/token=([a-f0-9]{64})/);
  if (!match?.[1]) throw new Error('Aucun jeton trouvé dans le dernier email');
  return match[1];
}
