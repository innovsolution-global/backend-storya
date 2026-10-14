/**
 * Prépare la base : crée (ou promeut) le compte administrateur SEED_ADMIN_*.
 *
 *   npm run seed
 */
import { connectDatabase, db, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { users } from '../db/schema';
import { findUserByEmail, updateUser } from '../db/users';
import { hashPassword } from '../models';

/** Prépare la base déjà connectée (réutilisé par scripts/dev-local.ts). */
export async function seedDatabase(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    logger.info('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD absents : aucun admin créé');
    return;
  }

  const admin = await findUserByEmail(adminEmail);
  if (admin) {
    if (admin.role !== 'admin') await updateUser(admin, { role: 'admin' });
    logger.info({ email: adminEmail }, 'Compte admin déjà présent');
    return;
  }
  await db.insert(users).values({
    firstName: 'Admin',
    email: adminEmail,
    password: await hashPassword(adminPassword),
    role: 'admin',
    isEmailVerified: true,
  });
  logger.info({ email: adminEmail }, 'Compte admin créé');
}

async function main(): Promise<void> {
  await connectDatabase();
  await seedDatabase();
  await disconnectDatabase();
}

if (require.main === module) {
  main().catch(async (error: unknown) => {
    logger.fatal({ err: error }, 'Seed échoué');
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
}
