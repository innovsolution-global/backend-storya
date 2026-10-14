import { z } from 'zod';

import type { PremiumOfferId } from '../constants';
import { PREMIUM_OFFERS } from '../constants';

export const PROMOTION_KINDS = ['banner', 'discount', 'trial'] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

/** Où mène le bouton d'une bannière dans l'app. */
export const BANNER_TARGETS = ['create', 'premium', 'explore', 'videos'] as const;
export type BannerTarget = (typeof BANNER_TARGETS)[number];

const OFFER_IDS = Object.keys(PREMIUM_OFFERS) as [PremiumOfferId, ...PremiumOfferId[]];

const title = z
  .string()
  .trim()
  .min(1, 'Indiquez un titre.')
  .max(60, 'Titre : 60 caractères maximum.');
const description = z.string().trim().max(160, 'Texte : 160 caractères maximum.');
const date = z.coerce.date({ invalid_type_error: 'Date invalide.' });

const fields = {
  title,
  description: description.optional(),
  startsAt: date.optional(),
  endsAt: date.nullable().optional(),
  isActive: z.boolean().optional(),
  ctaLabel: z.string().trim().min(1).max(24, 'Bouton : 24 caractères maximum.').optional(),
  ctaTarget: z.enum(BANNER_TARGETS).optional(),
  discountPercent: z.coerce
    .number()
    .int()
    .min(5, 'Réduction : 5 % minimum.')
    .max(90, 'Réduction : 90 % maximum.')
    .optional(),
  offerIds: z.array(z.enum(OFFER_IDS)).max(OFFER_IDS.length).optional(),
  trialDays: z.coerce
    .number()
    .int()
    .min(1, 'Essai : 1 jour minimum.')
    .max(90, 'Essai : 90 jours maximum.')
    .optional(),
};

const periodIsValid = (value: { startsAt?: Date; endsAt?: Date | null }) =>
  !value.startsAt || !value.endsAt || value.endsAt > value.startsAt;
const PERIOD_ERROR = { message: 'La fin doit être après le début.', path: ['endsAt'] };

/** Nouvelle promotion : les champs requis dépendent du type. */
export const createPromotionSchema = z
  .object({ kind: z.enum(PROMOTION_KINDS), ...fields })
  .strict()
  .refine(periodIsValid, PERIOD_ERROR)
  .refine((value) => value.kind !== 'discount' || value.discountPercent !== undefined, {
    message: 'Indiquez le pourcentage de réduction.',
    path: ['discountPercent'],
  })
  .refine((value) => value.kind !== 'trial' || value.trialDays !== undefined, {
    message: 'Indiquez la durée de l’essai.',
    path: ['trialDays'],
  });

/** Modification : le type ne change pas. */
export const updatePromotionSchema = z
  .object({ ...fields, title: title.optional() })
  .partial()
  .strict()
  .refine(periodIsValid, PERIOD_ERROR)
  .refine((value) => Object.keys(value).length > 0, { message: 'Aucune modification fournie.' });

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
