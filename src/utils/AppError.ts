export interface FieldError {
  field: string;
  message: string;
}

/**
 * Erreur métier « attendue » : son message peut être renvoyé tel quel au client.
 * Toute autre erreur est considérée comme un bug et masquée en production.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: FieldError[];
  public readonly code?: string;

  constructor(
    message: string,
    statusCode = 500,
    options: { errors?: FieldError[]; code?: string; isOperational?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = options.isOperational ?? true;
    this.errors = options.errors;
    this.code = options.code;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors?: FieldError[]): AppError {
    return new AppError(message, 400, { errors, code: 'BAD_REQUEST' });
  }

  static unauthorized(message = 'Authentification requise.'): AppError {
    return new AppError(message, 401, { code: 'UNAUTHORIZED' });
  }

  static forbidden(message = 'Accès refusé.'): AppError {
    return new AppError(message, 403, { code: 'FORBIDDEN' });
  }

  static notFound(message = 'Ressource introuvable.'): AppError {
    return new AppError(message, 404, { code: 'NOT_FOUND' });
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, { code: 'CONFLICT' });
  }

  static tooManyRequests(message: string): AppError {
    return new AppError(message, 429, { code: 'TOO_MANY_REQUESTS' });
  }

  static locked(message: string): AppError {
    return new AppError(message, 423, { code: 'ACCOUNT_LOCKED' });
  }

  static serviceUnavailable(message: string): AppError {
    return new AppError(message, 503, { code: 'SERVICE_UNAVAILABLE' });
  }
}
