import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';

import { AppError } from '../utils/AppError';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function zodErrorToFieldErrors(error: ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(racine)',
    message: issue.message,
  }));
}

/**
 * Valide body / query / params et remplace les valeurs brutes par les valeurs
 * nettoyées (types convertis, champs inconnus rejetés, valeurs par défaut appliquées).
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(AppError.badRequest('Données invalides.', zodErrorToFieldErrors(error)));
        return;
      }
      next(error);
    }
  };
}
