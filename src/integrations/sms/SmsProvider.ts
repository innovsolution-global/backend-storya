export interface SmsMessage {
  /** Numéro au format international E.164 (ex. +221770000000). */
  to: string;
  body: string;
}

/**
 * Contrat commun des prestataires SMS (Twilio, Orange SMS API, Africa's Talking…).
 * Pas encore utilisé par l'application : prêt pour l'OTP ou les notifications.
 */
export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<void>;
}
