import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { humanizeProviderError, shouldTryFallbackKey } from '../../src/integrations/ai/errors';
import { hasValidSignature } from '../../src/utils/fileSignature';
import { escapeRegex, paginationMeta, parseSort, skipFor } from '../../src/utils/pagination';

describe('pagination', () => {
  it('calcule le décalage et les métadonnées', () => {
    expect(skipFor({ page: 3, limit: 20 })).toBe(40);
    expect(paginationMeta({ page: 1, limit: 20 }, 45)).toEqual({
      page: 1,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
    });
    expect(paginationMeta({ page: 1, limit: 20 }, 0).totalPages).toBe(1);
  });

  it('ne trie que sur les champs autorisés', () => {
    expect(
      parseSort(
        '-views,title,password',
        { views: 'stats.views', title: 'title' },
        { createdAt: -1 },
      ),
    ).toEqual({
      'stats.views': -1,
      title: 1,
    });
    expect(parseSort('password', { title: 'title' }, { createdAt: -1 })).toEqual({ createdAt: -1 });
  });

  it('échappe les caractères spéciaux de RegExp', () => {
    expect(new RegExp(escapeRegex('a.*(b')).test('a.*(b')).toBe(true);
    expect(new RegExp(escapeRegex('a.*')).test('abc')).toBe(false);
  });
});

describe('erreurs des fournisseurs IA', () => {
  it('traduit les erreurs OpenAI en français', () => {
    expect(humanizeProviderError('OpenAI', 429, { error: { code: 'insufficient_quota' } })).toMatch(
      /quota épuisé/,
    );
    expect(
      humanizeProviderError('OpenAI', 429, { error: { code: 'rate_limit_exceeded' } }),
    ).toMatch(/trop de requêtes/);
    expect(humanizeProviderError('OpenAI', 401, '')).toMatch(/clé API invalide/);
    expect(humanizeProviderError('Sora', 400, { error: { message: 'Prompt refusé' } })).toBe(
      'Sora : Prompt refusé',
    );
  });

  it('ne bascule sur la clé de secours que si elle peut aider', () => {
    expect(shouldTryFallbackKey(401, '')).toBe(true);
    expect(shouldTryFallbackKey(429, { error: { code: 'insufficient_quota' } })).toBe(true);
    expect(shouldTryFallbackKey(429, { error: { code: 'rate_limit_exceeded' } })).toBe(false);
    expect(shouldTryFallbackKey(500, '')).toBe(false);
  });
});

describe('signature des fichiers', () => {
  async function tempFile(bytes: number[]): Promise<string> {
    const file = path.join(os.tmpdir(), `storya-sig-${Date.now()}-${Math.random()}`);
    await fs.writeFile(file, Buffer.from([...bytes, ...new Array(16).fill(0)]));
    return file;
  }

  it('reconnaît un vrai PNG et refuse un script renommé', async () => {
    const png = await tempFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fake = await tempFile([...Buffer.from('<?php echo 1;')]);
    expect(await hasValidSignature(png, 'image')).toBe(true);
    expect(await hasValidSignature(fake, 'image')).toBe(false);
    await Promise.all([fs.unlink(png), fs.unlink(fake)]);
  });

  it('reconnaît un MP4 (boîte ftyp)', async () => {
    const mp4 = await tempFile([0, 0, 0, 0x18, ...Buffer.from('ftypmp42')]);
    expect(await hasValidSignature(mp4, 'video')).toBe(true);
    await fs.unlink(mp4);
  });
});
