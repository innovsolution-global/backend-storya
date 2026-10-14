import { logger } from '../../config/logger';
import type { EmailMessage, EmailProvider } from './EmailProvider';

/** Développement : les emails sont écrits dans les logs au lieu d'être envoyés. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  /** Derniers messages « envoyés », utiles pour les tests. */
  readonly outbox: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
    if (this.outbox.length > 50) this.outbox.shift();
    logger.info(
      { to: message.to, subject: message.subject, text: message.text },
      '📧 Email (console)',
    );
  }
}
