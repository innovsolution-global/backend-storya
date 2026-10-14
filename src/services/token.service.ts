import crypto from 'node:crypto';

import { and, eq, gt, isNull, lt } from 'drizzle-orm';

import { db } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { Role } from '../constants';
import { refreshTokens } from '../db/schema';
import { AppError } from '../utils/AppError';
import { generateToken, hashToken } from '../utils/crypto';
import { signAccessToken } from '../utils/jwt';

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/**
 * Fenêtre pendant laquelle un refresh token tout juste remplacé peut être
 * présenté à nouveau sans être considéré comme volé (requêtes parallèles de l'app).
 */
const REUSE_GRACE_MS = 10_000;

async function issue(
  userId: string,
  role: Role,
  family: string,
  meta: ClientMeta,
): Promise<TokenPair> {
  const { token, hash } = generateToken(48);
  const refreshTokenExpiresAt = new Date(
    Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  );
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hash,
    family,
    expiresAt: refreshTokenExpiresAt,
    userAgent: meta.userAgent?.slice(0, 300),
    ip: meta.ip?.slice(0, 64),
  });
  return { accessToken: signAccessToken(userId, role), refreshToken: token, refreshTokenExpiresAt };
}

export const tokenService = {
  /** Nouvelle session (login, register) : nouvelle famille de refresh tokens. */
  createSession(userId: string, role: Role, meta: ClientMeta): Promise<TokenPair> {
    return issue(userId, role, crypto.randomUUID(), meta);
  },

  /**
   * Rotation : le refresh token présenté est révoqué et remplacé.
   * La mise à jour conditionnelle (`revoked_at IS NULL`) garantit qu'un même jeton
   * ne peut être échangé qu'une seule fois, même en cas de requêtes simultanées.
   */
  async rotate(
    refreshToken: string,
    resolveRole: (userId: string) => Promise<Role | null>,
    meta: ClientMeta,
  ): Promise<TokenPair & { userId: string }> {
    const tokenHash = hashToken(refreshToken);
    const now = new Date();

    const [current] = await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .returning();

    if (!current) {
      const [known] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);
      if (known?.revokedAt) {
        const reusedAfterGrace = now.getTime() - known.revokedAt.getTime() > REUSE_GRACE_MS;
        if (reusedAfterGrace && known.replacedByHash) {
          // Jeton déjà échangé puis rejoué : vol probable → on coupe toute la session.
          await db
            .update(refreshTokens)
            .set({ revokedAt: now })
            .where(and(eq(refreshTokens.family, known.family), isNull(refreshTokens.revokedAt)));
          logger.warn(
            { userId: known.userId, family: known.family },
            'Réutilisation de refresh token détectée',
          );
        }
      }
      throw AppError.unauthorized('Session expirée. Veuillez vous reconnecter.');
    }

    const { userId } = current;
    const role = await resolveRole(userId);
    if (!role) {
      throw AppError.unauthorized('Session expirée. Veuillez vous reconnecter.');
    }

    const pair = await issue(userId, role, current.family, meta);
    await db
      .update(refreshTokens)
      .set({ replacedByHash: hashToken(pair.refreshToken) })
      .where(eq(refreshTokens.id, current.id));
    return { ...pair, userId };
  },

  async revoke(refreshToken: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(refreshTokens.tokenHash, hashToken(refreshToken)), isNull(refreshTokens.revokedAt)),
      );
  },

  async revokeAllForUser(userId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  },

  /** Supprime les jetons expirés (remplace l'index TTL de MongoDB) ; lancé périodiquement. */
  async purgeExpired(): Promise<number> {
    const deleted = await db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, new Date()))
      .returning({ id: refreshTokens.id });
    return deleted.length;
  },
};
