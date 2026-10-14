import { logger } from '../../config/logger';
import type { PushMessage, PushProvider, PushResult } from './PushProvider';

/** Sans Firebase configuré : les notifications sont seulement journalisées (et gardées en mémoire pour les tests). */
export class ConsolePushProvider implements PushProvider {
  readonly name = 'console';
  readonly sent: { tokens: string[]; message: PushMessage }[] = [];

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    this.sent.push({ tokens, message });
    logger.info(
      { devices: tokens.length, title: message.title },
      'Notification (non envoyée : Firebase absent)',
    );
    return { sent: tokens.length, failed: 0, invalidTokens: [] };
  }
}
