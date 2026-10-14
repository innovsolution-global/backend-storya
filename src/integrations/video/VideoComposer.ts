export type AmbientMood = 'douce' | 'epique' | 'joyeuse';

export interface FrameSize {
  width: number;
  height: number;
}

/**
 * Montage vidéo (implémenté avec ffmpeg). Toutes les sorties d'un même montage
 * partagent le même format (H.264, 30 i/s, yuv420p) pour pouvoir être concaténées.
 */
export interface VideoComposer {
  /** Adapte un clip au cadre et à la durée voulus (boucle s'il est trop court, sans son). */
  normalizeClip(input: string, output: string, frame: FrameSize, seconds: number): Promise<void>;
  /** Anime une image fixe (zoom / panoramique lent, fondus) pendant `seconds`. */
  imageClip(image: string, output: string, frame: FrameSize, seconds: number): Promise<void>;
  /** Recadre une image aux dimensions exactes (JPEG), ex. pour l'image de départ de Sora. */
  fitImage(image: string, output: string, frame: FrameSize): Promise<void>;
  /** Met bout à bout des clips normalisés. */
  concat(clips: string[], output: string): Promise<void>;
  /**
   * Pose la bande son (voix off et/ou musique en boucle, atténuée sous la voix),
   * coupée ou complétée par du silence à `seconds`.
   */
  mixAudio(
    video: string,
    tracks: { voice?: string; music?: string },
    output: string,
    seconds: number,
  ): Promise<void>;
  /** Nappe musicale synthétisée (secours quand aucune piste n'est fournie). */
  ambientMusic(mood: AmbientMood, output: string, seconds: number): Promise<void>;
  /** Image extraite de la vidéo pour la miniature (JPEG). */
  thumbnail(video: string, output: string): Promise<void>;
  /** Durée réelle d'un média, en secondes. */
  duration(file: string): Promise<number>;
}
