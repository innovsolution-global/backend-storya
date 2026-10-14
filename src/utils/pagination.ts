import type { PaginationMeta } from './apiResponse';

export type SortOrder = 1 | -1;

export interface PaginationInput {
  page: number;
  limit: number;
}

export function paginationMeta({ page, limit }: PaginationInput, total: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasNextPage: page < totalPages };
}

export function skipFor({ page, limit }: PaginationInput): number {
  return (page - 1) * limit;
}

/**
 * Convertit `sort=-createdAt,title` en objet de tri (1 croissant, -1 décroissant),
 * en ne gardant que les champs autorisés.
 */
export function parseSort(
  sort: string | undefined,
  allowed: Readonly<Record<string, string>>,
  fallback: Record<string, SortOrder>,
): Record<string, SortOrder> {
  if (!sort) return fallback;
  const result: Record<string, SortOrder> = {};
  for (const token of sort.split(',')) {
    const trimmed = token.trim();
    const desc = trimmed.startsWith('-');
    const key = desc ? trimmed.slice(1) : trimmed;
    const field = allowed[key];
    if (field) result[field] = desc ? -1 : 1;
  }
  return Object.keys(result).length > 0 ? result : fallback;
}

/** Échappe une saisie utilisateur avant de l'utiliser dans une RegExp. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
