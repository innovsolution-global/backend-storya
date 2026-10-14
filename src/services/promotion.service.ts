import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '../config/database';
import type { PremiumOfferId } from '../constants';
import { promotions } from '../db/schema';
import { updateUser } from '../db/users';
import type { IMedia, IUser } from '../models';
import { AppError } from '../utils/AppError';
import { mediaUrl } from '../utils/serializers';
import type {
  CreatePromotionInput,
  PromotionKind,
  UpdatePromotionInput,
} from '../validators/promotion.validator';
import { mediaService } from './media.service';

type Promotion = typeof promotions.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Programmée, en cours, terminée ou mise en pause par un administrateur. */
export type PromotionStatus = 'scheduled' | 'active' | 'ended' | 'paused';

function statusOf(promotion: Promotion, now = new Date()): PromotionStatus {
  if (!promotion.isActive) return 'paused';
  if (promotion.startsAt > now) return 'scheduled';
  if (promotion.endsAt && promotion.endsAt <= now) return 'ended';
  return 'active';
}

function toPromotionDto(promotion: Promotion) {
  return {
    id: promotion.id,
    kind: promotion.kind,
    title: promotion.title,
    description: promotion.description ?? '',
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt ?? null,
    isActive: promotion.isActive,
    status: statusOf(promotion),
    imageUrl: mediaUrl(promotion.image),
    ctaLabel: promotion.ctaLabel ?? null,
    ctaTarget: promotion.ctaTarget ?? null,
    discountPercent: promotion.discountPercent ?? null,
    offerIds: promotion.offerIds,
    trialDays: promotion.trialDays ?? null,
    uses: promotion.uses,
    createdAt: promotion.createdAt,
  };
}

/** Promotions d'un type en cours en ce moment. */
function liveOf(kind: PromotionKind) {
  const now = new Date();
  return db
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.kind, kind),
        eq(promotions.isActive, true),
        lte(promotions.startsAt, now),
        or(isNull(promotions.endsAt), gt(promotions.endsAt, now)),
      ),
    )
    .orderBy(desc(promotions.startsAt));
}

/** CinetPay exige des montants multiples de 5. */
function discounted(amount: number, percent: number): number {
  return Math.max(5, Math.floor((amount * (100 - percent)) / 100 / 5) * 5);
}

async function findPromotion(id: string): Promise<Promotion> {
  const [promotion] = await db.select().from(promotions).where(eq(promotions.id, id)).limit(1);
  if (!promotion) throw AppError.notFound('Promotion introuvable.');
  return promotion;
}

export const promotionService = {
  /** Bannières affichées sur l'accueil de l'app. */
  async banners() {
    const rows = await liveOf('banner');
    return rows.map((banner) => ({
      id: banner.id,
      title: banner.title,
      description: banner.description ?? '',
      imageUrl: mediaUrl(banner.image),
      ctaLabel: banner.ctaLabel ?? null,
      ctaTarget: banner.ctaTarget ?? 'create',
      endsAt: banner.endsAt ?? null,
    }));
  },

  /**
   * Meilleure réduction en cours pour une offre Premium (la plus forte si
   * plusieurs offres limitées se chevauchent).
   */
  async discountFor(offerId: PremiumOfferId, amount: number) {
    const live = (await liveOf('discount')).filter(
      (promotion) => promotion.offerIds.length === 0 || promotion.offerIds.includes(offerId),
    );
    const best = live.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0))[0];
    if (!best?.discountPercent) return null;
    return {
      promotion: best,
      percent: best.discountPercent,
      amount: discounted(amount, best.discountPercent),
    };
  },

  /** Nouvel inscrit : essai Premium gratuit s'il y en a un en cours (le plus long). */
  async applyTrial(user: IUser): Promise<void> {
    if (user.role !== 'user') return;
    const best = (await liveOf('trial')).sort((a, b) => (b.trialDays ?? 0) - (a.trialDays ?? 0))[0];
    if (!best?.trialDays) return;
    await updateUser(user, {
      subscriptionPlan: 'premium',
      subscriptionExpiresAt: new Date(Date.now() + best.trialDays * DAY_MS),
    });
    await this.countUse(best.id);
  },

  /** Une utilisation de plus (paiement réduit accepté, essai accordé). */
  async countUse(id: string): Promise<void> {
    await db
      .update(promotions)
      .set({ uses: sql`${promotions.uses} + 1` })
      .where(eq(promotions.id, id));
  },

  // ─── Back-office ───────────────────────────────────────────────────────

  async list() {
    const rows = await db.select().from(promotions).orderBy(desc(promotions.createdAt));
    return rows.map(toPromotionDto);
  },

  async create(adminId: string, input: CreatePromotionInput) {
    const [promotion] = await db
      .insert(promotions)
      .values({
        kind: input.kind,
        title: input.title,
        description: input.description ?? null,
        startsAt: input.startsAt ?? new Date(),
        endsAt: input.endsAt ?? null,
        isActive: input.isActive ?? true,
        ctaLabel: input.kind === 'banner' ? (input.ctaLabel ?? null) : null,
        ctaTarget: input.kind === 'banner' ? (input.ctaTarget ?? 'create') : null,
        discountPercent: input.kind === 'discount' ? input.discountPercent : null,
        offerIds: input.kind === 'discount' ? (input.offerIds ?? []) : [],
        trialDays: input.kind === 'trial' ? input.trialDays : null,
        createdBy: adminId,
      })
      .returning();
    if (!promotion) throw new Error('Insertion promotion sans résultat');
    return toPromotionDto(promotion);
  },

  async update(id: string, input: UpdatePromotionInput) {
    const promotion = await findPromotion(id);
    const startsAt = input.startsAt ?? promotion.startsAt;
    const endsAt = input.endsAt === undefined ? promotion.endsAt : input.endsAt;
    if (endsAt && endsAt <= startsAt) {
      throw AppError.badRequest('La fin doit être après le début.');
    }
    const [saved] = await db
      .update(promotions)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        startsAt,
        endsAt,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(promotion.kind === 'banner'
          ? {
              ...(input.ctaLabel !== undefined ? { ctaLabel: input.ctaLabel } : {}),
              ...(input.ctaTarget !== undefined ? { ctaTarget: input.ctaTarget } : {}),
            }
          : {}),
        ...(promotion.kind === 'discount'
          ? {
              ...(input.discountPercent !== undefined
                ? { discountPercent: input.discountPercent }
                : {}),
              ...(input.offerIds !== undefined ? { offerIds: input.offerIds } : {}),
            }
          : {}),
        ...(promotion.kind === 'trial' && input.trialDays !== undefined
          ? { trialDays: input.trialDays }
          : {}),
      })
      .where(eq(promotions.id, id))
      .returning();
    return toPromotionDto(saved ?? promotion);
  },

  async remove(id: string): Promise<void> {
    const promotion = await findPromotion(id);
    await db.delete(promotions).where(eq(promotions.id, id));
    await mediaService.remove(promotion.image);
  },

  /** Image d'une bannière (remplace la précédente). */
  async setImage(id: string, file: Express.Multer.File | undefined) {
    const promotion = await findPromotion(id);
    if (promotion.kind !== 'banner') throw AppError.badRequest('Seule une bannière a une image.');
    if (!file) throw AppError.badRequest('Choisissez une image.');
    const image: IMedia = await mediaService.storeUpload(file, 'image', 'promotions');
    const [saved] = await db
      .update(promotions)
      .set({ image })
      .where(eq(promotions.id, id))
      .returning();
    await mediaService.remove(promotion.image);
    return toPromotionDto(saved ?? { ...promotion, image });
  },
};
