import type { Response } from 'express';

import { langOf, localize } from '../i18n';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { message?: string; statusCode?: number; meta?: PaginationMeta } = {},
): Response {
  return res.status(options.statusCode ?? 200).json({
    success: true,
    message: localize(options.message ?? 'OK', langOf(res)),
    data,
    ...(options.meta ? { meta: options.meta } : {}),
  });
}
