/** Notification envoyée sur les téléphones (Firebase Cloud Messaging). */
export interface PushMessage {
  title: string;
  body: string;
  /** Données lues par l'app au toucher de la notification (ex. { type: 'video', videoId }). */
  data?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Jetons refusés définitivement (app désinstallée…) : à supprimer. */
  invalidTokens: string[];
}

export interface PushProvider {
  readonly name: string;
  send(tokens: string[], message: PushMessage): Promise<PushResult>;
}
