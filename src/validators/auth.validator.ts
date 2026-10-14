import { z } from 'zod';

import { STORY_CATEGORIES, VIDEO_TYPE_IDS } from '../constants';
import { email, password, phone } from './common.validator';

export const firstName = z
  .string({ required_error: 'Indiquez votre prénom.' })
  .trim()
  .min(1, 'Indiquez votre prénom.')
  .max(60, 'Le prénom ne peut pas dépasser 60 caractères.');

export const preferencesSchema = z.object({
  /** Thèmes favoris (storytelling, dessins animés). */
  genres: z
    .array(z.enum(STORY_CATEGORIES, { errorMap: () => ({ message: 'Thème inconnu.' }) }))
    .max(STORY_CATEGORIES.length)
    .transform((genres) => [...new Set(genres)]),
  /** Types de vidéos que l'utilisateur veut créer. */
  videoTypes: z
    .array(
      z.enum(VIDEO_TYPE_IDS, {
        errorMap: () => ({ message: `Type de vidéo inconnu (${VIDEO_TYPE_IDS.join(', ')}).` }),
      }),
    )
    .max(VIDEO_TYPE_IDS.length)
    .transform((types) => [...new Set(types)]),
});

export const registerSchema = z
  .object({
    firstName,
    email,
    phone,
    password,
    genres: preferencesSchema.shape.genres.default([]),
    videoTypes: preferencesSchema.shape.videoTypes.default([]),
    /** Ancien champ (Vidéo / Audio / Texte) encore envoyé par l'app : accepté et ignoré. */
    format: z.string().max(20).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z
      .string({ required_error: 'Saisissez votre mot de passe.' })
      .min(1, 'Saisissez votre mot de passe.')
      .max(128),
  })
  .strict();

/** Le refresh token vient du cookie httpOnly (web) ou du corps (mobile). */
export const refreshSchema = z
  .object({ refreshToken: z.string().min(1).max(256).optional() })
  .strict();

export const forgotPasswordSchema = z.object({ email }).strict();

export const resetPasswordSchema = z
  .object({
    email,
    code: z
      .string({ required_error: 'Saisissez le code reçu par email.' })
      .trim()
      .regex(/^\d{6}$/, 'Le code contient 6 chiffres.'),
    password,
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z.string({ required_error: 'Jeton requis.' }).regex(/^[a-f0-9]{64}$/, 'Jeton invalide.'),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
