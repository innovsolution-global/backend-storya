/**
 * Développement sans PostgreSQL installé : `npm run dev:local`.
 *
 * Utilise un PostgreSQL embarqué (PGlite) dont les données sont conservées
 * dans `.pg-data/`, applique les migrations, crée l'admin s'il manque, puis lance l'API.
 * Ne pas utiliser en production.
 */
import fs from 'node:fs';
import path from 'node:path';

async function main(): Promise<void> {
  const dataDir = path.resolve(__dirname, '..', '.pg-data');
  fs.mkdirSync(dataDir, { recursive: true });
  // Doit être défini avant le chargement de src/config/env.ts.
  process.env.DATABASE_URL = `pglite:${dataDir}`;

  const { connectDatabase, disconnectDatabase } = await import('../src/config/database');
  const { seedDatabase } = await import('../src/scripts/seed');
  await connectDatabase();
  await seedDatabase();
  await disconnectDatabase();

  // Le serveur se connecte lui-même et gère l'arrêt (Ctrl+C).
  await import('../src/server');
}

main().catch((error: unknown) => {
  process.stderr.write(`Démarrage local impossible : ${String(error)}\n`);
  process.exit(1);
});
