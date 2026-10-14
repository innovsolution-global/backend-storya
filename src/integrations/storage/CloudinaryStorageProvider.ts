import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';

import { getCloudinary } from '../../config/cloudinary';
import { env } from '../../config/env';
import type { MediaKind } from '../../middlewares/upload';
import type { IMedia } from '../../models/shared';
import type { StorageProvider, StoreOptions } from './StorageProvider';

/** Cloudinary range l'audio dans la catégorie « video ». */
function resourceType(kind: MediaKind): 'image' | 'video' {
  return kind === 'image' ? 'image' : 'video';
}

export class CloudinaryStorageProvider implements StorageProvider {
  readonly name = 'cloudinary' as const;

  private options({ kind, folder }: StoreOptions): UploadApiOptions {
    return {
      folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
      resource_type: resourceType(kind),
      overwrite: false,
      unique_filename: true,
      ...(kind === 'image' ? { transformation: [{ quality: 'auto', fetch_format: 'auto' }] } : {}),
    };
  }

  private toMedia(result: UploadApiResponse): IMedia {
    return { url: result.secure_url, publicId: result.public_id, provider: this.name };
  }

  async uploadFile(localPath: string, options: StoreOptions): Promise<IMedia> {
    const result = await getCloudinary().uploader.upload(localPath, this.options(options));
    return this.toMedia(result);
  }

  uploadBuffer(buffer: Buffer, options: StoreOptions & { extension: string }): Promise<IMedia> {
    return new Promise((resolve, reject) => {
      const stream = getCloudinary().uploader.upload_stream(
        this.options(options),
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Upload Cloudinary sans résultat'));
            return;
          }
          resolve(this.toMedia(result));
        },
      );
      stream.end(buffer);
    });
  }

  async uploadFromUrl(url: string, options: StoreOptions & { extension: string }): Promise<IMedia> {
    // Cloudinary télécharge lui-même l'URL distante.
    const result = await getCloudinary().uploader.upload(url, this.options(options));
    return this.toMedia(result);
  }

  async delete(media: IMedia): Promise<void> {
    if (!media.publicId) return;
    const isImage =
      /\.(jpe?g|png|webp|gif|avif)$/i.test(media.url) || media.url.includes('/image/upload/');
    await getCloudinary().uploader.destroy(media.publicId, {
      resource_type: isImage ? 'image' : 'video',
    });
  }
}
