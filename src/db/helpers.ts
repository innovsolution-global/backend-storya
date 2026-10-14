import type { AnyColumn, SQL } from 'drizzle-orm';
import { ilike, or } from 'drizzle-orm';

/** Erreur renvoyée par PostgreSQL (pg ou PGlite), éventuellement enveloppée par Drizzle. */
interface PgError {
  code?: string;
  constraint?: string;
}

function findPgError(error: unknown): PgError | undefined {
  let current = error;
  for (let depth = 0; current && typeof current === 'object' && depth < 5; depth++) {
    const candidate = current as PgError & { cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate;
    }
    current = candidate.cause;
  }
  return undefined;
}

/** Code SQLSTATE (ex. 23505) d'une erreur PostgreSQL, sinon undefined. */
export function pgErrorCode(error: unknown): string | undefined {
  return findPgError(error)?.code;
}

/** Violation d'unicité : renvoie le nom de la contrainte en cause (ex. users_phone_unique). */
export function uniqueViolation(error: unknown): string | undefined {
  const pgError = findPgError(error);
  return pgError?.code === '23505' ? (pgError.constraint ?? '') : undefined;
}

/** Échappe une saisie utilisateur avant de l'utiliser dans un motif LIKE / ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** Recherche « contient », insensible à la casse, sur l'une des colonnes. */
export function searchAny(query: string, columns: AnyColumn[]): SQL | undefined {
  const pattern = `%${escapeLike(query)}%`;
  return or(...columns.map((column) => ilike(column, pattern)));
}
