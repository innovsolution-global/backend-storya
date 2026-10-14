import path from 'node:path';

import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import * as schema from '../db/schema';
import { env, isProduction } from './env';
import { logger } from './logger';

export type Database = NodePgDatabase<typeof schema>;

/** Migrations SQL générées par drizzle-kit (`npm run db:generate`). */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, '..', '..', 'drizzle');

/** Préfixe de DATABASE_URL pour un PostgreSQL embarqué (PGlite) : `pglite:memory` ou `pglite:<dossier>`. */
const PGLITE_PREFIX = 'pglite:';

let current: Database | undefined;
let close: (() => Promise<void>) | undefined;

/** Client Drizzle partagé ; utilisable une fois `connectDatabase()` terminé. */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    if (!current) throw new Error('Base de données non connectée (connectDatabase).');
    const value: unknown = Reflect.get(current, property, current);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(current)
      : value;
  },
});

/** PostgreSQL embarqué (WebAssembly) : tests et `npm run dev:local`, jamais en production. */
async function connectEmbedded(location: string): Promise<void> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const { migrate: migratePglite } = await import('drizzle-orm/pglite/migrator');

  const client = new PGlite(location === 'memory' ? undefined : path.resolve(location));
  const database = drizzlePglite({ client, schema, casing: 'snake_case' });
  await migratePglite(database, { migrationsFolder: MIGRATIONS_FOLDER });
  current = database as unknown as Database;
  close = () => client.close();
  logger.info({ location }, 'PostgreSQL embarqué (PGlite) prêt');
}

/**
 * Connexion à PostgreSQL. Hors production, les migrations en attente sont
 * appliquées au démarrage ; en production elles passent par `npm run db:migrate`.
 */
export async function connectDatabase(
  url: string = env.DATABASE_URL,
  options: { migrate?: boolean } = {},
): Promise<void> {
  if (url.startsWith(PGLITE_PREFIX)) {
    await connectEmbedded(url.slice(PGLITE_PREFIX.length) || 'memory');
    return;
  }

  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10_000 });
  pool.on('error', (error) => logger.error({ err: error }, 'Erreur PostgreSQL'));
  await pool.query('select 1');

  const database = drizzle({ client: pool, schema, casing: 'snake_case' });
  if (options.migrate ?? !isProduction) {
    await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  current = database;
  close = () => pool.end();
  logger.info({ db: pool.options.database }, 'PostgreSQL connecté');
}

export async function disconnectDatabase(): Promise<void> {
  const closing = close;
  current = undefined;
  close = undefined;
  await closing?.();
}

/** Pour /health : la base répond-elle ? */
export async function isDatabaseUp(): Promise<boolean> {
  if (!current) return false;
  try {
    await current.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
