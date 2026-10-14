import { z } from 'zod';

import {
  ASPECT_RATIO_IDS,
  VIDEO_DURATION,
  VIDEO_MUSIC_IDS,
  VIDEO_STATUSES,
  VIDEO_STYLES,
  VIDEO_TYPE_IDS,
  VIDEO_VOICE_IDS,
} from '../constants';
import { paginationSchema } from './common.validator';

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} : ${max} caractères maximum.`)
    .optional()
    .transform((value) => (value ? value : undefined));

/**
 * Demande de génération. Envoyée en JSON ou en multipart/form-data (avec le
 * champ fichier `images`) : dans ce cas les nombres arrivent sous forme de texte.
 */
export const createVideoSchema = z
  .object({
    type: z.enum(VIDEO_TYPE_IDS, {
      errorMap: () => ({ message: `Type de vidéo inconnu (${VIDEO_TYPE_IDS.join(', ')}).` }),
    }),
    prompt: z
      .string({ required_error: 'Décrivez votre idée de vidéo.' })
      .trim()
      .min(3, 'Décrivez votre idée en quelques mots (3 caractères minimum).')
      .max(1500, "L'idée ne peut pas dépasser 1500 caractères."),
    title: optionalText(120, 'Titre'),
    style: z.string().trim().max(40).optional(),
    durationSeconds: z.coerce
      .number({ invalid_type_error: 'Durée invalide.' })
      .int('La durée doit être un nombre entier de secondes.')
      .min(VIDEO_DURATION.minSeconds, `Durée minimale : ${VIDEO_DURATION.minSeconds} secondes.`)
      .max(VIDEO_DURATION.maxSeconds, 'Une vidéo ne peut pas dépasser 2 min 30 (150 secondes).')
      .optional(),
    aspectRatio: z
      .enum(ASPECT_RATIO_IDS, {
        errorMap: () => ({ message: `Format inconnu (${ASPECT_RATIO_IDS.join(', ')}).` }),
      })
      .optional(),
    voice: z
      .enum(VIDEO_VOICE_IDS, {
        errorMap: () => ({ message: `Voix inconnue (${VIDEO_VOICE_IDS.join(', ')}).` }),
      })
      .default('feminine'),
    music: z
      .enum(VIDEO_MUSIC_IDS, {
        errorMap: () => ({ message: `Musique inconnue (${VIDEO_MUSIC_IDS.join(', ')}).` }),
      })
      .default('douce'),
    brand: optionalText(80, 'Marque'),
    keyMessage: optionalText(160, 'Message clé'),
    callToAction: optionalText(60, "Appel à l'action"),
    audience: optionalText(40, 'Public'),
    characters: optionalText(300, 'Personnages'),
  })
  .strict()
  .superRefine((value, ctx) => {
    const styles = VIDEO_STYLES[value.type];
    if (value.style && !styles.includes(value.style)) {
      ctx.addIssue({
        code: 'custom',
        path: ['style'],
        message: `Style inconnu pour ce type (${styles.join(', ')}).`,
      });
    }
    if (value.type === 'publicite' && !value.brand) {
      ctx.addIssue({
        code: 'custom',
        path: ['brand'],
        message: 'Indiquez la marque ou le produit à mettre en avant.',
      });
    }
  })
  .transform((value) => ({
    ...value,
    style: value.style ?? VIDEO_STYLES[value.type][0] ?? 'Cinématique',
    durationSeconds: value.durationSeconds ?? VIDEO_DURATION.defaults[value.type],
    aspectRatio: value.aspectRatio ?? (value.type === 'cartoon' ? '16:9' : '9:16'),
  }));

export const listVideosQuerySchema = paginationSchema
  .extend({
    type: z.enum(VIDEO_TYPE_IDS).optional(),
    status: z.enum(VIDEO_STATUSES).optional(),
  })
  .strict();

/** Fil Explorer : vidéos publiées, filtrables par type. */
export const exploreQuerySchema = paginationSchema
  .extend({ type: z.enum(VIDEO_TYPE_IDS).optional() })
  .strict();

export type ExploreQuery = z.infer<typeof exploreQuerySchema>;

export const updateVideoSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Le titre ne peut pas être vide.')
      .max(120, 'Titre : 120 caractères maximum.'),
  })
  .strict();

export const adminListVideosQuerySchema = listVideosQuerySchema.extend({
  /** Recherche dans le titre, la demande ou la marque. */
  q: z.string().trim().max(100).optional(),
  user: z.string().uuid('Identifiant utilisateur invalide.').optional(),
});

export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type ListVideosQuery = z.infer<typeof listVideosQuerySchema>;
export type AdminListVideosQuery = z.infer<typeof adminListVideosQuerySchema>;
