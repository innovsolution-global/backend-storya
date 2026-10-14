export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Contrat commun à tous les fournisseurs d'email (SMTP, SendGrid, Brevo…). */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}
