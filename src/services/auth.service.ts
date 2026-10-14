import bcrypt from 'bcrypt';
import { and, eq, gt } from 'drizzle-orm';

import { db } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { uniqueViolation } from '../db/helpers';
import { users } from '../db/schema';
import { findUserByEmail, findUserById, updateUser } from '../db/users';
import { resolveUserLang } from '../i18n';
import type { IUser } from '../models';
import { comparePassword, hashPassword, isLocked } from '../models';
import { AppError } from '../utils/AppError';
import { generateNumericCode, generateToken, hashToken, safeEqual } from '../utils/crypto';
import type { LoginInput, RegisterInput, ResetPasswordInput } from '../validators/auth.validator';
import { emailService } from './email.service';
import type { ClientMeta, TokenPair } from './token.service';
import { promotionService } from './promotion.service';
import { tokenService } from './token.service';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;
const INVALID_CREDENTIALS = 'Email ou mot de passe incorrect.';
export const PHONE_TAKEN = 'Un compte existe déjà avec ce numéro de téléphone.';
const EMAIL_TAKEN = 'Un compte existe déjà avec cet email.';
const INVALID_RESET_CODE = 'Code invalide ou expiré. Demandez un nouveau code.';

/** Empreinte liée à l'utilisateur : un même code n'a pas la même empreinte d'un compte à l'autre. */
function resetCodeHash(userId: string, code: string): string {
  return hashToken(`${userId}:${code}`);
}

/** Hash factice : on compare quand même quand l'email est inconnu, pour un temps de réponse constant. */
const DUMMY_HASH = bcrypt.hashSync('storya-timing-protection', 10);

export interface AuthResult extends TokenPair {
  user: IUser;
}

async function issueEmailVerification(user: IUser): Promise<void> {
  const { token, hash } = generateToken();
  await updateUser(user, {
    emailVerificationTokenHash: hash,
    emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });
  await emailService.sendVerificationEmail(
    user.email,
    user.firstName,
    token,
    resolveUserLang(user.settings?.language),
  );
}

async function registerFailedLogin(user: IUser): Promise<void> {
  const attempts = (user.failedLoginAttempts ?? 0) + 1;
  if (attempts >= env.MAX_LOGIN_ATTEMPTS) {
    await updateUser(user, {
      failedLoginAttempts: 0,
      lockUntil: new Date(Date.now() + env.LOCK_TIME_MINUTES * 60 * 1000),
    });
    logger.warn({ userId: user.id }, 'Compte verrouillé après trop de tentatives');
  } else {
    await updateUser(user, { failedLoginAttempts: attempts });
  }
}

export const authService = {
  async register(input: RegisterInput, meta: ClientMeta): Promise<AuthResult> {
    if (await findUserByEmail(input.email)) throw AppError.conflict(EMAIL_TAKEN);
    const [phoneOwner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, input.phone))
      .limit(1);
    if (phoneOwner) throw AppError.conflict(PHONE_TAKEN);

    let user: IUser | undefined;
    try {
      [user] = await db
        .insert(users)
        .values({
          firstName: input.firstName,
          email: input.email.toLowerCase(),
          phone: input.phone,
          password: await hashPassword(input.password),
          preferences: { genres: input.genres, videoTypes: input.videoTypes },
        })
        .returning();
    } catch (error) {
      // Course entre deux inscriptions simultanées : la contrainte d'unicité tranche.
      const constraint = uniqueViolation(error);
      if (constraint !== undefined) {
        throw AppError.conflict(constraint.includes('phone') ? PHONE_TAKEN : EMAIL_TAKEN);
      }
      throw error;
    }
    if (!user) throw new Error('Insertion utilisateur sans résultat');

    await issueEmailVerification(user);
    // Essai Premium gratuit en cours : accordé dès l'inscription.
    await promotionService.applyTrial(user);
    const tokens = await tokenService.createSession(user.id, user.role, meta);
    return { user, ...tokens };
  },

  async login(input: LoginInput, meta: ClientMeta): Promise<AuthResult> {
    const user = await findUserByEmail(input.email);

    if (!user) {
      await bcrypt.compare(input.password, DUMMY_HASH);
      throw AppError.unauthorized(INVALID_CREDENTIALS);
    }

    if (isLocked(user)) {
      const minutes = Math.ceil(((user.lockUntil?.getTime() ?? 0) - Date.now()) / 60_000);
      throw AppError.locked(
        `Trop de tentatives échouées. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      );
    }

    const valid = await comparePassword(user, input.password);
    if (!valid) {
      await registerFailedLogin(user);
      throw AppError.unauthorized(INVALID_CREDENTIALS);
    }

    await updateUser(user, { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: new Date() });

    const tokens = await tokenService.createSession(user.id, user.role, meta);
    return { user, ...tokens };
  },

  async refresh(refreshToken: string, meta: ClientMeta): Promise<AuthResult> {
    const resolved: { user?: IUser } = {};
    const pair = await tokenService.rotate(
      refreshToken,
      async (userId) => {
        resolved.user = await findUserById(userId);
        return resolved.user?.role ?? null;
      },
      meta,
    );
    if (!resolved.user) throw AppError.unauthorized('Session expirée. Veuillez vous reconnecter.');
    // L'app mobile renouvelle sa session sans se reconnecter : c'est aussi une visite
    // (« dernière activité » et utilisateurs actifs du back-office).
    await updateUser(resolved.user, { lastLoginAt: new Date() });
    return { user: resolved.user, ...pair };
  },

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await tokenService.revoke(refreshToken);
  },

  async logoutAll(userId: string): Promise<void> {
    await tokenService.revokeAllForUser(userId);
  },

  /**
   * Envoie un code à 6 chiffres (15 min, usage unique). Réponse identique que
   * l'email existe ou non (pas d'énumération de comptes).
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await findUserByEmail(email);
    if (!user) return;
    const code = generateNumericCode();
    await updateUser(user, {
      passwordResetTokenHash: resetCodeHash(user.id, code),
      passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      passwordResetAttempts: 0,
    });
    await emailService.sendPasswordResetEmail(
      user.email,
      user.firstName,
      code,
      resolveUserLang(user.settings?.language),
    );
  },

  /** Au-delà de 5 codes erronés, le code est annulé : il faut en redemander un. */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const user = await findUserByEmail(input.email);
    const expires = user?.passwordResetExpires?.getTime() ?? 0;
    if (!user?.passwordResetTokenHash || expires <= Date.now()) {
      throw AppError.badRequest(INVALID_RESET_CODE);
    }

    if (!safeEqual(user.passwordResetTokenHash, resetCodeHash(user.id, input.code))) {
      const attempts = (user.passwordResetAttempts ?? 0) + 1;
      if (attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
        await updateUser(user, {
          passwordResetTokenHash: null,
          passwordResetExpires: null,
          passwordResetAttempts: 0,
        });
        throw AppError.badRequest('Trop de codes erronés. Demandez un nouveau code.');
      }
      await updateUser(user, { passwordResetAttempts: attempts });
      const left = PASSWORD_RESET_MAX_ATTEMPTS - attempts;
      throw AppError.badRequest(
        `Code incorrect. Il vous reste ${left} essai${left > 1 ? 's' : ''}.`,
      );
    }

    await updateUser(user, {
      password: await hashPassword(input.password),
      passwordChangedAt: new Date(),
      passwordResetTokenHash: null,
      passwordResetExpires: null,
      passwordResetAttempts: 0,
      failedLoginAttempts: 0,
      lockUntil: null,
    });
    // Toutes les sessions existantes sont fermées après un changement de mot de passe.
    await tokenService.revokeAllForUser(user.id);
  },

  async verifyEmail(token: string): Promise<void> {
    const [user] = await db
      .update(users)
      .set({
        isEmailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationExpires: null,
      })
      .where(
        and(
          eq(users.emailVerificationTokenHash, hashToken(token)),
          gt(users.emailVerificationExpires, new Date()),
        ),
      )
      .returning({ id: users.id });
    if (!user) throw AppError.badRequest('Lien de vérification invalide ou expiré.');
  },

  async resendVerification(userId: string): Promise<void> {
    const user = await findUserById(userId);
    if (!user) throw AppError.notFound('Utilisateur introuvable.');
    if (user.isEmailVerified) throw AppError.badRequest('Votre email est déjà vérifié.');
    await issueEmailVerification(user);
  },
};
