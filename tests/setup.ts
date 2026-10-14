import { afterAll, afterEach, beforeAll } from 'vitest';

// Variables définies AVANT le chargement de config/env.ts (importé par les tests).
// dotenv ne remplace pas les valeurs déjà présentes : le .env local n'interfère pas.
Object.assign(process.env, {
  NODE_ENV: 'test',
  // PostgreSQL embarqué en mémoire (PGlite), migré au démarrage.
  DATABASE_URL: 'pglite:memory',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef0123456789abcdef',
  BCRYPT_SALT_ROUNDS: '10',
  STORAGE_DRIVER: 'local',
  PAYMENT_PROVIDER: 'mock',
  OPENAI_API_KEY: 'sk-test',
  OPENAI_FALLBACK_API_KEY: '',
  KIE_VEO_API_KEY: '',
  ELEVENLABS_API_KEY: '',
  SMTP_HOST: '',
  CORS_ORIGINS: '',
  MAX_LOGIN_ATTEMPTS: '5',
  GENERATION_DAILY_LIMIT_FREE: '2',
});

beforeAll(async () => {
  const { connectDatabase } = await import('../src/config/database');
  await connectDatabase();
});

afterEach(async () => {
  const { db } = await import('../src/config/database');
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`truncate table refresh_tokens, payments, videos, users cascade`);
});

afterAll(async () => {
  const { disconnectDatabase } = await import('../src/config/database');
  await disconnectDatabase();
});
