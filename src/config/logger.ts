import pino from 'pino';

import { env, isProduction, isTest } from './env';

/** pino-pretty est une dépendance de dev : absent d'une image Docker de production. */
function prettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/**
 * Logger structuré (JSON en production, lisible en développement).
 * Les champs sensibles sont masqués pour ne jamais finir dans les logs.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[masqué]',
  },
  ...(isProduction || isTest || !prettyAvailable()
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});
