import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import type { Options } from 'express-rate-limit';

import { env, isTest } from '../config/env';
import { langOf, localize } from '../i18n';

const handler: Options['handler'] = (_req, res, _next, options) => {
  res.status(options.statusCode).json({
    success: false,
    message: localize(
      typeof options.message === 'string' ? options.message : 'Trop de requêtes.',
      langOf(res),
    ),
  });
};

const base = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  handler,
  // Les tests d'intégration enchaînent beaucoup de requêtes : limites désactivées.
  skip: () => isTest,
};

export const globalLimiter = rateLimit({
  ...base,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  message: 'Trop de requêtes. Réessayez dans quelques minutes.',
});

/** Login / register : limite par IP + email pour freiner le credential stuffing. */
export const authLimiter = rateLimit({
  ...base,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  message: 'Trop de tentatives. Réessayez dans quelques minutes.',
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${req.ip}:${email}`;
  },
});

/** Emails de reset / vérification : très peu de demandes légitimes. */
export const sensitiveLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: 'Trop de demandes. Réessayez dans une heure.',
});

/** Générations IA : coûteuses, limitées en plus du quota journalier. */
export const generationLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 3,
  message: 'Trop de générations lancées. Patientez une minute.',
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'anonymous',
});
