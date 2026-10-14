import type { SQL } from 'drizzle-orm';
import { and, count, desc, eq, ne } from 'drizzle-orm';

import { db } from '../config/database';
import type { Role } from '../constants';
import { searchAny, uniqueViolation } from '../db/helpers';
import { refreshTokens, users } from '../db/schema';
import { findUserById, updateUser } from '../db/users';
import type { IUser } from '../models';
import { comparePassword, hashPassword } from '../models';
import { AppError } from '../utils/AppError';
import { paginationMeta, skipFor } from '../utils/pagination';
import type { UserDto, UserSettingsDto } from '../utils/serializers';
import { toUserDto, toUserSettingsDto } from '../utils/serializers';
import type {
  ChangePasswordInput,
  ListUsersQuery,
  UpdateMeInput,
  UpdatePreferencesInput,
  UpdateSettingsInput,
} from '../validators/user.validator';
import { PHONE_TAKEN } from './auth.service';
import { mediaService } from './media.service';
import { videoService } from './video.service';
import type { ClientMeta, TokenPair } from './token.service';
import { tokenService } from './token.service';

async function findUser(userId: string): Promise<IUser> {
  const user = await findUserById(userId);
  if (!user) throw AppError.notFound('Utilisateur introuvable.');
  return user;
}

/** Filtres communs aux listes d'utilisateurs (profil admin et back-office). */
export function userFilter(query: Pick<ListUsersQuery, 'role' | 'plan' | 'q'>): SQL | undefined {
  return and(
    query.role ? eq(users.role, query.role) : undefined,
    query.plan ? eq(users.subscriptionPlan, query.plan) : undefined,
    query.q ? searchAny(query.q, [users.email, users.firstName, users.phone]) : undefined,
  );
}

export const userService = {
  async updateProfile(userId: string, input: UpdateMeInput): Promise<UserDto> {
    const user = await findUser(userId);
    const changes: Partial<IUser> = {};
    if (input.firstName !== undefined) changes.firstName = input.firstName;
    if (input.phone !== undefined && input.phone !== user.phone) {
      const [owner] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, input.phone), ne(users.id, user.id)))
        .limit(1);
      if (owner) throw AppError.conflict(PHONE_TAKEN);
      changes.phone = input.phone;
    }
    try {
      await updateUser(user, changes);
    } catch (error) {
      // Deux comptes qui prennent le même numéro au même instant : la contrainte d'unicité tranche.
      if (uniqueViolation(error) !== undefined) throw AppError.conflict(PHONE_TAKEN);
      throw error;
    }
    return toUserDto(user);
  },

  async updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<UserDto> {
    const user = await findUser(userId);
    await updateUser(user, {
      preferences: {
        genres: input.genres ?? user.preferences.genres,
        videoTypes: input.videoTypes ?? user.preferences.videoTypes,
      },
    });
    return toUserDto(user);
  },

  async getSettings(userId: string): Promise<UserSettingsDto> {
    return toUserSettingsDto(await findUser(userId));
  },

  /** Seuls les réglages envoyés changent ; les notifications se mettent à jour une à une. */
  async updateSettings(userId: string, input: UpdateSettingsInput): Promise<UserSettingsDto> {
    const user = await findUser(userId);
    const { notifications, ...rest } = input;
    const current = toUserSettingsDto(user);
    await updateUser(user, {
      settings: {
        ...current,
        ...rest,
        notifications: { ...current.notifications, ...notifications },
      },
    });
    return toUserSettingsDto(user);
  },

  /** Ferme toutes les sessions puis en ouvre une nouvelle pour l'appareil courant. */
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    meta: ClientMeta,
  ): Promise<TokenPair & { user: UserDto }> {
    const user = await findUser(userId);
    if (!(await comparePassword(user, input.currentPassword))) {
      throw AppError.badRequest('Mot de passe actuel incorrect.', [
        { field: 'currentPassword', message: 'Mot de passe actuel incorrect.' },
      ]);
    }
    await updateUser(user, {
      password: await hashPassword(input.newPassword),
      passwordChangedAt: new Date(),
    });
    await tokenService.revokeAllForUser(userId);
    const tokens = await tokenService.createSession(userId, user.role, meta);
    return { ...tokens, user: toUserDto(user) };
  },

  async updateAvatar(userId: string, file: Express.Multer.File | undefined): Promise<UserDto> {
    if (!file) throw AppError.badRequest('Aucune image reçue (champ « avatar »).');
    const user = await findUser(userId);
    const media = await mediaService.storeUpload(file, 'image', 'avatars');
    const previous = user.avatar;
    await updateUser(user, { avatar: media });
    await mediaService.remove(previous);
    return toUserDto(user);
  },

  async removeAvatar(userId: string): Promise<UserDto> {
    const user = await findUser(userId);
    const previous = user.avatar;
    await updateUser(user, { avatar: null });
    await mediaService.remove(previous);
    return toUserDto(user);
  },

  /** Suppression définitive (RGPD) : compte, sessions, vidéos et fichiers associés. */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await findUser(userId);
    if (!(await comparePassword(user, password)))
      throw AppError.badRequest('Mot de passe incorrect.');

    await videoService.removeAllForUser(userId);
    await this.purge(user);
  },

  /** Sessions, photo et compte ; les vidéos doivent déjà être supprimées. */
  async purge(user: IUser): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
    await mediaService.remove(user.avatar);
    await db.delete(users).where(eq(users.id, user.id));
    // Les paiements sont conservés (obligations comptables), détachés du compte (user_id NULL).
  },

  async list(query: ListUsersQuery) {
    const filter = userFilter(query);
    const pagination = { page: query.page, limit: query.limit };
    const [items, [total]] = await Promise.all([
      db
        .select()
        .from(users)
        .where(filter)
        .orderBy(desc(users.createdAt))
        .offset(skipFor(pagination))
        .limit(query.limit),
      db.select({ value: count() }).from(users).where(filter),
    ]);
    return { items: items.map(toUserDto), meta: paginationMeta(pagination, total?.value ?? 0) };
  },

  async updateRole(actorId: string, targetId: string, role: Role): Promise<UserDto> {
    if (actorId === targetId)
      throw AppError.badRequest('Vous ne pouvez pas modifier votre propre rôle.');
    const user = await findUser(targetId);
    await updateUser(user, { role });
    return toUserDto(user);
  },
};
