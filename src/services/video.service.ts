import type { SQL } from 'drizzle-orm';
import { and, count, desc, eq, getTableColumns, gte, inArray, isNotNull, ne } from 'drizzle-orm';

import { db } from '../config/database';
import { env, isAiDemoMode } from '../config/env';
import { logger } from '../config/logger';
import { searchAny } from '../db/helpers';
import { users, videos } from '../db/schema';
import { findUserById } from '../db/users';
import { currentLang } from '../i18n';
import { getAiClients } from '../integrations/ai';
import type { IMedia, IVideo } from '../models';
import { isPremium } from '../models';
import { AppError } from '../utils/AppError';
import { generationQueue } from '../utils/jobQueue';
import type { PaginationInput } from '../utils/pagination';
import { paginationMeta, skipFor } from '../utils/pagination';
import type { VideoDto } from '../utils/serializers';
import { mediaUrl, toVideoDto } from '../utils/serializers';
import type {
  AdminListVideosQuery,
  CreateVideoInput,
  ExploreQuery,
  ListVideosQuery,
} from '../validators/video.validator';
import { mediaService } from './media.service';
import { notificationService } from './notification.service';
import { runVideoJob } from './videoGenerator.service';
import { deriveTitle } from './videoScript.service';

/** Colonnes des listes : sans le script (scènes, voix off), lourd et inutile ici. */
const listColumns = Object.fromEntries(
  Object.entries(getTableColumns(videos)).filter(
    ([key]) => key !== 'scenes' && key !== 'narration',
  ),
) as Omit<ReturnType<typeof getTableColumns<typeof videos>>, 'scenes' | 'narration'>;
export const videoListColumns = listColumns;

const ACTIVE_STATUSES = ['queued', 'processing'] as const;

/** Champs jamais montrés dans Explorer (vitrine publique). */
const PRIVATE_FIELDS = ['error', 'warnings', 'imageUrls', 'progress', 'demo'] as const;

function publicVideo(dto: VideoDto): Omit<VideoDto, (typeof PRIVATE_FIELDS)[number]> {
  const copy: Partial<VideoDto> = { ...dto };
  for (const field of PRIVATE_FIELDS) delete copy[field];
  return copy as Omit<VideoDto, (typeof PRIVATE_FIELDS)[number]>;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function enqueue(video: Pick<IVideo, 'id'>): void {
  generationQueue.enqueue(`video:${video.id}`, () => runVideoJob(video.id));
}

async function findOwned(userId: string, videoId: string): Promise<IVideo> {
  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
    .limit(1);
  if (!video) throw AppError.notFound('Vidéo introuvable.');
  return video;
}

async function removeMedia(video: Pick<IVideo, 'images' | 'output' | 'thumbnail'>): Promise<void> {
  const files: (IMedia | null)[] = [...video.images, video.output, video.thumbnail];
  await Promise.all(files.map((media) => mediaService.remove(media)));
}

/** Une génération en attente ou en cours pour cet utilisateur (hors vidéo `exceptId`) ? */
async function hasRunningJob(userId: string, exceptId?: string): Promise<boolean> {
  const [running] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(
      and(
        eq(videos.userId, userId),
        inArray(videos.status, [...ACTIVE_STATUSES]),
        exceptId ? ne(videos.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(running);
}

async function listPage(filter: SQL | undefined, pagination: PaginationInput) {
  const [items, [total]] = await Promise.all([
    db
      .select(listColumns)
      .from(videos)
      .where(filter)
      .orderBy(desc(videos.createdAt))
      .offset(skipFor(pagination))
      .limit(pagination.limit),
    db.select({ value: count() }).from(videos).where(filter),
  ]);
  return { items, meta: paginationMeta(pagination, total?.value ?? 0) };
}

export const videoService = {
  /** Quota journalier selon l'abonnement (les générations échouées ne comptent pas). */
  async quota(userId: string): Promise<{ limit: number; used: number; remaining: number }> {
    const user = await findUserById(userId);
    if (!user) throw AppError.unauthorized();
    const limit = isPremium(user)
      ? env.GENERATION_DAILY_LIMIT_PREMIUM
      : env.GENERATION_DAILY_LIMIT_FREE;
    const [row] = await db
      .select({ value: count() })
      .from(videos)
      .where(
        and(
          eq(videos.userId, userId),
          gte(videos.createdAt, startOfToday()),
          ne(videos.status, 'failed'),
        ),
      );
    const used = row?.value ?? 0;
    return { limit, used, remaining: Math.max(0, limit - used) };
  },

  async create(
    userId: string,
    input: CreateVideoInput,
    files: Express.Multer.File[],
  ): Promise<VideoDto> {
    if (!getAiClients().openai.isConfigured && !isAiDemoMode) {
      throw AppError.serviceUnavailable('La génération de vidéos est temporairement indisponible.');
    }

    if (await hasRunningJob(userId)) {
      throw AppError.conflict(
        'Une vidéo est déjà en cours de génération. Attendez la fin pour en lancer une autre.',
      );
    }

    const { remaining, limit } = await this.quota(userId);
    if (remaining <= 0) {
      throw AppError.tooManyRequests(
        `Quota atteint : ${limit} vidéo${limit > 1 ? 's' : ''} par jour. Passez Premium pour en créer davantage.`,
      );
    }

    // Images validées (contenu réel) puis copiées vers le stockage final.
    const images: IMedia[] = [];
    try {
      for (const file of files) {
        images.push(await mediaService.storeUpload(file, 'image', 'videos/inputs'));
      }
    } catch (error) {
      await Promise.all(images.map((image) => mediaService.remove(image)));
      throw error;
    }

    const [video] = await db
      .insert(videos)
      .values({
        userId,
        ...input,
        title: input.title ?? deriveTitle(input, currentLang()),
        images,
        language: currentLang(),
        demo: isAiDemoMode,
      })
      .returning();
    if (!video) throw new Error('Insertion vidéo sans résultat');
    enqueue(video);
    return toVideoDto(video);
  },

  async list(userId: string, query: ListVideosQuery) {
    const { items, meta } = await listPage(
      and(
        eq(videos.userId, userId),
        query.type ? eq(videos.type, query.type) : undefined,
        query.status ? eq(videos.status, query.status) : undefined,
      ),
      { page: query.page, limit: query.limit },
    );
    return { items: items.map((video) => toVideoDto(video)), meta };
  },

  async get(userId: string, videoId: string): Promise<VideoDto> {
    return toVideoDto(await findOwned(userId, videoId), { detail: true });
  },

  async rename(userId: string, videoId: string, title: string): Promise<VideoDto> {
    const video = await findOwned(userId, videoId);
    const [saved] = await db
      .update(videos)
      .set({ title })
      .where(eq(videos.id, video.id))
      .returning();
    return toVideoDto(saved ?? { ...video, title }, { detail: true });
  },

  async remove(userId: string, videoId: string): Promise<void> {
    const video = await findOwned(userId, videoId);
    if (video.status === 'processing') {
      throw AppError.conflict(
        'La vidéo est en cours de génération : attendez la fin pour la supprimer.',
      );
    }
    await db.delete(videos).where(eq(videos.id, video.id));
    await removeMedia(video);
  },

  /** Publie une vidéo terminée dans Explorer (visible par tous les utilisateurs). */
  async publish(userId: string, videoId: string): Promise<VideoDto> {
    const video = await findOwned(userId, videoId);
    if (video.status !== 'completed') {
      throw AppError.badRequest('Seule une vidéo terminée peut être publiée.');
    }
    if (video.publishedAt) return toVideoDto(video, { detail: true });
    const [saved] = await db
      .update(videos)
      .set({ publishedAt: new Date() })
      .where(eq(videos.id, video.id))
      .returning();
    return toVideoDto(saved ?? video, { detail: true });
  },

  /** Retire une vidéo d'Explorer : elle redevient privée. */
  async unpublish(userId: string, videoId: string): Promise<VideoDto> {
    const video = await findOwned(userId, videoId);
    const [saved] = await db
      .update(videos)
      .set({ publishedAt: null })
      .where(eq(videos.id, video.id))
      .returning();
    return toVideoDto(saved ?? { ...video, publishedAt: null }, { detail: true });
  },

  /** Fil Explorer : vidéos publiées par leurs auteurs, les plus récentes d'abord. */
  async explore(userId: string, query: ExploreQuery) {
    const filter = and(
      isNotNull(videos.publishedAt),
      eq(videos.status, 'completed'),
      query.type ? eq(videos.type, query.type) : undefined,
    );
    const pagination: PaginationInput = { page: query.page, limit: query.limit };
    const [rows, [total]] = await Promise.all([
      db
        .select({
          video: listColumns,
          author: { id: users.id, firstName: users.firstName, avatar: users.avatar },
        })
        .from(videos)
        .innerJoin(users, eq(videos.userId, users.id))
        .where(filter)
        .orderBy(desc(videos.publishedAt))
        .offset(skipFor(pagination))
        .limit(pagination.limit),
      db.select({ value: count() }).from(videos).where(filter),
    ]);
    return {
      items: rows.map(({ video, author }) => {
        const dto = publicVideo(toVideoDto(video));
        return {
          ...dto,
          author: { firstName: author.firstName, avatarUrl: mediaUrl(author.avatar) },
          isMine: author.id === userId,
        };
      }),
      meta: paginationMeta(pagination, total?.value ?? 0),
    };
  },

  /** Back-office : retire une vidéo d'Explorer (modération). */
  async adminUnpublish(videoId: string): Promise<void> {
    const [saved] = await db
      .update(videos)
      .set({ publishedAt: null })
      .where(eq(videos.id, videoId))
      .returning({ id: videos.id, userId: videos.userId, title: videos.title });
    if (!saved) throw AppError.notFound('Vidéo introuvable.');
    await notificationService.videoUnpublished(saved.userId, saved.id, saved.title);
  },

  /** Relance une génération échouée (mêmes paramètres, mêmes images). */
  async retry(userId: string, videoId: string): Promise<VideoDto> {
    const video = await findOwned(userId, videoId);
    if (video.status !== 'failed') {
      throw AppError.badRequest('Seule une génération échouée peut être relancée.');
    }
    if (await hasRunningJob(userId, video.id)) {
      throw AppError.conflict('Une autre vidéo est déjà en cours de génération.');
    }

    const [saved] = await db
      .update(videos)
      .set({
        status: 'queued',
        progress: { step: 0, total: video.progress.total },
        scenes: [],
        warnings: [],
        error: null,
        startedAt: null,
        finishedAt: null,
        demo: isAiDemoMode,
      })
      .where(eq(videos.id, video.id))
      .returning();
    if (!saved) throw AppError.notFound('Vidéo introuvable.');
    enqueue(saved);
    return toVideoDto(saved, { detail: true });
  },

  /** Supprime toutes les vidéos d'un utilisateur (suppression de compte). */
  async removeAllForUser(userId: string): Promise<void> {
    const removed = await db.delete(videos).where(eq(videos.userId, userId)).returning({
      images: videos.images,
      output: videos.output,
      thumbnail: videos.thumbnail,
    });
    await Promise.all(removed.map((video) => removeMedia(video)));
  },

  async adminList(query: AdminListVideosQuery) {
    const { items, meta } = await listPage(
      and(
        query.type ? eq(videos.type, query.type) : undefined,
        query.status ? eq(videos.status, query.status) : undefined,
        query.user ? eq(videos.userId, query.user) : undefined,
        query.q ? searchAny(query.q, [videos.title, videos.prompt, videos.brand]) : undefined,
      ),
      { page: query.page, limit: query.limit },
    );
    return {
      items: items.map((video) => ({ ...toVideoDto(video), userId: video.userId })),
      meta,
    };
  },

  async adminRemove(videoId: string): Promise<void> {
    const [video] = await db.delete(videos).where(eq(videos.id, videoId)).returning();
    if (!video) throw AppError.notFound('Vidéo introuvable.');
    await removeMedia(video);
  },

  /**
   * Au démarrage : les vidéos « processing » ont été interrompues par l'arrêt du
   * serveur (marquées en échec, relançables), celles « queued » sont remises en file.
   */
  async recoverInterruptedJobs(): Promise<void> {
    const interrupted = await db
      .update(videos)
      .set({
        status: 'failed',
        error: 'Génération interrompue par un redémarrage du serveur. Relancez-la.',
        finishedAt: new Date(),
      })
      .where(eq(videos.status, 'processing'))
      .returning({ id: videos.id });
    const queued = await db
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.status, 'queued'))
      .orderBy(videos.createdAt);
    queued.forEach(enqueue);
    if (interrupted.length || queued.length) {
      logger.info(
        { failed: interrupted.length, requeued: queued.length },
        'Générations vidéo récupérées',
      );
    }
  },
};
