import { Router } from 'express';

import { promotionController } from '../controllers/promotion.controller';
import { authenticate } from '../middlewares/auth';

/** Promotions vues par l'app mobile. */
export const promotionRouter = Router();

promotionRouter.get('/banners', authenticate, promotionController.banners);
