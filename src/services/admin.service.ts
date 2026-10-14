import type { SQL } from 'drizzle-orm';
import { and, count, desc, eq, gt, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import { db } from '../config/database';
import { env, isAiDemoMode } from '../config/env';
import type { PaymentStatus, PremiumOfferId } from '../constants';
import {
  PAYMENT_CURRENCY,
  PAYMENT_STATUSES,
  PREMIUM_OFFERS,
  VIDEO_STATUSES,
  VIDEO_TYPE_IDS,
  VIDEO_TYPES,
} from '../constants';
import { searchAny, uniqueViolation } from '../db/helpers';
import { isPushConfigured } from '../integrations/push';
import { payments, users, videos } from '../db/schema';
import { findUserByEmail, findUserById, updateUser } from '../db/users';
import type { IPayment, IUser } from '../models';
import { hashPassword, isPremium } from '../models';
import { AppError } from '../utils/AppError';
import { paginationMeta, skipFor } from '../utils/pagination';
import type { UserDto } from '../utils/serializers';
import { toUserDto, toVideoDto } from '../utils/serializers';
import type {
  ActivityQuery,
  AdminListPaymentsQuery,
  CreateAdminInput,
  TimeseriesQuery,
  UpdateSubscriptionInput,
} from '../validators/admin.validator';
import type { ListUsersQuery } from '../validators/user.validator';
import { notificationService } from './notification.service';
import { ADMIN_ALREADY_PREMIUM } from './payment.service';
import { userFilter, userService } from './user.service';
import { videoListColumns, videoService } from './video.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const ADMIN_EMAIL_TAKEN = 'Un compte existe déjà avec cet email.';

/** Utilisateurs de l'app mobile (les administrateurs sont comptés à part). */
const mobileUser = eq(users.role, 'user');

/** « 30 000 GNF » dans le fil d'activité. */
const money = (amount: number, currency: string) =>
  `${new Intl.NumberFormat('fr-FR').format(amount)} ${currency}`;

/** count(*) et sum() renvoient des bigint/numeric (chaînes) : convertis en nombre. */
const total = () => sql<number>`count(*)`.mapWith(Number);
const sumOf = (column: PgColumn) => sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

/** Utilisateur vu par le back-office : le profil, plus son activité. */
export interface AdminUserDto extends UserDto {
  lastLoginAt: Date | null;
  videoCount: number;
}

type UserRef = { id: string; firstName: string; email: string } | null;

export interface AdminPaymentDto {
  id: string;
  transactionId: string;
  offer: PremiumOfferId;
  offerLabel: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  paymentMethod: string | null;
  operatorMessage: string | null;
  paidAt: Date | null;
  createdAt: Date;
  user: UserRef;
}

/** Auteur joint par LEFT JOIN : null si le compte n'existe plus. */
const authorColumns = { id: users.id, firstName: users.firstName, email: users.email };

function toAdminUserDto(user: IUser, videoCount = 0): AdminUserDto {
  return { ...toUserDto(user), lastLoginAt: user.lastLoginAt ?? null, videoCount };
}

function toAdminPaymentDto({
  payment,
  user,
}: {
  payment: IPayment;
  user: UserRef;
}): AdminPaymentDto {
  return {
    id: payment.id,
    transactionId: payment.transactionId,
    offer: payment.offer,
    offerLabel: PREMIUM_OFFERS[payment.offer]?.label ?? payment.offer,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    paymentMethod: payment.paymentMethod ?? null,
    operatorMessage: payment.operatorMessage ?? null,
    paidAt: payment.paidAt ?? null,
    createdAt: payment.createdAt,
    user,
  };
}

async function countWhere(table: PgTable, filter?: SQL): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table).where(filter);
  return row?.value ?? 0;
}

/** Nombre de lignes par valeur d'une colonne. */
function groupCount<K extends string>(table: PgTable, column: PgColumn, filter?: SQL) {
  return db
    .select({ key: sql<K>`${column}`, count: total() })
    .from(table)
    .where(filter)
    .groupBy(column);
}

/** Compte par valeur d'un champ, avec toutes les valeurs connues à 0 par défaut. */
function tally<K extends string>(keys: readonly K[], rows: { key: K; count: number }[]) {
  const result = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  for (const row of rows) if (row.key in result) result[row.key] = row.count;
  return result;
}

/** Nombre de vidéos par utilisateur, pour une page de la liste. */
async function videoCounts(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: videos.userId, count: total() })
    .from(videos)
    .where(inArray(videos.userId, userIds))
    .groupBy(videos.userId);
  return new Map(rows.map((row) => [row.userId, row.count]));
}

/** Jour (UTC) au format AAAA-MM-JJ. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Regroupe une table par jour (UTC) de `column` à partir de `since`. */
async function perDay(
  table: PgTable,
  column: PgColumn,
  since: Date,
  filter?: SQL,
  value: SQL.Aliased<number> | SQL<number> = total(),
): Promise<Map<string, number>> {
  const day = sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, value })
    .from(table)
    .where(and(gte(column, since), filter))
    .groupBy(day);
  return new Map(rows.map((row) => [row.day, row.value]));
}

export const adminService = {
  /** Chiffres clés du tableau de bord. */
  async overview() {
    const now = new Date();
    const last7 = new Date(now.getTime() - 7 * DAY_MS);
    const last30 = new Date(now.getTime() - 30 * DAY_MS);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const accepted = eq(payments.status, 'accepted');

    const [
      usersTotal,
      usersNew7,
      usersNew30,
      usersVerified,
      usersPremium,
      usersAdmins,
      usersActive7,
      videosByStatus,
      videosByType,
      videosDemo,
      videosLast7,
      [avgDuration],
      paymentsByStatus,
      [revenue],
      [revenueMonth],
      revenueByOffer,
    ] = await Promise.all([
      countWhere(users, mobileUser),
      countWhere(users, and(mobileUser, gte(users.createdAt, last7))),
      countWhere(users, and(mobileUser, gte(users.createdAt, last30))),
      countWhere(users, and(mobileUser, eq(users.isEmailVerified, true))),
      countWhere(
        users,
        and(
          mobileUser,
          eq(users.subscriptionPlan, 'premium'),
          or(isNull(users.subscriptionExpiresAt), gt(users.subscriptionExpiresAt, now)),
        ),
      ),
      countWhere(users, eq(users.role, 'admin')),
      countWhere(users, and(mobileUser, gte(users.lastLoginAt, last7))),
      groupCount<(typeof VIDEO_STATUSES)[number]>(videos, videos.status),
      groupCount<(typeof VIDEO_TYPE_IDS)[number]>(videos, videos.type),
      countWhere(videos, eq(videos.demo, true)),
      countWhere(videos, gte(videos.createdAt, last7)),
      db
        .select({ value: sql<number>`coalesce(avg(${videos.durationSeconds}), 0)`.mapWith(Number) })
        .from(videos)
        .where(eq(videos.status, 'completed')),
      groupCount<PaymentStatus>(payments, payments.status),
      db
        .select({ value: sumOf(payments.amount) })
        .from(payments)
        .where(accepted),
      db
        .select({ value: sumOf(payments.amount) })
        .from(payments)
        .where(and(accepted, gte(payments.paidAt, monthStart))),
      db
        .select({ offer: payments.offer, count: total(), amount: sumOf(payments.amount) })
        .from(payments)
        .where(accepted)
        .groupBy(payments.offer),
    ]);

    const byStatus = tally(VIDEO_STATUSES, videosByStatus);
    const finished = byStatus.completed + byStatus.failed;

    return {
      users: {
        total: usersTotal,
        new7d: usersNew7,
        new30d: usersNew30,
        verified: usersVerified,
        premium: usersPremium,
        admins: usersAdmins,
        active7d: usersActive7,
      },
      videos: {
        total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
        last7d: videosLast7,
        byStatus,
        byType: tally(VIDEO_TYPE_IDS, videosByType),
        demo: videosDemo,
        /** Part des générations terminées qui ont réussi (null tant qu'aucune n'est finie). */
        successRate: finished === 0 ? null : byStatus.completed / finished,
        averageDurationSeconds: Math.round(avgDuration?.value ?? 0),
      },
      payments: {
        currency: PAYMENT_CURRENCY,
        revenueTotal: revenue?.value ?? 0,
        revenueThisMonth: revenueMonth?.value ?? 0,
        byStatus: tally(PAYMENT_STATUSES, paymentsByStatus),
        byOffer: Object.values(PREMIUM_OFFERS).map((offer) => {
          const row = revenueByOffer.find((r) => r.offer === offer.id);
          return {
            offer: offer.id,
            label: offer.label,
            count: row?.count ?? 0,
            amount: row?.amount ?? 0,
          };
        }),
      },
    };
  },

  /** Évolution jour par jour : inscriptions, vidéos, échecs et revenus. */
  async timeseries({ days }: TimeseriesQuery) {
    const since = startOfUtcDay(new Date(Date.now() - (days - 1) * DAY_MS));
    const [signups, created, failed, revenue] = await Promise.all([
      perDay(users, users.createdAt, since, mobileUser),
      perDay(videos, videos.createdAt, since),
      perDay(videos, videos.createdAt, since, eq(videos.status, 'failed')),
      perDay(
        payments,
        payments.paidAt,
        since,
        eq(payments.status, 'accepted'),
        sumOf(payments.amount),
      ),
    ]);

    return Array.from({ length: days }, (_, i) => {
      const date = dayKey(new Date(since.getTime() + i * DAY_MS));
      return {
        date,
        signups: signups.get(date) ?? 0,
        videos: created.get(date) ?? 0,
        failedVideos: failed.get(date) ?? 0,
        revenue: revenue.get(date) ?? 0,
      };
    });
  },

  /** Fil d'activité : inscriptions, vidéos et paiements les plus récents, mêlés. */
  async activity({ limit }: ActivityQuery) {
    const [signups, recentVideos, recentPayments] = await Promise.all([
      db
        .select({
          id: users.id,
          firstName: users.firstName,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(mobileUser)
        .orderBy(desc(users.createdAt))
        .limit(limit),
      db
        .select({
          video: {
            id: videos.id,
            title: videos.title,
            type: videos.type,
            status: videos.status,
            updatedAt: videos.updatedAt,
            finishedAt: videos.finishedAt,
            error: videos.error,
          },
          user: authorColumns,
        })
        .from(videos)
        .leftJoin(users, eq(videos.userId, users.id))
        .orderBy(desc(videos.updatedAt))
        .limit(limit),
      db
        .select({
          payment: {
            id: payments.id,
            offer: payments.offer,
            amount: payments.amount,
            currency: payments.currency,
            status: payments.status,
            updatedAt: payments.updatedAt,
            paidAt: payments.paidAt,
          },
          user: authorColumns,
        })
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .orderBy(desc(payments.updatedAt))
        .limit(limit),
    ]);

    const events = [
      ...signups.map((user) => ({
        id: `user-${user.id}`,
        kind: 'signup' as const,
        at: user.createdAt,
        title: 'Nouvel utilisateur',
        detail: user.email,
        user: { id: user.id, firstName: user.firstName, email: user.email },
      })),
      ...recentVideos.map(({ video, user }) => ({
        id: `video-${video.id}`,
        kind: `video_${video.status}` as const,
        at: video.finishedAt ?? video.updatedAt,
        title: video.title,
        detail: video.status === 'failed' ? (video.error ?? null) : VIDEO_TYPES[video.type],
        user,
      })),
      ...recentPayments.map(({ payment, user }) => ({
        id: `payment-${payment.id}`,
        kind: `payment_${payment.status}` as const,
        at: payment.paidAt ?? payment.updatedAt,
        title: PREMIUM_OFFERS[payment.offer]?.label ?? payment.offer,
        detail: money(payment.amount, payment.currency),
        user,
      })),
    ];
    return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
  },

  /** Utilisateurs, avec leur dernière connexion et leur nombre de vidéos. */
  async listUsers(query: ListUsersQuery) {
    const filter = and(mobileUser, userFilter({ ...query, role: undefined }));
    const pagination = { page: query.page, limit: query.limit };
    const [items, totalCount] = await Promise.all([
      db
        .select()
        .from(users)
        .where(filter)
        .orderBy(desc(users.createdAt))
        .offset(skipFor(pagination))
        .limit(query.limit),
      countWhere(users, filter),
    ]);
    const counts = await videoCounts(items.map((user) => user.id));
    return {
      items: items.map((user) => toAdminUserDto(user, counts.get(user.id))),
      meta: paginationMeta(pagination, totalCount),
    };
  },

  /** Fiche d'un utilisateur : profil, vidéos et paiements récents. */
  async getUser(userId: string) {
    const user = await findUserById(userId);
    if (!user || user.role !== 'user') throw AppError.notFound('Utilisateur introuvable.');
    const [recentVideos, videosByStatus, recentPayments, [paid]] = await Promise.all([
      db
        .select(videoListColumns)
        .from(videos)
        .where(eq(videos.userId, user.id))
        .orderBy(desc(videos.createdAt))
        .limit(12),
      groupCount<(typeof VIDEO_STATUSES)[number]>(
        videos,
        videos.status,
        eq(videos.userId, user.id),
      ),
      db
        .select()
        .from(payments)
        .where(eq(payments.userId, user.id))
        .orderBy(desc(payments.createdAt))
        .limit(20),
      db
        .select({ value: sumOf(payments.amount) })
        .from(payments)
        .where(and(eq(payments.userId, user.id), eq(payments.status, 'accepted'))),
    ]);
    const byStatus = tally(VIDEO_STATUSES, videosByStatus);
    const author = { id: user.id, firstName: user.firstName, email: user.email };
    return {
      user: toAdminUserDto(
        user,
        Object.values(byStatus).reduce((sum, value) => sum + value, 0),
      ),
      videosByStatus: byStatus,
      totalPaid: paid?.value ?? 0,
      currency: PAYMENT_CURRENCY,
      videos: recentVideos.map((video) => toVideoDto(video)),
      payments: recentPayments.map((payment) => toAdminPaymentDto({ payment, user: author })),
    };
  },

  /** Offre ou retire Premium à la main (geste commercial, support). */
  async updateSubscription(userId: string, input: UpdateSubscriptionInput) {
    const user = await findUserById(userId);
    if (!user) throw AppError.notFound('Utilisateur introuvable.');
    if (user.role === 'admin') throw AppError.badRequest(ADMIN_ALREADY_PREMIUM);
    if (input.plan === 'free') {
      await updateUser(user, { subscriptionPlan: 'free', subscriptionExpiresAt: null });
    } else {
      // Prolonge un abonnement encore actif plutôt que de l'écraser.
      const from =
        isPremium(user) && user.subscriptionExpiresAt ? user.subscriptionExpiresAt : new Date();
      const expiresAt = new Date(from.getTime() + input.days * DAY_MS);
      await updateUser(user, { subscriptionPlan: 'premium', subscriptionExpiresAt: expiresAt });
      await notificationService.premiumActivated(user.id, expiresAt, { gift: true });
    }
    return toAdminUserDto(user, await countWhere(videos, eq(videos.userId, user.id)));
  },

  /** Tous les paiements, filtrables par statut, offre ou recherche (transaction, email, prénom). */
  async listPayments(query: AdminListPaymentsQuery) {
    const search = and(
      query.offer ? eq(payments.offer, query.offer) : undefined,
      query.q
        ? searchAny(query.q, [payments.transactionId, users.email, users.firstName])
        : undefined,
    );
    const filter = and(
      or(isNull(users.role), mobileUser),
      query.status ? eq(payments.status, query.status) : undefined,
      search,
    );
    const pagination = { page: query.page, limit: query.limit };
    const [rows, [totals], [accepted]] = await Promise.all([
      db
        .select({ payment: payments, user: authorColumns })
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .where(filter)
        .orderBy(desc(payments.createdAt))
        .offset(skipFor(pagination))
        .limit(query.limit),
      db
        .select({ count: total() })
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .where(filter),
      // Montant encaissé parmi les paiements de la recherche (le filtre de statut est ignoré).
      db
        .select({ value: sumOf(payments.amount) })
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .where(and(or(isNull(users.role), mobileUser), search, eq(payments.status, 'accepted'))),
    ]);
    return {
      items: rows.map(toAdminPaymentDto),
      meta: paginationMeta(pagination, totals?.count ?? 0),
      acceptedAmount: accepted?.value ?? 0,
    };
  },

  /** Comptes administrateurs du back-office (Premium d'office dans l'app). */
  async listAdmins() {
    const admins = await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'))
      .orderBy(desc(users.createdAt));
    const counts = await videoCounts(admins.map((admin) => admin.id));
    return admins.map((admin) => toAdminUserDto(admin, counts.get(admin.id)));
  },

  /** Nouveau compte administrateur, utilisable aussitôt (email considéré comme vérifié). */
  async createAdmin(input: CreateAdminInput) {
    if (await findUserByEmail(input.email)) throw AppError.conflict(ADMIN_EMAIL_TAKEN);
    try {
      const [admin] = await db
        .insert(users)
        .values({
          firstName: input.firstName,
          email: input.email.toLowerCase(),
          password: await hashPassword(input.password),
          role: 'admin',
          isEmailVerified: true,
        })
        .returning();
      if (!admin) throw new Error('Insertion administrateur sans résultat');
      return toAdminUserDto(admin);
    } catch (error) {
      if (uniqueViolation(error) !== undefined) throw AppError.conflict(ADMIN_EMAIL_TAKEN);
      throw error;
    }
  },

  /** Supprime un compte administrateur (jamais le sien : il reste toujours un admin). */
  async removeAdmin(actorId: string, adminId: string) {
    if (actorId === adminId)
      throw AppError.badRequest('Vous ne pouvez pas supprimer votre propre compte administrateur.');
    const admin = await findUserById(adminId);
    if (!admin || admin.role !== 'admin') throw AppError.notFound('Administrateur introuvable.');
    await videoService.removeAllForUser(admin.id);
    await userService.purge(admin);
  },

  /** Vidéos de tous les utilisateurs, avec l'auteur. */
  async withAuthors<T extends { userId: string }>(items: T[]) {
    const ids = [...new Set(items.map((item) => item.userId))];
    const authors =
      ids.length === 0
        ? []
        : await db.select(authorColumns).from(users).where(inArray(users.id, ids));
    const byId = new Map(authors.map((author) => [author.id, author]));
    return items.map((item) => ({ ...item, user: byId.get(item.userId) ?? null }));
  },

  /** Services configurés (jamais les clés elles-mêmes). */
  system() {
    return {
      environment: env.NODE_ENV,
      aiDemoMode: isAiDemoMode,
      services: [
        { id: 'openai', label: 'OpenAI (GPT + Sora)', configured: Boolean(env.OPENAI_API_KEY) },
        {
          id: 'openai_fallback',
          label: 'OpenAI (clé de secours)',
          configured: Boolean(env.OPENAI_FALLBACK_API_KEY),
        },
        { id: 'veo', label: 'Veo 3.1 (kie.ai)', configured: Boolean(env.KIE_VEO_API_KEY) },
        {
          id: 'elevenlabs',
          label: 'ElevenLabs (voix off)',
          configured: Boolean(env.ELEVENLABS_API_KEY),
        },
        {
          id: 'cloudinary',
          label: 'Cloudinary (stockage)',
          configured: env.STORAGE_DRIVER === 'cloudinary' && Boolean(env.CLOUDINARY_API_KEY),
        },
        { id: 'smtp', label: 'Emails (SMTP)', configured: Boolean(env.SMTP_HOST) },
        { id: 'firebase', label: 'Notifications push (Firebase)', configured: isPushConfigured() },
        {
          id: 'cinetpay',
          label: 'CinetPay (paiement)',
          configured: env.PAYMENT_PROVIDER === 'cinetpay' && Boolean(env.CINETPAY_API_KEY),
        },
      ],
      models: { text: env.OPENAI_TEXT_MODEL, video: env.SORA_MODEL },
      limits: {
        free: env.GENERATION_DAILY_LIMIT_FREE,
        premium: env.GENERATION_DAILY_LIMIT_PREMIUM,
      },
      paymentProvider: env.PAYMENT_PROVIDER,
      storageDriver: env.STORAGE_DRIVER,
    };
  },
};
