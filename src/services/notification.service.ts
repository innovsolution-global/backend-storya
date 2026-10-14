import { and, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import { paginationMeta, skipFor } from '../utils/pagination';

import { db } from '../config/database';
import { logger } from '../config/logger';
import { devices, notifications, pushCampaigns, users } from '../db/schema';
import { findUserById } from '../db/users';
import type { Lang } from '../i18n';
import { resolveUserLang, t } from '../i18n';
import type { PushMessage } from '../integrations/push';
import { getPushProvider, isPushConfigured } from '../integrations/push';
import type { IUser, IVideo } from '../models';
import type { RegisterDeviceInput } from '../validators/user.validator';
import type { SendCampaignInput } from '../validators/admin.validator';

/**
 * Catégorie d'une notification, liée aux réglages du profil :
 * - `videoReady` : génération terminée (réglage « Vidéo prête ») ;
 * - `offers` : campagnes du back-office (réglage « Offres ») ;
 * - `account` : compte (Premium, modération) — toujours envoyée.
 */
type Kind = 'videoReady' | 'offers' | 'account';

function allows(user: Pick<IUser, 'settings'>, kind: Kind): boolean {
  if (kind === 'account') return true;
  return user.settings?.notifications?.[kind] !== false;
}

async function tokensOf(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ token: devices.token })
    .from(devices)
    .where(inArray(devices.userId, userIds));
  return rows.map((row) => row.token);
}

/** Envoie et oublie les jetons refusés définitivement (app désinstallée…). */
async function deliver(tokens: string[], message: PushMessage) {
  if (tokens.length === 0) return { sent: 0, failed: 0 };
  const result = await getPushProvider().send(tokens, message);
  if (result.invalidTokens.length > 0) {
    await db.delete(devices).where(inArray(devices.token, result.invalidTokens));
  }
  return { sent: result.sent, failed: result.failed };
}

/** Notification à un utilisateur, dans sa langue. N'échoue jamais (journalisée). */
async function notifyUser(
  userId: string,
  kind: Kind,
  build: (lang: Lang) => PushMessage,
  fallbackLang?: Lang,
): Promise<void> {
  try {
    const user = await findUserById(userId);
    if (!user || !allows(user, kind)) return;
    const message = build(resolveUserLang(user.settings?.language, fallbackLang));
    // Gardée dans la boîte de réception, même sans téléphone enregistré.
    await db.insert(notifications).values({
      userId: user.id,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
    });
    await deliver(await tokensOf([user.id]), message);
  } catch (error) {
    logger.warn({ err: error, userId, kind }, 'Notification non envoyée');
  }
}

export const notificationService = {
  /** Le téléphone de l'utilisateur recevra ses notifications (un jeton n'appartient qu'à un compte). */
  async registerDevice(userId: string, input: RegisterDeviceInput): Promise<void> {
    await db
      .insert(devices)
      .values({ userId, token: input.token, platform: input.platform })
      .onConflictDoUpdate({
        target: devices.token,
        set: { userId, platform: input.platform, lastSeenAt: new Date() },
      });
  },

  /** Déconnexion : ce téléphone ne reçoit plus les notifications de ce compte. */
  async unregisterDevice(userId: string, token: string): Promise<void> {
    await db.delete(devices).where(and(eq(devices.userId, userId), eq(devices.token, token)));
  },

  /** Génération terminée : « vidéo prête » ou « échec », un appui ouvre la vidéo. */
  videoFinished(
    video: Pick<IVideo, 'id' | 'userId' | 'title' | 'language'>,
    status: 'completed' | 'failed',
  ) {
    return notifyUser(
      video.userId,
      'videoReady',
      (lang) =>
        status === 'completed'
          ? {
              title: t('Votre vidéo est prête', {}, lang),
              body: t(
                '« {title} » est prête : touchez pour la regarder.',
                { title: video.title },
                lang,
              ),
              data: { type: 'video', videoId: video.id },
            }
          : {
              title: t('La génération a échoué', {}, lang),
              body: t(
                '« {title} » n’a pas pu être générée. Touchez pour réessayer.',
                { title: video.title },
                lang,
              ),
              data: { type: 'video', videoId: video.id },
            },
      video.language,
    );
  },

  /** Premium activé (paiement accepté) ou offert par un administrateur. */
  premiumActivated(userId: string, expiresAt: Date, options: { gift?: boolean } = {}) {
    return notifyUser(userId, 'account', (lang) => ({
      title: options.gift
        ? t('Premium vous est offert', {}, lang)
        : t('Bienvenue dans Storya Premium', {}, lang),
      body: t(
        'Profitez de plus de vidéos chaque jour, jusqu’au {date}.',
        { date: expiresAt.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR') },
        lang,
      ),
      data: { type: 'premium' },
    }));
  },

  /** Modération : la vidéo de l'auteur a été retirée d'Explorer. */
  videoUnpublished(userId: string, videoId: string, title: string) {
    return notifyUser(userId, 'account', (lang) => ({
      title: t('Vidéo retirée d’Explorer', {}, lang),
      body: t(
        '« {title} » n’est plus visible dans Explorer. Elle reste dans vos vidéos.',
        { title },
        lang,
      ),
      data: { type: 'video', videoId },
    }));
  },

  /** Campagne du back-office : utilisateurs mobiles visés qui acceptent les offres. */
  async sendCampaign(adminId: string, input: SendCampaignInput) {
    const now = new Date();
    const premium = and(
      eq(users.subscriptionPlan, 'premium'),
      or(isNull(users.subscriptionExpiresAt), gt(users.subscriptionExpiresAt, now)),
    );
    const audience =
      input.audience === 'premium'
        ? premium
        : input.audience === 'free'
          ? sql`not (${premium})`
          : undefined;
    const targets = (
      await db
        .select({ id: users.id, settings: users.settings })
        .from(users)
        .where(and(eq(users.role, 'user'), audience))
    ).filter((user) => allows(user, 'offers'));

    if (targets.length > 0) {
      await db.insert(notifications).values(
        targets.map((user) => ({
          userId: user.id,
          title: input.title,
          body: input.body,
          data: { type: 'campaign' },
        })),
      );
    }
    const tokens = await tokensOf(targets.map((user) => user.id));
    const result = await deliver(tokens, {
      title: input.title,
      body: input.body,
      data: { type: 'campaign' },
    });
    const [campaign] = await db
      .insert(pushCampaigns)
      .values({
        title: input.title,
        body: input.body,
        audience: input.audience,
        recipients: targets.length,
        sent: result.sent,
        failed: result.failed,
        createdBy: adminId,
      })
      .returning();
    return { ...campaign, devices: tokens.length };
  },

  /** Boîte de réception de l'utilisateur, la plus récente d'abord, et le nombre de non lues. */
  async inbox(userId: string, query: { page: number; limit: number }) {
    const pagination = { page: query.page, limit: query.limit };
    const mine = eq(notifications.userId, userId);
    const [items, [total], [unread]] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(mine)
        .orderBy(desc(notifications.createdAt))
        .offset(skipFor(pagination))
        .limit(pagination.limit),
      db.select({ value: count() }).from(notifications).where(mine),
      db
        .select({ value: count() })
        .from(notifications)
        .where(and(mine, isNull(notifications.readAt))),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        data: item.data,
        read: item.readAt !== null,
        createdAt: item.createdAt,
      })),
      unread: unread?.value ?? 0,
      meta: paginationMeta(pagination, total?.value ?? 0),
    };
  },

  /** Marque une notification (ou toutes si aucun identifiant) comme lue. */
  async markRead(userId: string, id?: string): Promise<number> {
    const rows = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          id ? eq(notifications.id, id) : undefined,
        ),
      )
      .returning({ id: notifications.id });
    return rows.length;
  },

  /** Historique des campagnes et téléphones joignables, pour le back-office. */
  async campaigns() {
    const [history, [reachable]] = await Promise.all([
      db
        .select({ campaign: pushCampaigns, author: users.firstName })
        .from(pushCampaigns)
        .leftJoin(users, eq(pushCampaigns.createdBy, users.id))
        .orderBy(desc(pushCampaigns.createdAt))
        .limit(50),
      db
        .select({ value: count() })
        .from(devices)
        .innerJoin(users, eq(devices.userId, users.id))
        .where(eq(users.role, 'user')),
    ]);
    return {
      configured: isPushConfigured(),
      devices: reachable?.value ?? 0,
      items: history.map(({ campaign, author }) => ({ ...campaign, author })),
    };
  },
};
