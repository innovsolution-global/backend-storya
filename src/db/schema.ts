/**
 * Schéma PostgreSQL (Drizzle). Les colonnes sont en camelCase côté TypeScript
 * et en snake_case en base (option `casing` de drizzle et drizzle-kit).
 *
 * Après une modification : `npm run db:generate` crée la migration SQL dans drizzle/.
 * Les objets jamais filtrés en SQL (réglages, scènes, médias…) sont stockés en jsonb.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type {
  AspectRatio,
  PaymentStatus,
  PremiumOfferId,
  Role,
  SubscriptionPlan,
  VideoMusic,
  VideoStatus,
  VideoType,
  VideoVoice,
} from '../constants';
import { VIDEO_STEPS } from '../constants';
import type { Lang } from '../i18n';
import type { BannerTarget, PromotionKind } from '../validators/promotion.validator';
import type { IMedia } from '../models/shared';
import type { IUserPreferences, IUserSettings } from '../models/User';
import type { IScene, VideoProgress, VideoProviders } from '../models/Video';

const timestampTz = () => timestamp({ withTimezone: true });

const timestamps = {
  createdAt: timestampTz().notNull().defaultNow(),
  updatedAt: timestampTz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const DEFAULT_USER_SETTINGS: IUserSettings = {
  language: 'system',
  defaultFormat: null,
  exportQuality: '1080p',
  downloadNetwork: 'wifi',
  notifications: { videoReady: true, tips: true, offers: false },
};

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    firstName: text().notNull(),
    /** Toujours en minuscules (normalisé par la validation). */
    email: text().notNull().unique('users_email_unique'),
    /** Unique ; absent des comptes plus anciens (plusieurs NULL autorisés). */
    phone: text().unique('users_phone_unique'),
    /** Hash bcrypt. */
    password: text().notNull(),
    role: text().$type<Role>().notNull().default('user'),
    preferences: jsonb()
      .$type<IUserPreferences>()
      .notNull()
      .default({ genres: [], videoTypes: [] }),
    settings: jsonb().$type<IUserSettings>().notNull().default(DEFAULT_USER_SETTINGS),
    avatar: jsonb().$type<IMedia>(),
    isEmailVerified: boolean().notNull().default(false),
    emailVerificationTokenHash: text(),
    emailVerificationExpires: timestampTz(),
    /** Empreinte du code à 6 chiffres envoyé par email. */
    passwordResetTokenHash: text(),
    passwordResetExpires: timestampTz(),
    /** Essais de code erronés ; le code est annulé au-delà de la limite. */
    passwordResetAttempts: integer().notNull().default(0),
    passwordChangedAt: timestampTz(),
    failedLoginAttempts: integer().notNull().default(0),
    lockUntil: timestampTz(),
    subscriptionPlan: text().$type<SubscriptionPlan>().notNull().default('free'),
    subscriptionExpiresAt: timestampTz(),
    lastLoginAt: timestampTz(),
    ...timestamps,
  },
  (table) => [
    index('users_role_idx').on(table.role),
    index('users_created_at_idx').on(table.createdAt),
    index('users_email_verification_token_idx').on(table.emailVerificationTokenHash),
  ],
);

/**
 * Vidéo générée par l'IA : la demande de l'utilisateur, la progression de la
 * génération (exécutée en arrière-plan) et le résultat final.
 */
export const videos = pgTable(
  'videos',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text().$type<VideoType>().notNull(),
    title: text().notNull(),
    prompt: text().notNull(),
    /** Style visuel (storytelling, cartoon) ou ton (publicité). */
    style: text().notNull(),
    durationSeconds: integer().notNull(),
    aspectRatio: text().$type<AspectRatio>().notNull().default('9:16'),
    voice: text().$type<VideoVoice>().notNull().default('feminine'),
    music: text().$type<VideoMusic>().notNull().default('douce'),
    /** Publicité. */
    brand: text(),
    keyMessage: text(),
    callToAction: text(),
    /** Publicité et cartoon. */
    audience: text(),
    /** Cartoon : personnages récurrents. */
    characters: text(),
    /** Images de référence envoyées par l'utilisateur. */
    images: jsonb().$type<IMedia[]>().notNull().default([]),
    /** Langue de l'app à la création : script de démo, titre par défaut, email « vidéo prête ». */
    language: text().$type<Lang>().notNull().default('fr'),

    status: text().$type<VideoStatus>().notNull().default('queued'),
    progress: jsonb()
      .$type<VideoProgress>()
      .notNull()
      .default({ step: 0, total: VIDEO_STEPS.length }),
    scenes: jsonb().$type<IScene[]>().notNull().default([]),
    /** Voix off complète. */
    narration: text(),
    description: text(),

    output: jsonb().$type<IMedia>(),
    thumbnail: jsonb().$type<IMedia>(),
    outputDurationSeconds: real(),

    error: text(),
    warnings: jsonb().$type<string[]>().notNull().default([]),
    providers: jsonb().$type<VideoProviders>().notNull().default({}),
    demo: boolean().notNull().default(false),
    startedAt: timestampTz(),
    finishedAt: timestampTz(),
    /** Publiée dans Explorer par son auteur (null : privée). */
    publishedAt: timestampTz(),
    ...timestamps,
  },
  (table) => [
    // Explorer : vidéos publiées, les plus récentes d'abord.
    index('videos_published_at_idx').on(table.publishedAt.desc()),
    // « Mes vidéos », filtrées par type ou statut, plus récentes d'abord.
    index('videos_user_created_at_idx').on(table.userId, table.createdAt.desc()),
    index('videos_user_type_created_at_idx').on(table.userId, table.type, table.createdAt.desc()),
    index('videos_status_idx').on(table.status),
    index('videos_updated_at_idx').on(table.updatedAt.desc()),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** NULL une fois le compte supprimé : les paiements sont conservés (obligations comptables). */
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    provider: text().notNull(),
    transactionId: text().notNull().unique('payments_transaction_id_unique'),
    offer: text().$type<PremiumOfferId>().notNull(),
    amount: integer().notNull(),
    currency: text().notNull(),
    status: text().$type<PaymentStatus>().notNull().default('pending'),
    paymentUrl: text(),
    paymentMethod: text(),
    operatorMessage: text(),
    paidAt: timestampTz(),
    /** Abonnement déjà crédité pour ce paiement (idempotence des webhooks). */
    fulfilledAt: timestampTz(),
    /** Offre limitée appliquée (prix réduit) et prix d'origine. */
    promotionId: uuid().references(() => promotions.id, { onDelete: 'set null' }),
    originalAmount: integer(),
    ...timestamps,
  },
  (table) => [
    index('payments_user_created_at_idx').on(table.userId, table.createdAt.desc()),
    index('payments_status_idx').on(table.status),
  ],
);

/**
 * Refresh token persisté (empreinte uniquement).
 * `family` regroupe les jetons issus d'une même connexion : si un jeton déjà
 * utilisé est présenté à nouveau (vol probable), toute la famille est révoquée.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull().unique('refresh_tokens_token_hash_unique'),
    family: text().notNull(),
    expiresAt: timestampTz().notNull(),
    revokedAt: timestampTz(),
    replacedByHash: text(),
    userAgent: text(),
    ip: text(),
    ...timestamps,
  },
  (table) => [
    index('refresh_tokens_user_idx').on(table.userId),
    index('refresh_tokens_family_idx').on(table.family),
    // Purge périodique des jetons expirés (voir tokenService.purgeExpired).
    index('refresh_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

/** Téléphones qui reçoivent les notifications (jeton Firebase Cloud Messaging). */
export const devices = pgTable(
  'devices',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull().unique('devices_token_unique'),
    platform: text().$type<'android' | 'ios'>().notNull(),
    lastSeenAt: timestampTz().notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [index('devices_user_idx').on(table.userId)],
);

/** Campagnes envoyées depuis le back-office (historique). */
export const pushCampaigns = pgTable(
  'push_campaigns',
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    body: text().notNull(),
    audience: text().$type<'all' | 'free' | 'premium'>().notNull(),
    /** Utilisateurs visés (réglage « Offres » activé et au moins un téléphone). */
    recipients: integer().notNull().default(0),
    sent: integer().notNull().default(0),
    failed: integer().notNull().default(0),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [index('push_campaigns_created_at_idx').on(table.createdAt.desc())],
);

/**
 * Promotions gérées depuis le back-office :
 * - `banner` : bandeau sur l'accueil de l'app (image, texte, bouton) ;
 * - `discount` : offre limitée, réduction en % sur les offres Premium ;
 * - `trial` : essai Premium gratuit pour les nouveaux inscrits.
 */
export const promotions = pgTable(
  'promotions',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().$type<PromotionKind>().notNull(),
    title: text().notNull(),
    description: text(),
    startsAt: timestampTz().notNull().defaultNow(),
    /** Sans date de fin : jusqu'à désactivation. */
    endsAt: timestampTz(),
    isActive: boolean().notNull().default(true),
    image: jsonb().$type<IMedia>(),
    ctaLabel: text(),
    ctaTarget: text().$type<BannerTarget>(),
    discountPercent: integer(),
    /** Offres concernées ; vide : toutes. */
    offerIds: jsonb().$type<PremiumOfferId[]>().notNull().default([]),
    trialDays: integer(),
    /** Paiements réduits acceptés ou essais accordés. */
    uses: integer().notNull().default(0),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [index('promotions_kind_starts_at_idx').on(table.kind, table.startsAt.desc())],
);

/** Boîte de réception : chaque notification envoyée à l'utilisateur, lue ou non. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    body: text().notNull(),
    /** Données d'ouverture (type, videoId…), identiques à celles de la notification push. */
    data: jsonb().$type<Record<string, string>>().notNull().default({}),
    readAt: timestampTz(),
    ...timestamps,
  },
  (table) => [index('notifications_user_created_at_idx').on(table.userId, table.createdAt.desc())],
);
