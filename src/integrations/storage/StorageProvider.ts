import type { MediaKind } from '../../middlewares/upload';
import type { IMedia } from '../../models/shared';

export interface StoreOptions {
  kind: MediaKind;
  /** Sous-dossier logique : `avatars`, `stories/covers`, `generated/videos`… */
  folder: string;
}

/** Contrat commun des stockages de fichiers (disque local, Cloudinary, S3…). */
export interface StorageProvider {
  readonly name: IMedia['provider'];
  uploadFile(localPath: string, options: StoreOptions): Promise<IMedia>;
  uploadBuffer(buffer: Buffer, options: StoreOptions & { extension: string }): Promise<IMedia>;
  uploadFromUrl(url: string, options: StoreOptions & { extension: string }): Promise<IMedia>;
  delete(media: IMedia): Promise<void>;
}
