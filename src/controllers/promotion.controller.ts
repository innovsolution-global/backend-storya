import type { Request } from 'express';

import { currentUser } from '../middlewares/auth';
import { promotionService } from '../services/promotion.service';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type { CreatePromotionInput, UpdatePromotionInput } from '../validators/promotion.validator';

const promotionId = (req: Request) => (req.params as { id: string }).id;

export const promotionController = {
  /** App : bannières en cours sur l'accueil. */
  banners: asyncHandler(async (_req, res) => {
    sendSuccess(res, await promotionService.banners());
  }),

  list: asyncHandler(async (_req, res) => {
    sendSuccess(res, await promotionService.list());
  }),

  create: asyncHandler(async (req, res) => {
    const promotion = await promotionService.create(
      currentUser(req).id,
      req.body as CreatePromotionInput,
    );
    sendSuccess(res, promotion, { message: 'Promotion créée.', statusCode: 201 });
  }),

  update: asyncHandler(async (req, res) => {
    const promotion = await promotionService.update(
      promotionId(req),
      req.body as UpdatePromotionInput,
    );
    sendSuccess(res, promotion, { message: 'Promotion mise à jour.' });
  }),

  remove: asyncHandler(async (req, res) => {
    await promotionService.remove(promotionId(req));
    sendSuccess(res, null, { message: 'Promotion supprimée.' });
  }),

  setImage: asyncHandler(async (req, res) => {
    const promotion = await promotionService.setImage(promotionId(req), req.file);
    sendSuccess(res, promotion, { message: 'Image de la bannière mise à jour.' });
  }),
};
