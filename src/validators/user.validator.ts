import { z } from 'zod';

import { ASPECT_RATIO_IDS, DOWNLOAD_NETWORKS, EXPORT_QUALITIES, ROLES } from '../constants';
import { LANGUAGE_SETTINGS } from '../i18n';
import { firstName, preferencesSchema } from './auth.validator';
import { password, paginationSchema, phone } from './common.validator';

export const updateMeSchema = z
  .object({ firstName, phone })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Aucune modification fournie.' });

export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const updatePreferencesSchema = preferencesSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Aucune préférence fournie.' });

/** Réglages de l'app : chaque champ est facultatif, seuls ceux envoyés changent. */
export const updateSettingsSchema = z
  .object({
    language: z.enum(LANGUAGE_SETTINGS, {
      errorMap: () => ({ message: `Langue inconnue (${LANGUAGE_SETTINGS.join(', ')}).` }),
    }),
    /** `null` : format conseillé pour chaque type de vidéo. */
    defaultFormat: z
      .enum(ASPECT_RATIO_IDS, {
        errorMap: () => ({ message: `Format inconnu (${ASPECT_RATIO_IDS.join(', ')}).` }),
      })
      .nullable(),
    exportQuality: z.enum(EXPORT_QUALITIES, {
      errorMap: () => ({ message: `Qualité inconnue (${EXPORT_QUALITIES.join(', ')}).` }),
    }),
    downloadNetwork: z.enum(DOWNLOAD_NETWORKS, {
      errorMap: () => ({ message: `Réseau inconnu (${DOWNLOAD_NETWORKS.join(', ')}).` }),
    }),
    notifications: z
      .object({ videoReady: z.boolean(), tips: z.boolean(), offers: z.boolean() })
      .partial()
      .strict(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Aucun réglage fourni.' });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ required_error: 'Mot de passe actuel requis.' }).min(1).max(128),
    newPassword: password,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "Le nouveau mot de passe doit être différent de l'actuel.",
    path: ['newPassword'],
  });

export const deleteAccountSchema = z
  .object({
    password: z.string({ required_error: 'Confirmez avec votre mot de passe.' }).min(1).max(128),
  })
  .strict();

/** Téléphone à notifier (jeton Firebase Cloud Messaging). */
export const registerDeviceSchema = z
  .object({
    token: z.string().trim().min(20, 'Jeton de notification invalide.').max(4096),
    platform: z.enum(['android', 'ios']),
  })
  .strict();

export const unregisterDeviceSchema = z
  .object({ token: z.string().trim().min(1).max(4096) })
  .strict();

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const listUsersQuerySchema = paginationSchema
  .extend({
    q: z.string().trim().max(100).optional(),
    role: z.enum(ROLES).optional(),
    plan: z.enum(['free', 'premium']).optional(),
  })
  .strict();

export const updateRoleSchema = z.object({ role: z.enum(ROLES) }).strict();

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
