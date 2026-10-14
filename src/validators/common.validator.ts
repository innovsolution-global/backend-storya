import { z } from 'zod';

import { PAGINATION } from '../constants';

/** Identifiant PostgreSQL (UUID). */
export const uuid = z
  .string({ required_error: 'Identifiant requis.' })
  .uuid('Identifiant invalide.');

export const idParamSchema = z.object({ id: uuid });
export const storyIdParamSchema = z.object({ storyId: uuid });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1, 'La page doit être ≥ 1.').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'La limite doit être ≥ 1.')
    .max(PAGINATION.maxLimit, `La limite ne peut pas dépasser ${PAGINATION.maxLimit}.`)
    .default(PAGINATION.defaultLimit),
});

export const email = z
  .string({ required_error: "L'email est requis." })
  .trim()
  .toLowerCase()
  .max(254, "L'email est trop long.")
  .email('Saisissez une adresse email valide.');

/**
 * Numéro de téléphone : espaces, points, tirets et parenthèses ignorés,
 * « 00 » initial converti en « + ». Stocké sous la forme +224622123456 ou 622123456.
 */
export const phone = z
  .string({ required_error: 'Le numéro de téléphone est requis.' })
  .transform((value) => value.replace(/[\s.\-()]/g, '').replace(/^00/, '+'))
  .pipe(
    z.string().regex(/^\+?\d{8,15}$/, 'Saisissez un numéro de téléphone valide (8 à 15 chiffres).'),
  );

export const password = z
  .string({ required_error: 'Le mot de passe est requis.' })
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères.')
  .regex(/[A-Za-zÀ-ÿ]/, 'Le mot de passe doit contenir au moins une lettre.')
  .regex(/\d/, 'Le mot de passe doit contenir au moins un chiffre.');
