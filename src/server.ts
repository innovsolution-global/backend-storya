import type { Server } from 'node:http';

import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';
import { tokenService } from './services/token.service';
import { videoService } from './services/video.service';
import { generationQueue } from './utils/jobQueue';

const TOKEN_PURGE_INTERVAL_MS = 60 * 60 * 1000;

let server: Server | undefined;

function purgeExpiredTokens(): void {
  tokenService
    .purgeExpired()
    .then((count) => {
      if (count) logger.info({ count }, 'Refresh tokens expirés supprimés');
    })
    .catch((error: unknown) => logger.warn({ err: error }, 'Purge des refresh tokens échouée'));
}

async function start(): Promise<void> {
  await connectDatabase();
  await videoService.recoverInterruptedJobs();
  purgeExpiredTokens();
  setInterval(purgeExpiredTokens, TOKEN_PURGE_INTERVAL_MS).unref();

  const app = createApp();
  server = app.listen(env.PORT, () => {
    logger.info(`🚀 Storya API prête sur http://localhost:${env.PORT} (docs : /api/docs)`);
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Arrêt en cours…');
  const forceExit = setTimeout(() => {
    logger.error('Arrêt forcé après 30 s');
    process.exit(1);
  }, 30_000);
  forceExit.unref();

  try {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server?.close((error) => (error ? reject(error) : resolve())),
      );
    // Les jobs en cours sont laissés « running » : ils seront marqués interrompus au prochain démarrage.
    await Promise.race([
      generationQueue.drain(),
      new Promise((resolve) => setTimeout(resolve, 20_000)),
    ]);
    await disconnectDatabase();
    logger.info('Arrêt propre terminé');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "Erreur pendant l'arrêt");
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promesse rejetée non gérée');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Exception non capturée — arrêt');
  process.exit(1);
});

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Démarrage impossible');
  process.exit(1);
});
