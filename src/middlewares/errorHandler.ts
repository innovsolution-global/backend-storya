import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

import { isProduction } from '../config/env';
import { logger } from '../config/logger';
import { pgErrorCode } from '../db/helpers';
import { langOf, localize } from '../i18n';
import { AppError } from '../utils/AppError';
import { zodErrorToFieldErrors } from './validate';

export const notFound: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route introuvable : ${req.method} ${req.originalUrl}`));
};

/** Convertit les erreurs connues des bibliothèques en AppError. */
function normalize(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return AppError.badRequest('Données invalides.', zodErrorToFieldErrors(error));
  }

  // Erreurs PostgreSQL (codes SQLSTATE).
  switch (pgErrorCode(error)) {
    case '23505': // unique_violation
      return AppError.conflict('Cette ressource existe déjà.');
    case '22P02': // invalid_text_representation (ex. UUID mal formé)
    case '22001': // string_data_right_truncation
    case '23502': // not_null_violation
    case '23503': // foreign_key_violation
    case '23514': // check_violation
      return AppError.badRequest('Données invalides.');
  }

  if (error instanceof MulterError) {
    const messages: Partial<Record<MulterError['code'], string>> = {
      LIMIT_FILE_SIZE: 'Fichier trop volumineux.',
      LIMIT_FILE_COUNT: 'Trop de fichiers envoyés.',
      LIMIT_UNEXPECTED_FILE: `Fichier inattendu ou trop nombreux (champ « ${error.field ?? '?'} »).`,
    };
    return AppError.badRequest(messages[error.code] ?? `Upload refusé : ${error.message}`);
  }

  // Corps JSON mal formé (body-parser).
  if ((error as { type?: string }).type === 'entity.parse.failed') {
    return AppError.badRequest('Corps de requête JSON invalide.');
  }
  if ((error as { type?: string }).type === 'entity.too.large') {
    return new AppError('Corps de requête trop volumineux.', 413);
  }

  return new AppError('Erreur interne du serveur.', 500, { isOperational: false });
}

// Express identifie un middleware d'erreur par ses 4 paramètres.
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError = normalize(error);

  if (!appError.isOperational || appError.statusCode >= 500) {
    logger.error({ err: error, method: req.method, url: req.originalUrl }, 'Erreur serveur');
  } else {
    logger.warn(
      { status: appError.statusCode, url: req.originalUrl, message: appError.message },
      'Requête refusée',
    );
  }

  // Messages écrits en français dans le code, traduits selon la langue de la requête.
  const lang = langOf(res);
  res.status(appError.statusCode).json({
    success: false,
    message: localize(appError.message, lang),
    ...(appError.code ? { code: appError.code } : {}),
    ...(appError.errors
      ? {
          errors: appError.errors.map((e) => ({
            field: e.field,
            message: localize(e.message, lang),
          })),
        }
      : {}),
    ...(!isProduction && !appError.isOperational && error instanceof Error
      ? { stack: error.stack }
      : {}),
  });
};
