import { eq } from 'drizzle-orm';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';

import { db } from '../config/database';
import type { Role } from '../constants';
import { users } from '../db/schema';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken } from '../utils/jwt';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractBearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token || undefined;
}

/**
 * Vérifie le jeton puis recharge le rôle depuis la base : un compte supprimé,
 * rétrogradé ou dont le mot de passe a changé perd immédiatement l'accès.
 */
async function resolveUser(token: string): Promise<{ id: string; role: Role }> {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Session expirée.', 401, { code: 'TOKEN_EXPIRED' });
    }
    throw AppError.unauthorized('Jeton invalide.');
  }

  // Jeton émis avant le passage à PostgreSQL (identifiant MongoDB) : compte à reconnecter.
  if (!UUID_PATTERN.test(payload.sub)) throw AppError.unauthorized('Compte introuvable.');

  const [user] = await db
    .select({ role: users.role, passwordChangedAt: users.passwordChangedAt })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);
  if (!user) throw AppError.unauthorized('Compte introuvable.');

  // `iat` est en secondes : on compare à la seconde près pour accepter le jeton émis juste après le changement.
  if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) {
    throw new AppError('Mot de passe modifié. Veuillez vous reconnecter.', 401, {
      code: 'TOKEN_REVOKED',
    });
  }

  return { id: payload.sub, role: user.role };
}

export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req);
  if (!token) throw AppError.unauthorized();
  req.user = await resolveUser(token);
  next();
});

/** Authentification facultative : enrichit la réponse (isLiked…) si un jeton valide est fourni. */
export const optionalAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
    } catch {
      // Jeton invalide sur une route publique : on continue en anonyme.
    }
  }
  next();
});

export function authorize(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden("Vous n'avez pas les droits nécessaires."));
      return;
    }
    next();
  };
}

/** Accès sûr à l'utilisateur dans un contrôleur placé derrière `authenticate`. */
export function currentUser(req: Request): { id: string; role: Role } {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
