import type { videos } from '../db/schema';

/** Une scène du script : un clip de quelques secondes. */
export interface IScene {
  order: number;
  durationSeconds: number;
  /** Partie de la voix off couvrant la scène. */
  narration: string;
  /** Description visuelle (anglais) envoyée au modèle vidéo. */
  visualPrompt: string;
  /** Image de l'utilisateur servant de point de départ, le cas échéant. */
  imageIndex?: number;
}

export interface VideoProgress {
  step: number;
  total: number;
  message?: string;
}

export interface VideoProviders {
  script?: string;
  video?: string;
  voice?: string;
  music?: string;
}

export type IVideo = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
