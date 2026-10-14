import bcrypt from 'bcrypt';

import { env } from '../config/env';
import type {
  AspectRatio,
  DownloadNetwork,
  ExportQuality,
  StoryCategory,
  VideoType,
} from '../constants';
import type { users } from '../db/schema';
import type { LanguageSetting } from '../i18n';

export type IUser = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export interface IUserPreferences {
  /** Thèmes favoris (storytelling, dessins animés). */
  genres: StoryCategory[];
  /** Types de vidéos que l'utilisateur veut créer. */
  videoTypes: VideoType[];
}

/** Réglages de l'app, partagés entre les appareils de l'utilisateur. */
export interface IUserSettings {
  /** Langue de l'app et des emails ; `system` suit la langue du téléphone. */
  language: LanguageSetting;
  /** Format imposé aux nouvelles vidéos ; absent : format conseillé pour le type. */
  defaultFormat?: AspectRatio | null;
  exportQuality: ExportQuality;
  downloadNetwork: DownloadNetwork;
  notifications: {
    /** Email quand une génération est terminée. */
    videoReady: boolean;
    tips: boolean;
    offers: boolean;
  };
}

/** Le mot de passe n'est jamais stocké en clair : à appeler avant chaque écriture. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
}

export function comparePassword(
  user: Pick<IUser, 'password'>,
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, user.password);
}

export function isLocked(user: Pick<IUser, 'lockUntil'>): boolean {
  return Boolean(user.lockUntil && user.lockUntil.getTime() > Date.now());
}

export function isPremium(
  user: Pick<IUser, 'subscriptionPlan' | 'subscriptionExpiresAt'> & { role?: IUser['role'] },
): boolean {
  // Les administrateurs ont Premium d'office dans l'app mobile, sans paiement.
  if (user.role === 'admin') return true;
  const expiresAt = user.subscriptionExpiresAt;
  return user.subscriptionPlan === 'premium' && (!expiresAt || expiresAt.getTime() > Date.now());
}
