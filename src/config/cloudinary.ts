import { v2 as cloudinary } from 'cloudinary';

import { env } from './env';

let configured = false;

/** Retourne le client Cloudinary configuré (uniquement si STORAGE_DRIVER=cloudinary). */
export function getCloudinary(): typeof cloudinary {
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}
