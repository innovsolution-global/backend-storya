import { logger } from '../../config/logger';
import type { SmsMessage, SmsProvider } from './SmsProvider';

/** Provider par défaut : aucun envoi réel, le SMS est seulement journalisé. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';

  async send(message: SmsMessage): Promise<void> {
    logger.info({ to: message.to, body: message.body }, '📱 SMS (console)');
  }
}
