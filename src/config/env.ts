import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /** URL publique de l'API (liens d'upload local, webhooks de paiement). */
    APP_URL: z.string().url().default('http://localhost:4000'),
    /** URL ou deep link de l'app pour les emails (reset password, vérification). */
    CLIENT_APP_URL: z.string().min(1).default('storya://'),
    CORS_ORIGINS: csv,
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    /** postgres://user:motdepasse@hôte:5432/base, ou pglite:<dossier> (PostgreSQL embarqué, dev). */
    DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET doit faire au moins 32 caractères'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET doit faire au moins 32 caractères'),
    JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(30),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    COOKIE_DOMAIN: optionalString,

    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOCK_TIME_MINUTES: z.coerce.number().int().positive().default(15),

    STORAGE_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    CLOUDINARY_FOLDER: z.string().default('storya'),
    MAX_IMAGE_SIZE_MB: z.coerce.number().positive().default(5),
    MAX_MEDIA_SIZE_MB: z.coerce.number().positive().default(100),

    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: bool,
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    EMAIL_FROM: z.string().default('Storya <no-reply@storya.app>'),

    // Notifications push (Firebase Cloud Messaging) : chemin du fichier JSON du compte de
    // service, ou son contenu. Sans l'un ni l'autre, les notifications sont journalisées.
    FIREBASE_SERVICE_ACCOUNT_PATH: optionalString,
    FIREBASE_SERVICE_ACCOUNT_JSON: optionalString,

    OPENAI_API_KEY: optionalString,
    OPENAI_FALLBACK_API_KEY: optionalString,
    OPENAI_TEXT_MODEL: z.string().default('gpt-4o-mini'),
    SORA_MODEL: z.string().default('sora-2'),
    KIE_VEO_API_KEY: optionalString,
    ELEVENLABS_API_KEY: optionalString,
    /** Voix ElevenLabs par choix de l'utilisateur (voix « premade » multilingues par défaut). */
    ELEVENLABS_VOICE_ID: z.string().default('EXAVITQu4vr4xnSDxMaL'),
    ELEVENLABS_VOICE_MASCULINE: z.string().default('JBFqnCBsd6RMkjVDRZzb'),
    ELEVENLABS_VOICE_ENFANT: z.string().default('jBpfuIE2acCO8z3wKNLl'),
    /** Dossier des musiques libres de droit : douce.mp3, epique.mp3, joyeuse.mp3. */
    MUSIC_DIR: z.string().default('assets/music'),
    GENERATION_DAILY_LIMIT_FREE: z.coerce.number().int().min(0).default(3),
    GENERATION_DAILY_LIMIT_PREMIUM: z.coerce.number().int().min(0).default(20),
    /**
     * Mode démo de la génération (sans clé API, médias libres de droit) :
     * auto = actif hors production quand OPENAI_API_KEY est absente.
     */
    AI_DEMO_MODE: z.enum(['auto', 'on', 'off']).default('auto'),
    /** Binaire ffmpeg pour le montage ; par défaut celui fourni par le paquet ffmpeg-static. */
    FFMPEG_PATH: optionalString,

    PAYMENT_PROVIDER: z.enum(['cinetpay', 'mock']).default('mock'),
    CINETPAY_API_KEY: optionalString,
    CINETPAY_SITE_ID: optionalString,
    CINETPAY_SECRET_KEY: optionalString,
    PAYMENT_RETURN_URL: z.string().default('storya://payment/return'),

    SMS_PROVIDER: z.enum(['console']).default('console'),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 'cloudinary') {
      for (const key of [
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} est requis avec STORAGE_DRIVER=cloudinary`,
          });
        }
      }
    }
    if (env.PAYMENT_PROVIDER === 'cinetpay') {
      for (const key of ['CINETPAY_API_KEY', 'CINETPAY_SITE_ID'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} est requis avec PAYMENT_PROVIDER=cinetpay`,
          });
        }
      }
    }
    if (env.NODE_ENV === 'production') {
      if (env.CORS_ORIGINS.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'CORS_ORIGINS est requis en production',
        });
      }
      if (env.PAYMENT_PROVIDER === 'mock') {
        ctx.addIssue({
          code: 'custom',
          path: ['PAYMENT_PROVIDER'],
          message: 'Le provider de paiement mock est interdit en production',
        });
      }
      if (env.AI_DEMO_MODE === 'on') {
        ctx.addIssue({
          code: 'custom',
          path: ['AI_DEMO_MODE'],
          message: 'Le mode démo de la génération IA est interdit en production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
      .join('\n');
    process.stderr.write(`\n❌ Variables d'environnement invalides :\n${details}\n\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Génération IA simulée (aucun appel payant) : jamais en production. */
export const isAiDemoMode =
  !isProduction &&
  (env.AI_DEMO_MODE === 'on' || (env.AI_DEMO_MODE === 'auto' && !env.OPENAI_API_KEY));
