import type { RequestHandler } from 'express';
import { FilterXSS } from 'xss';

/**
 * Supprime toute balise HTML : l'API ne stocke que du texte brut.
 * Le texte hors balises n'est pas échappé (« Dakar > Bamako » reste intact).
 */
const filter = new FilterXSS({
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
  escapeHtml: (html) => html,
});

function clean(value: unknown): unknown {
  if (typeof value === 'string') return filter.process(value);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      // Clés d'opérateurs ($gt, $where…) ou pointées écartées : défense en profondeur
      // (les requêtes SQL sont paramétrées, mais ces clés n'ont rien à faire dans une saisie).
      if (key.startsWith('$') || key.includes('.')) continue;
      result[key] = clean(nested);
    }
    return result;
  }
  return value;
}

/**
 * Nettoie body, query et params avant la validation Zod.
 * Les mots de passe ne sont pas modifiés (ils sont hashés, jamais réaffichés).
 */
export const sanitizeInput: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    const { password, currentPassword, newPassword, ...rest } = req.body as Record<string, unknown>;
    req.body = {
      ...(clean(rest) as Record<string, unknown>),
      ...(password !== undefined ? { password } : {}),
      ...(currentPassword !== undefined ? { currentPassword } : {}),
      ...(newPassword !== undefined ? { newPassword } : {}),
    };
  }
  req.query = clean(req.query) as typeof req.query;
  req.params = clean(req.params) as typeof req.params;
  next();
};
