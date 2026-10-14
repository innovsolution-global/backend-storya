import { env } from '../../config/env';
import { CloudinaryStorageProvider } from './CloudinaryStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import type { StorageProvider } from './StorageProvider';

export type { StorageProvider, StoreOptions } from './StorageProvider';

let provider: StorageProvider | undefined;

export function getStorageProvider(): StorageProvider {
  provider ??=
    env.STORAGE_DRIVER === 'cloudinary'
      ? new CloudinaryStorageProvider()
      : new LocalStorageProvider();
  return provider;
}

export function setStorageProvider(next: StorageProvider): void {
  provider = next;
}
