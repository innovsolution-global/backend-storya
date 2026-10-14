import type { refreshTokens } from '../db/schema';

export type IRefreshToken = typeof refreshTokens.$inferSelect;
