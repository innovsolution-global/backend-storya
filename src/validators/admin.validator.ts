import { z } from 'zod';

import { PAYMENT_STATUSES, PREMIUM_OFFERS } from '../constants';
import type { PremiumOfferId } from '../constants';
import { firstName } from './auth.validator';
import { email, paginationSchema, password } from './common.validator';

const OFFER_IDS = Object.keys(PREMIUM_OFFERS) as [PremiumOfferId, ...PremiumOfferId[]];

/** Période des courbes du tableau de bord (en jours). */
export const timeseriesQuerySchema = z
  .object({ days: z.coerce.number().int().min(7).max(365).default(30) })
  .strict();

export const activityQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(30) })
  .strict();

export const adminListPaymentsQuerySchema = paginationSchema
  .extend({
    status: z.enum(PAYMENT_STATUSES).optional(),
    offer: z.enum(OFFER_IDS).optional(),
    q: z.string().trim().max(100).optional(),
  })
  .strict();

/** Premium offert pour un nombre de jours, ou retour au compte gratuit. */
export const updateSubscriptionSchema = z.discriminatedUnion('plan', [
  z.object({ plan: z.literal('premium'), days: z.coerce.number().int().min(1).max(3650) }).strict(),
  z.object({ plan: z.literal('free') }).strict(),
]);

/** Campagne de notifications : message court, public visé. */
export const sendCampaignSchema = z
  .object({
    title: z.string().trim().min(1, 'Indiquez un titre.').max(65, 'Titre : 65 caractères maximum.'),
    body: z
      .string()
      .trim()
      .min(1, 'Indiquez un message.')
      .max(240, 'Message : 240 caractères maximum.'),
    audience: z.enum(['all', 'free', 'premium']),
  })
  .strict();

export type SendCampaignInput = z.infer<typeof sendCampaignSchema>;

/** Nouveau compte administrateur. */
export const createAdminSchema = z.object({ firstName, email, password }).strict();

export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type TimeseriesQuery = z.infer<typeof timeseriesQuerySchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type AdminListPaymentsQuery = z.infer<typeof adminListPaymentsQuerySchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
