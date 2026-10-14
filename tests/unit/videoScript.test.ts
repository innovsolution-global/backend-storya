import { describe, expect, it } from 'vitest';

import {
  assignImages,
  buildDemoScript,
  deriveTitle,
  splitIntoScenes,
} from '../../src/services/videoScript.service';

describe('découpage en scènes', () => {
  it('couvre exactement la durée, en scènes de 4 à 8 secondes', () => {
    for (const total of [10, 15, 29, 30, 60, 90, 121, 150]) {
      const scenes = splitIntoScenes(total);
      expect(scenes.reduce((sum, s) => sum + s, 0)).toBe(total);
      expect(Math.max(...scenes)).toBeLessThanOrEqual(8);
      expect(Math.min(...scenes)).toBeGreaterThanOrEqual(5);
    }
    expect(splitIntoScenes(150)).toHaveLength(19);
  });

  it('répartit les images sur toute la vidéo', () => {
    expect(assignImages(4, 0)).toEqual([undefined, undefined, undefined, undefined]);
    expect(assignImages(4, 2)).toEqual([0, 0, 1, 1]);
    expect(assignImages(3, 5)).toEqual([0, 1, 3]);
  });
});

describe('titre et script démo', () => {
  it('déduit le titre comme dans l’app', () => {
    expect(deriveTitle({ type: 'publicite', prompt: 'Super café', brand: 'Café Kaloum' })).toBe(
      'Pub Café Kaloum',
    );
    expect(deriveTitle({ type: 'storytelling', prompt: 'retour au pays. Après dix ans…' })).toBe(
      'Retour au pays',
    );
  });

  it('construit un script démo cohérent avec la durée et la voix', () => {
    const script = buildDemoScript(
      {
        type: 'publicite',
        prompt: 'un café torréfié à Conakry',
        style: 'Premium',
        durationSeconds: 30,
        voice: 'feminine',
        brand: 'Café Kaloum',
        callToAction: 'Commander',
      },
      0,
    );
    expect(script.scenes).toHaveLength(4);
    expect(script.narration).toContain('Café Kaloum');
    expect(script.scenes.at(-1)?.narration).toBe('Café Kaloum. Commander !');

    const silent = buildDemoScript(
      { type: 'cartoon', prompt: 'baobab', style: 'Anime', durationSeconds: 10, voice: 'aucune' },
      1,
    );
    expect(silent.narration).toBe('');
    expect(silent.scenes.every((scene) => scene.imageIndex === 0)).toBe(true);
  });
});
