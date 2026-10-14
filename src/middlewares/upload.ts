import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { Request, RequestHandler } from 'express';
import multer from 'multer';

import { env } from '../config/env';
import { VIDEO_IMAGES } from '../constants';
import { AppError } from '../utils/AppError';

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');
export const UPLOAD_TMP_DIR = path.join(UPLOAD_ROOT, 'tmp');
fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

export const MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/x-m4a'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
} as const;

export type MediaKind = keyof typeof MIME_TYPES;

const MB = 1024 * 1024;

/** Fichiers écrits sur disque (jamais en mémoire) avec un nom aléatoire. */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_TMP_DIR),
  filename: (_req, file, cb) => {
    const ext = path
      .extname(file.originalname)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 6);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

function filterFor(
  kindsByField: Readonly<Record<string, MediaKind>>,
): multer.Options['fileFilter'] {
  return (_req: Request, file, cb) => {
    const kind = kindsByField[file.fieldname];
    if (!kind) {
      cb(AppError.badRequest(`Champ de fichier inattendu : ${file.fieldname}.`));
      return;
    }
    if (!(MIME_TYPES[kind] as readonly string[]).includes(file.mimetype)) {
      cb(
        AppError.badRequest(
          `Type de fichier non autorisé pour « ${file.fieldname} » (${file.mimetype}).`,
        ),
      );
      return;
    }
    cb(null, true);
  };
}

/** Upload d'avatar : une image, `MAX_IMAGE_SIZE_MB` maximum. */
export const avatarUpload = multer({
  storage,
  limits: { fileSize: env.MAX_IMAGE_SIZE_MB * MB, files: 1 },
  fileFilter: filterFor({ avatar: 'image' }),
}).single('avatar');

/** Image d'une bannière promotionnelle (champ `image`). */
export const promotionImageUpload = multer({
  storage,
  limits: { fileSize: env.MAX_IMAGE_SIZE_MB * MB, files: 1 },
  fileFilter: filterFor({ image: 'image' }),
}).single('image');

/** Images de référence d'une vidéo : champ `images`, jusqu'à VIDEO_IMAGES.max fichiers. */
export const videoImagesUpload = multer({
  storage,
  limits: { fileSize: VIDEO_IMAGES.maxSizeMb * MB, files: VIDEO_IMAGES.max, fields: 20 },
  fileFilter: filterFor({ images: 'image' }),
}).array('images', VIDEO_IMAGES.max);

/** Fichiers reçus pour un champ donné (formes `single`, `array` ou `fields`). */
export function uploadedFiles(req: Request, field: string): Express.Multer.File[] {
  if (req.file?.fieldname === field) return [req.file];
  const files = req.files;
  if (Array.isArray(files)) return files.filter((file) => file.fieldname === field);
  if (files) return files[field] ?? [];
  return [];
}

/**
 * Supprime les fichiers temporaires une fois la réponse envoyée,
 * que l'upload final ait réussi ou échoué.
 */
export const cleanupTempUploads: RequestHandler = (req, res, next) => {
  res.on('close', () => {
    for (const file of allUploadedFiles(req)) {
      fs.promises.unlink(file.path).catch(() => undefined);
    }
  });
  next();
};

/** Tous les fichiers temporaires de la requête, pour le nettoyage. */
export function allUploadedFiles(req: Request): Express.Multer.File[] {
  const list: Express.Multer.File[] = [];
  if (req.file) list.push(req.file);
  if (Array.isArray(req.files)) list.push(...req.files);
  else if (req.files) for (const files of Object.values(req.files)) list.push(...files);
  return list;
}
