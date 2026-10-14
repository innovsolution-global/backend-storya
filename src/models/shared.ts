export const MEDIA_PROVIDERS = ['cloudinary', 'local', 'external'] as const;
export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];

/** Fichier stocké (image, audio, vidéo) : l'URL publique + de quoi le supprimer plus tard. */
export interface IMedia {
  url: string;
  publicId?: string;
  provider: MediaProvider;
}
