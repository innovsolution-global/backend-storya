import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { env, isProduction } from './config/env';
import { metaController } from './controllers/meta.controller';
import { openApiDocument } from './docs/openapi';
import { detectLanguage } from './i18n';
import { errorHandler, notFound } from './middlewares/errorHandler';
import { globalLimiter } from './middlewares/rateLimiters';
import { requestLogger } from './middlewares/requestLogger';
import { sanitizeInput } from './middlewares/sanitize';
import { cleanupTempUploads, UPLOAD_ROOT } from './middlewares/upload';
import { apiRouter } from './routes';
import { AppError } from './utils/AppError';

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Pas d'en-tête Origin : app mobile, curl, appels serveur à serveur.
    if (!origin) return callback(null, true);
    if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
    if (!isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      return callback(null, true);
    return callback(AppError.forbidden(`Origine non autorisée par CORS : ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Client-Type',
    'X-Request-Id',
    'Accept-Language',
  ],
  exposedHeaders: ['X-Request-Id', 'Location', 'RateLimit', 'RateLimit-Policy', 'Content-Language'],
  maxAge: 600,
};

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // Derrière un reverse proxy (Nginx, Render, Railway…), nécessaire pour req.ip et les cookies secure.
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestLogger);
  // Langue de la réponse (Accept-Language) : français par défaut, anglais sur demande.
  app.use(detectLanguage);
  app.use(
    helmet({
      // Médias lus par l'app et par d'éventuels clients web d'une autre origine.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitizeInput);
  app.use(cleanupTempUploads);

  app.get('/health', metaController.health);

  if (env.STORAGE_DRIVER === 'local') {
    // Les fichiers temporaires de multer ne sont jamais servis.
    app.use('/uploads/tmp', (_req, _res, next) => next(AppError.notFound()));
    app.use(
      '/uploads',
      express.static(UPLOAD_ROOT, {
        index: false,
        dotfiles: 'deny',
        maxAge: isProduction ? '7d' : 0,
      }),
    );
  }

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: 'Storya API' }),
  );
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiDocument);
  });

  app.use('/api/v1', globalLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
