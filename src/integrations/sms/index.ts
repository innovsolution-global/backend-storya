import { env } from '../../config/env';
import { ConsoleSmsProvider } from './ConsoleSmsProvider';
import type { SmsProvider } from './SmsProvider';

export type { SmsMessage, SmsProvider } from './SmsProvider';

let provider: SmsProvider | undefined;

/**
 * Pour brancher un vrai prestataire : créer `TwilioSmsProvider implements SmsProvider`,
 * ajouter sa valeur à SMS_PROVIDER dans config/env.ts, puis l'instancier ici.
 */
function createProvider(): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'console':
      return new ConsoleSmsProvider();
  }
}

export function getSmsProvider(): SmsProvider {
  provider ??= createProvider();
  return provider;
}

export function setSmsProvider(next: SmsProvider): void {
  provider = next;
}
