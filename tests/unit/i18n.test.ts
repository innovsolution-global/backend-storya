import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ASPECT_RATIOS,
  PREMIUM_OFFERS,
  VIDEO_MUSIC,
  VIDEO_STEPS,
  VIDEO_TYPES,
  VIDEO_VOICES,
} from '../../src/constants';
import { englishMessages } from '../../src/i18n/en';
import { langFromHeader, localize, resolveUserLang, runWithLang, t } from '../../src/i18n';

const SRC = path.join(__dirname, '..', '..', 'src');

/** Dossiers et fichiers dont les textes ne sont pas des messages renvoyés à l'app. */
const SKIPPED = [
  'i18n',
  'docs',
  'scripts',
  'config',
  'constants',
  // Consignes envoyées à GPT (en français, jamais montrées) ; le script de démo passe par t().
  path.join('services', 'videoScript.service.ts'),
  // Emails : écrits avec t(), vérifiés plus bas.
  path.join('services', 'email.service.ts'),
];

/** Erreurs internes : jamais montrées (masquées en « Erreur interne du serveur. »). */
const INTERNAL = new Set([
  'Montant de paiement incohérent',
  'Montant incohérent',
  'Initialisation impossible',
  'Chemin de média invalide',
  'Payload JWT invalide',
  'Upload Cloudinary sans résultat',
  'Vérification CinetPay sans données',
  'Initialisation CinetPay échouée',
  'Sora indisponible pour la scène',
  'ffmpeg introuvable : installez ffmpeg-static ou définissez FFMPEG_PATH.',
  'Base de données indisponible',
  'Traitement de notification échoué',
  'Requête refusée',
  'Générations vidéo récupérées',
  'Abonnement Premium activé',
  'Réutilisation de refresh token détectée',
  'OpenAI texte',
  'Vidéo',
  'Storya API',
  '[masqué]',
  // Valeur de style par défaut (donnée renvoyée telle quelle, traduite par l'app).
  'Cinématique',
]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    const rel = path.relative(SRC, full);
    if (SKIPPED.some((skip) => rel === skip || rel.startsWith(`${skip}${path.sep}`))) return [];
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Exemple concret d'un littéral : `${a ? 's' : ''}` prend la 1re branche
 * (pluriel), les autres `${…}` deviennent « 7 ».
 */
function sample(literal: string): string {
  return literal
    .replace(/\$\{[^}]*\?\s*'([^']*)'\s*:\s*'[^']*'\s*\}/g, '$1')
    .replace(/\$\{[^}]*\}/g, '7');
}

/** Messages en français du code (littéraux) qui peuvent atteindre l'app. */
function frenchMessages(): string[] {
  const literal = /'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  const looksFrench = /[éèêàùçôîœ]|^[A-ZÀ-Ý][a-zà-ÿ]+ [a-zà-ÿ]/;
  const found = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const code = line.trim();
      if (/^(\/\/|\/\*|\*|import )/.test(code)) continue;
      if (code.includes('logger.')) continue;
      for (const match of code.matchAll(literal)) {
        const raw = (match[1] ?? match[2] ?? '').replace(/\\'/g, "'");
        const text = sample(raw);
        if (looksFrench.test(text) && !INTERNAL.has(raw) && !raw.startsWith('video:'))
          found.add(text);
      }
    }
  }
  return [...found];
}

describe('langue de la requête', () => {
  it('lit Accept-Language et retombe sur le français', () => {
    expect(langFromHeader(undefined)).toBe('fr');
    expect(langFromHeader('en')).toBe('en');
    expect(langFromHeader('en-US,en;q=0.9')).toBe('en');
    expect(langFromHeader('de-DE,de;q=0.9,en;q=0.8')).toBe('en');
    expect(langFromHeader('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(langFromHeader('en;q=0.5,fr;q=0.9')).toBe('fr');
    expect(langFromHeader('wo-SN')).toBe('fr');
  });

  it('réglage du compte prioritaire, sinon langue de la requête', () => {
    expect(resolveUserLang('en')).toBe('en');
    expect(resolveUserLang('system', 'en')).toBe('en');
    expect(runWithLang('en', () => resolveUserLang('system', 'fr'))).toBe('en');
    expect(runWithLang('en', () => resolveUserLang('fr'))).toBe('fr');
    expect(resolveUserLang(undefined)).toBe('fr');
  });
});

describe('traduction des messages', () => {
  it('traduit les messages fixes et les gabarits, y compris leurs valeurs connues', () => {
    expect(localize('Vidéo introuvable.', 'en')).toBe('Video not found.');
    expect(localize('Vidéo introuvable.', 'fr')).toBe('Vidéo introuvable.');
    expect(localize('Scène 3 sur 8 prête', 'en')).toBe('Scene 3 of 8 ready');
    expect(localize('Code incorrect. Il vous reste 1 essai.', 'en')).toBe(
      'Incorrect code. You have 1 attempt left.',
    );
    expect(localize('Code incorrect. Il vous reste 4 essais.', 'en')).toBe(
      'Incorrect code. You have 4 attempts left.',
    );
    expect(localize('Message clé : 160 caractères maximum.', 'en')).toBe(
      'Key message: 160 characters max.',
    );
    expect(localize('Veo : crédit ou quota épuisé côté fournisseur.', 'en')).toBe(
      'Veo: credit or quota exhausted with the provider.',
    );
    expect(localize('Texte inconnu', 'en')).toBe('Texte inconnu');
  });

  it('t() remplace les paramètres dans la bonne langue', () => {
    expect(t('Pub {brand}', { brand: 'Kaloum' }, 'fr')).toBe('Pub Kaloum');
    expect(t('Pub {brand}', { brand: 'Kaloum' }, 'en')).toBe('Kaloum ad');
  });

  it('chaque message du code susceptible d’atteindre l’app a sa traduction anglaise', () => {
    const missing = frenchMessages().filter((text) => localize(text, 'en') === text);
    expect(missing).toEqual([]);
  });

  it('chaque texte écrit avec t() a sa traduction anglaise', () => {
    const files = [
      ...sourceFiles(SRC),
      path.join(SRC, 'services', 'email.service.ts'),
      path.join(SRC, 'services', 'videoScript.service.ts'),
    ];
    const keys = files.flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/\bt\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g)].map(
        (m) => (m[2] ?? '').replace(/\\'/g, "'").replace(/\\n/g, '\n'),
      ),
    );
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((key) => !(key in englishMessages))).toEqual([]);
  });

  it('libellés renvoyés à l’app traduits', () => {
    const labels = [
      ...Object.values(VIDEO_TYPES),
      ...Object.values(VIDEO_VOICES),
      ...Object.values(VIDEO_MUSIC),
      ...VIDEO_STEPS,
      ...Object.values(PREMIUM_OFFERS).map((offer) => offer.label),
      ...Object.values(ASPECT_RATIOS).map((ratio) => ratio.label),
    ];
    const untranslated = labels.filter(
      (label) =>
        localize(label, 'en') === label &&
        !['Storytelling', 'Cartoon', 'Masculine', 'Vertical', 'Horizontal'].includes(label),
    );
    expect(untranslated).toEqual([]);
  });

  it('les traductions gardent les mêmes paramètres {…}', () => {
    const params = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort()
        .join(',');
    const broken = Object.entries(englishMessages).filter(([fr, en]) => params(fr) !== params(en));
    expect(broken).toEqual([]);
  });
});
