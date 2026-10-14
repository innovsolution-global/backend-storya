import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

import { env } from '../config/env';
import type { Role } from '../constants';
import { ROLES } from '../constants';

const ISSUER = 'storya-api';
const AUDIENCE = 'storya-app';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  /** Date d'émission en secondes (claim standard `iat`). */
  iat: number;
}

export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
  });
}

/** Lève une erreur jsonwebtoken si le jeton est invalide ou expiré. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  if (
    typeof decoded === 'string' ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.iat !== 'number' ||
    !ROLES.includes(decoded.role as Role)
  ) {
    throw new jwt.JsonWebTokenError('Payload JWT invalide');
  }
  return { sub: decoded.sub, role: decoded.role as Role, iat: decoded.iat };
}
