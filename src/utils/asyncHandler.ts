import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { withRequestLang } from '../i18n';

/**
 * Transmet les rejets de promesse au middleware d'erreurs (Express 4 ne le fait pas seul)
 * et exécute le contrôleur dans la langue de la requête.
 */
export function asyncHandler<Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    withRequestLang(res, () => handler(req as Req, res, next)).catch(next);
  };
}
