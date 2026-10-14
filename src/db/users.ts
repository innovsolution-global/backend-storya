import { eq } from 'drizzle-orm';

import { db } from '../config/database';
import type { IUser } from '../models/User';
import { users } from './schema';

export async function findUserById(id: string): Promise<IUser | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export async function findUserByEmail(email: string): Promise<IUser | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return user;
}

/** Enregistre les changements en base et les reporte sur l'objet en mémoire. */
export async function updateUser(user: IUser, changes: Partial<Omit<IUser, 'id'>>): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  const [saved] = await db.update(users).set(changes).where(eq(users.id, user.id)).returning();
  Object.assign(user, saved ?? changes);
}
