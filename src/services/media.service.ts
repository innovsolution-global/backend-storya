import { logger } from '../config/logger';
import { getStorageProvider } from '../integrations/storage';
import type { MediaKind } from '../middlewares/upload';
import type { IMedia } from '../models/shared';
import { AppError } from '../utils/AppError';
import { hasValidSignature } from '../utils/fileSignature';

export const mediaService = {
  /** Valide le contenu réel du fichier temporaire puis l'envoie vers le stockage final. */
  async storeUpload(file: Express.Multer.File, kind: MediaKind, folder: string): Promise<IMedia> {
    if (!(await hasValidSignature(file.path, kind))) {
      throw AppError.badRequest(
        `Le fichier « ${file.originalname} » n'est pas un fichier ${kind} valide.`,
      );
    }
    return getStorageProvider().uploadFile(file.path, { kind, folder });
  },

  storeBuffer(buffer: Buffer, kind: MediaKind, folder: string, extension: string): Promise<IMedia> {
    return getStorageProvider().uploadBuffer(buffer, { kind, folder, extension });
  },

  storeFromUrl(url: string, kind: MediaKind, folder: string, extension: string): Promise<IMedia> {
    return getStorageProvider().uploadFromUrl(url, { kind, folder, extension });
  },

  /** Suppression « best effort » : un fichier orphelin ne doit pas faire échouer la requête. */
  async remove(media: IMedia | undefined | null): Promise<void> {
    if (!media || media.provider === 'external') return;
    try {
      await getStorageProvider().delete(media);
    } catch (error) {
      logger.warn({ err: error, publicId: media.publicId }, 'Suppression de média impossible');
    }
  },
};
