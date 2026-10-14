import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import axios from 'axios';

import { UPLOAD_ROOT } from '../../middlewares/upload';
import type { IMedia } from '../../models/shared';
import type { StorageProvider, StoreOptions } from './StorageProvider';

/**
 * Stockage sur le disque du serveur, servi en statique sous `/uploads`.
 * Pratique en développement ; en production multi-instances, préférer Cloudinary.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local' as const;

  private async target(
    folder: string,
    extension: string,
  ): Promise<{ absolute: string; relative: string }> {
    const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, '');
    const dir = path.join(UPLOAD_ROOT, safeFolder);
    await fs.mkdir(dir, { recursive: true });
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    return { absolute: path.join(dir, name), relative: `/uploads/${safeFolder}/${name}` };
  }

  async uploadFile(localPath: string, options: StoreOptions): Promise<IMedia> {
    const { absolute, relative } = await this.target(
      options.folder,
      path.extname(localPath) || '.bin',
    );
    await fs.copyFile(localPath, absolute);
    return { url: relative, publicId: relative, provider: this.name };
  }

  async uploadBuffer(
    buffer: Buffer,
    options: StoreOptions & { extension: string },
  ): Promise<IMedia> {
    const { absolute, relative } = await this.target(options.folder, options.extension);
    await fs.writeFile(absolute, buffer);
    return { url: relative, publicId: relative, provider: this.name };
  }

  async uploadFromUrl(url: string, options: StoreOptions & { extension: string }): Promise<IMedia> {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 120_000,
    });
    return this.uploadBuffer(Buffer.from(response.data), options);
  }

  async delete(media: IMedia): Promise<void> {
    if (!media.publicId?.startsWith('/uploads/')) return;
    const absolute = path.resolve(UPLOAD_ROOT, media.publicId.replace(/^\/uploads\//, ''));
    // Garde-fou contre la traversée de répertoire.
    if (!absolute.startsWith(UPLOAD_ROOT)) return;
    await fs.unlink(absolute).catch(() => undefined);
  }
}
