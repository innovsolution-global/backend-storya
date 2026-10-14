import type { Role } from '../constants';

export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      /** Défini par le middleware `authenticate` (ou `optionalAuth`). */
      user?: AuthUser;
    }
  }
}

export {};
