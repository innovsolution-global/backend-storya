import { Router } from 'express';

import { videoController } from '../controllers/video.controller';
import { authenticate } from '../middlewares/auth';
import { generationLimiter } from '../middlewares/rateLimiters';
import { sanitizeInput } from '../middlewares/sanitize';
import { videoImagesUpload } from '../middlewares/upload';
import { validate } from '../middlewares/validate';
import { idParamSchema } from '../validators/common.validator';
import {
  createVideoSchema,
  exploreQuerySchema,
  listVideosQuerySchema,
  updateVideoSchema,
} from '../validators/video.validator';

export const videoRouter = Router();

videoRouter.use(authenticate);

// JSON ou multipart/form-data (champ fichier « images », 5 max). Les champs texte
// du multipart n'existent qu'après multer : ils sont nettoyés à ce moment-là.
videoRouter.post(
  '/',
  generationLimiter,
  videoImagesUpload,
  sanitizeInput,
  validate({ body: createVideoSchema }),
  videoController.create,
);
videoRouter.get('/', validate({ query: listVideosQuerySchema }), videoController.list);
videoRouter.get('/quota', videoController.quota);
videoRouter.get('/explore', validate({ query: exploreQuerySchema }), videoController.explore);
videoRouter.get('/:id', validate({ params: idParamSchema }), videoController.get);
videoRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateVideoSchema }),
  videoController.rename,
);
videoRouter.delete('/:id', validate({ params: idParamSchema }), videoController.remove);
videoRouter.post('/:id/retry', validate({ params: idParamSchema }), videoController.retry);
// Publication dans Explorer (par l'auteur).
videoRouter.post('/:id/publish', validate({ params: idParamSchema }), videoController.publish);
videoRouter.delete('/:id/publish', validate({ params: idParamSchema }), videoController.unpublish);
