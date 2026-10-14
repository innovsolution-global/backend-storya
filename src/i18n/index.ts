import { AsyncLocalStorage } from 'node:async_hooks';

import type { RequestHandler, Response } from 'express';

import { englishMessages } from './en';

/**
 * Langues de l'API. Le code écrit ses messages en français ; ils sont traduits
 * au moment d'être renvoyés au client, selon la langue de la requête.
 */
export const LANGS = ['fr', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** Réglage de langue d'un compte : `system` suit la langue du téléphone. */
export const LANGUAGE_SETTINGS = ['system', 'fr', 'en'] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

const storage = new AsyncLocalStorage<Lang>();

/**
 * Langue demandée par l'en-tête `Accept-Language` (« en-US,en;q=0.9 », « fr »…).
 * Première langue prise en charge par ordre de préférence ; français par défaut.
 */
export function langFromHeader(header: string | undefined): Lang {
  if (!header) return 'fr';
  const tags = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().toLowerCase().split(';');
      const q = Number(params.find((p) => p.trim().startsWith('q='))?.split('=')[1] ?? 1);
      return { lang: tag.split('-')[0] ?? '', q: Number.isFinite(q) ? q : 0 };
    })
    .filter((t) => t.q > 0)
    .sort((a, b) => b.q - a.q);
  const match = tags.find((t) => (LANGS as readonly string[]).includes(t.lang));
  return (match?.lang as Lang | undefined) ?? 'fr';
}

/** Langue de la requête en cours (français hors requête, ex. tâches de fond). */
export function currentLang(): Lang {
  return storage.getStore() ?? 'fr';
}

/** Exécute [fn] avec une langue donnée (emails envoyés depuis une tâche de fond). */
export function runWithLang<T>(lang: Lang, fn: () => T): T {
  return storage.run(lang, fn);
}

/**
 * Langue effective d'un utilisateur : son réglage s'il en a choisi une,
 * sinon celle de la requête (ou [fallback] hors requête).
 */
export function resolveUserLang(setting: LanguageSetting | undefined, fallback?: Lang): Lang {
  if (setting === 'fr' || setting === 'en') return setting;
  return storage.getStore() ?? fallback ?? 'fr';
}

/** Langue de la requête, mémorisée sur la réponse par [detectLanguage]. */
export function langOf(res: Response): Lang {
  return (res.locals.lang as Lang | undefined) ?? currentLang();
}

/**
 * Exécute [fn] dans la langue de la requête. Le contexte asynchrone peut se perdre
 * après la lecture du corps (JSON, multipart) : les contrôleurs le rétablissent ici.
 */
export function withRequestLang<T>(res: Response, fn: () => T): T {
  return storage.run(langOf(res), fn);
}

/** Détecte la langue de la requête et la rend disponible à tout le traitement. */
export const detectLanguage: RequestHandler = (req, res, next) => {
  const lang = langFromHeader(req.get('accept-language'));
  res.locals.lang = lang;
  res.setHeader('Content-Language', lang);
  res.vary('Accept-Language');
  storage.run(lang, next);
};

// ─── Traduction ─────────────────────────────────────────────────────────────

interface Template {
  pattern: RegExp;
  names: string[];
  english: string;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Les clés avec `{param}` deviennent des gabarits : « Scène {n} sur {total} prête ». */
const templates: Template[] = Object.entries(englishMessages)
  .filter(([french]) => /\{\w+\}/.test(french))
  .map(([french, english]) => {
    const names: string[] = [];
    const source = french
      .split(/(\{\w+\})/)
      .map((part) => {
        const param = /^\{(\w+)\}$/.exec(part);
        if (!param) return escapeRegex(part);
        names.push(param[1] ?? '');
        return '(.+?)';
      })
      .join('');
    return { pattern: new RegExp(`^${source}$`, 's'), names, english };
  })
  // Les gabarits les plus précis (le plus de texte fixe) d'abord.
  .sort((a, b) => b.pattern.source.length - a.pattern.source.length);

/**
 * Traduit un message français dans la langue [lang] (par défaut celle de la
 * requête). Un message inconnu est renvoyé tel quel.
 */
export function localize(text: string, lang: Lang = currentLang()): string {
  if (lang === 'fr' || !text) return text;
  const exact = englishMessages[text];
  if (exact !== undefined) return exact;
  for (const { pattern, names, english } of templates) {
    const match = pattern.exec(text);
    if (!match) continue;
    return names.reduce(
      // Les valeurs reconnues (« Message clé », « Voix off »…) sont traduites aussi.
      (result, name, index) => result.replace(`{${name}}`, localize(match[index + 1] ?? '', lang)),
      english,
    );
  }
  return text;
}

/** Message écrit directement avec ses paramètres : `t('Bonjour {name}', { name })`. */
export function t(
  french: string,
  params: Record<string, string | number> = {},
  lang = currentLang(),
): string {
  const text = lang === 'en' ? (englishMessages[french] ?? french) : french;
  return Object.entries(params).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    text,
  );
}
