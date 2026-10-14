/**
 * Applique les migrations SQL en attente (dossier drizzle/).
 * En production (migrations non appliquées au démarrage), à lancer à chaque déploiement :
 *   npm run build && npm run db:migrate
 */
import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';

async function run(): Promise<void> {
  await connectDatabase(undefined, { migrate: true });
  logger.info('Migrations appliquées');
  await disconnectDatabase();
}

run().catch(async (error: unknown) => {
  logger.fatal({ err: error }, 'Migration échouée');
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
