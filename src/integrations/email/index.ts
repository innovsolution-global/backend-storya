import { env, isProduction } from '../../config/env';
import { logger } from '../../config/logger';
import { ConsoleEmailProvider } from './ConsoleEmailProvider';
import type { EmailProvider } from './EmailProvider';
import { SmtpEmailProvider } from './SmtpEmailProvider';

export type { EmailMessage, EmailProvider } from './EmailProvider';
export { ConsoleEmailProvider } from './ConsoleEmailProvider';

let provider: EmailProvider | undefined;

function createProvider(): EmailProvider {
  if (env.SMTP_HOST) {
    return new SmtpEmailProvider({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.EMAIL_FROM,
    });
  }
  if (isProduction) logger.warn('SMTP_HOST absent : les emails sont seulement journalisés.');
  return new ConsoleEmailProvider();
}

export function getEmailProvider(): EmailProvider {
  provider ??= createProvider();
  return provider;
}

/** Permet de remplacer le fournisseur (tests, changement de prestataire). */
export function setEmailProvider(next: EmailProvider): void {
  provider = next;
}
