import type { Request } from 'express';

import { currentUser } from '../middlewares/auth';
import { uploadedFiles } from '../middlewares/upload';
import { adminService } from '../services/admin.service';
import { videoService } from '../services/video.service';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type {
  AdminListVideosQuery,
  CreateVideoInput,
  ExploreQuery,
  ListVideosQuery,
} from '../validators/video.validator';

const videoId = (req: Request): string => req.params.id ?? '';

export const videoController = {
  /** 202 : la vidéo est acceptée, l'app suit sa progression via GET /videos/:id. */
  create: asyncHandler(async (req, res) => {
    const video = await videoService.create(
      currentUser(req).id,
      req.body as CreateVideoInput,
      uploadedFiles(req, 'images'),
    );
    res.setHeader('Location', `/api/v1/videos/${video.id}`);
    sendSuccess(res, video, { message: 'Génération de la vidéo lancée.', statusCode: 202 });
  }),

  list: asyncHandler(async (req, res) => {
    const { items, meta } = await videoService.list(
      currentUser(req).id,
      req.query as unknown as ListVideosQuery,
    );
    sendSuccess(res, items, { meta });
  }),

  get: asyncHandler(async (req, res) => {
    sendSuccess(res, await videoService.get(currentUser(req).id, videoId(req)));
  }),

  rename: asyncHandler(async (req, res) => {
    const video = await videoService.rename(
      currentUser(req).id,
      videoId(req),
      (req.body as { title: string }).title,
    );
    sendSuccess(res, video, { message: 'Vidéo renommée.' });
  }),

  remove: asyncHandler(async (req, res) => {
    await videoService.remove(currentUser(req).id, videoId(req));
    sendSuccess(res, null, { message: 'Vidéo supprimée.' });
  }),

  explore: asyncHandler(async (req, res) => {
    const { items, meta } = await videoService.explore(
      currentUser(req).id,
      req.query as unknown as ExploreQuery,
    );
    sendSuccess(res, items, { meta });
  }),

  publish: asyncHandler(async (req, res) => {
    const video = await videoService.publish(currentUser(req).id, videoId(req));
    sendSuccess(res, video, { message: 'Vidéo publiée dans Explorer.' });
  }),

  unpublish: asyncHandler(async (req, res) => {
    const video = await videoService.unpublish(currentUser(req).id, videoId(req));
    sendSuccess(res, video, { message: 'Vidéo retirée d’Explorer.' });
  }),

  adminUnpublish: asyncHandler(async (req, res) => {
    await videoService.adminUnpublish(videoId(req));
    sendSuccess(res, null, { message: 'Vidéo retirée d’Explorer.' });
  }),

  retry: asyncHandler(async (req, res) => {
    const video = await videoService.retry(currentUser(req).id, videoId(req));
    sendSuccess(res, video, { message: 'Génération relancée.', statusCode: 202 });
  }),

  quota: asyncHandler(async (req, res) => {
    sendSuccess(res, await videoService.quota(currentUser(req).id));
  }),

  adminList: asyncHandler(async (req, res) => {
    const { items, meta } = await videoService.adminList(
      req.query as unknown as AdminListVideosQuery,
    );
    // Le back-office affiche l'auteur de chaque vidéo.
    sendSuccess(res, await adminService.withAuthors(items), { meta });
  }),

  adminRemove: asyncHandler(async (req, res) => {
    await videoService.adminRemove(videoId(req));
    sendSuccess(res, null, { message: 'Vidéo supprimée.' });
  }),
};
