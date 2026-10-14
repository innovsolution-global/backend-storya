import { env } from '../config/env';
import {
  ASPECT_RATIO_IDS,
  DOWNLOAD_NETWORKS,
  EXPORT_QUALITIES,
  PREMIUM_OFFERS,
  STORY_CATEGORIES,
  VIDEO_DURATION,
  VIDEO_IMAGES,
  VIDEO_MUSIC_IDS,
  VIDEO_STYLES,
  VIDEO_TYPE_IDS,
  VIDEO_VOICE_IDS,
} from '../constants';
import { LANGUAGE_SETTINGS } from '../i18n';

/**
 * Spécification OpenAPI 3.0 de l'API Storya, servie sur /api/docs (Swagger UI)
 * et /api/docs.json (import Postman / Insomnia).
 */

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const bearer = [{ bearerAuth: [] }];

const success = (data: Schema, description = 'Succès', paginated = false) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data,
          ...(paginated ? { meta: ref('PaginationMeta') } : {}),
        },
      },
    },
  },
});

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('Error') } },
});

const jsonBody = (schema: Schema, required = true) => ({
  required,
  content: { 'application/json': { schema } },
});

const idParam = (name = 'id') => ({ name, in: 'path', required: true, schema: { type: 'string' } });
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
];

/** Demande de génération (multipart avec images, ou JSON). */
const videoRequestSchema = (withImages: boolean): Schema => ({
  type: 'object',
  required: ['type', 'prompt'],
  properties: {
    type: { type: 'string', enum: VIDEO_TYPE_IDS, example: 'storytelling' },
    prompt: {
      type: 'string',
      example: 'Un vieux griot raconte aux enfants la légende du fleuve qui chante.',
    },
    title: { type: 'string', description: 'Sinon déduit de la marque ou de l’idée' },
    style: {
      type: 'string',
      description: `Selon le type — ${Object.entries(VIDEO_STYLES)
        .map(([type, styles]) => `${type} : ${styles.join(', ')}`)
        .join(' ; ')}`,
      example: 'Conte africain',
    },
    durationSeconds: {
      type: 'integer',
      minimum: VIDEO_DURATION.minSeconds,
      maximum: VIDEO_DURATION.maxSeconds,
      description: '150 s (2 min 30) maximum',
      example: 90,
    },
    aspectRatio: { type: 'string', enum: ASPECT_RATIO_IDS, example: '9:16' },
    voice: { type: 'string', enum: VIDEO_VOICE_IDS, default: 'feminine' },
    music: { type: 'string', enum: VIDEO_MUSIC_IDS, default: 'douce' },
    brand: { type: 'string', description: 'Publicité : obligatoire' },
    keyMessage: { type: 'string', description: 'Publicité' },
    callToAction: { type: 'string', description: 'Publicité', example: 'Commander' },
    audience: { type: 'string', description: 'Publicité et cartoon', example: 'Tous publics' },
    characters: { type: 'string', description: 'Cartoon', example: 'Baobab, Tortue' },
    ...(withImages
      ? {
          images: {
            type: 'array',
            maxItems: VIDEO_IMAGES.max,
            items: { type: 'string', format: 'binary' },
            description: 'JPEG, PNG ou WebP',
          },
        }
      : {}),
  },
});

const common = {
  400: error('Données invalides'),
  401: error('Non authentifié ou jeton expiré (code TOKEN_EXPIRED → appeler /auth/refresh-token)'),
};

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Storya API',
    version: '1.0.0',
    description:
      "API REST de Storya, l'application de génération de vidéos par IA (storytelling, cartoon, publicité — 2 min 30 maximum). " +
      'Toutes les réponses suivent le format `{ success, message, data, meta? }` ' +
      'et les erreurs `{ success: false, message, code?, errors? }`.\n\n' +
      "**Client mobile** : envoyer l'en-tête `X-Client-Type: mobile` sur login/register/refresh pour recevoir " +
      'le refresh token dans le corps (en plus du cookie httpOnly).\n\n' +
      "**Langue** : l'en-tête `Accept-Language` (`fr` par défaut, `en`) choisit la langue des messages, " +
      'erreurs de validation, libellés et étapes de génération (en-tête de réponse `Content-Language`). ' +
      'Les emails suivent le réglage `settings.language` du compte, ou la langue de la requête.',
  },
  servers: [{ url: `${env.APP_URL}/api/v1` }],
  tags: [
    { name: 'Auth' },
    { name: 'Utilisateur' },
    { name: 'Vidéos' },
    { name: 'Paiements' },
    { name: 'Admin' },
    { name: 'Référentiel' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          code: { type: 'string' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: { field: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
          hasNextPage: { type: 'boolean' },
        },
      },
      Settings: {
        type: 'object',
        description: "Réglages de l'app, partagés entre les appareils de l'utilisateur.",
        properties: {
          language: {
            type: 'string',
            enum: LANGUAGE_SETTINGS,
            description: '`system` : langue du téléphone (Accept-Language)',
          },
          defaultFormat: {
            type: 'string',
            enum: ASPECT_RATIO_IDS,
            nullable: true,
            description: 'null : format conseillé pour chaque type de vidéo',
          },
          exportQuality: { type: 'string', enum: EXPORT_QUALITIES },
          downloadNetwork: { type: 'string', enum: DOWNLOAD_NETWORKS },
          notifications: {
            type: 'object',
            properties: {
              videoReady: {
                type: 'boolean',
                description: 'Email « Votre vidéo est prête » à la fin de chaque génération',
              },
              tips: { type: 'boolean' },
              offers: { type: 'boolean' },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          firstName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', nullable: true, example: '+224622123456' },
          role: { type: 'string', enum: ['user', 'admin'] },
          preferences: {
            type: 'object',
            properties: {
              genres: { type: 'array', items: { type: 'string', enum: STORY_CATEGORIES } },
              videoTypes: { type: 'array', items: { type: 'string', enum: VIDEO_TYPE_IDS } },
            },
          },
          settings: ref('Settings'),
          avatarUrl: { type: 'string' },
          isEmailVerified: { type: 'boolean' },
          subscription: {
            type: 'object',
            properties: {
              plan: { type: 'string', enum: ['free', 'premium'] },
              expiresAt: { type: 'string', format: 'date-time', nullable: true },
              isActive: { type: 'boolean' },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Session: {
        type: 'object',
        properties: {
          user: ref('User'),
          accessToken: { type: 'string' },
          refreshToken: { type: 'string', description: 'Uniquement avec X-Client-Type: mobile' },
          refreshTokenExpiresAt: { type: 'string', format: 'date-time' },
        },
      },
      Video: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: VIDEO_TYPE_IDS },
          typeLabel: { type: 'string', example: 'Storytelling' },
          title: { type: 'string' },
          description: { type: 'string' },
          prompt: { type: 'string' },
          style: { type: 'string', example: 'Cinématique' },
          durationSeconds: { type: 'integer', maximum: VIDEO_DURATION.maxSeconds },
          aspectRatio: { type: 'string', enum: ASPECT_RATIO_IDS },
          voice: { type: 'string', enum: VIDEO_VOICE_IDS },
          voiceLabel: { type: 'string' },
          music: { type: 'string', enum: VIDEO_MUSIC_IDS },
          musicLabel: { type: 'string' },
          brand: { type: 'string', nullable: true },
          keyMessage: { type: 'string', nullable: true },
          callToAction: { type: 'string', nullable: true },
          audience: { type: 'string', nullable: true },
          characters: { type: 'string', nullable: true },
          imageUrls: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['queued', 'processing', 'completed', 'failed'] },
          progress: {
            type: 'object',
            properties: {
              step: {
                type: 'integer',
                description: '1 script, 2 scènes, 3 voix off et musique, 4 montage',
              },
              total: { type: 'integer', example: 4 },
              ratio: { type: 'number', description: 'Avancement de 0 à 1' },
              label: { type: 'string', nullable: true },
              message: { type: 'string', nullable: true, example: 'Scène 3 sur 8 prête' },
            },
          },
          videoUrl: {
            type: 'string',
            description: 'MP4 final (vide tant que la vidéo n’est pas prête)',
          },
          thumbnailUrl: { type: 'string' },
          outputDurationSeconds: { type: 'number', nullable: true },
          error: { type: 'string', nullable: true },
          warnings: { type: 'array', items: { type: 'string' } },
          demo: { type: 'boolean', description: 'Générée en mode démo (sans IA)' },
          createdAt: { type: 'string', format: 'date-time' },
          finishedAt: { type: 'string', format: 'date-time', nullable: true },
          scenes: {
            type: 'array',
            description: 'Détail uniquement',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer' },
                durationSeconds: { type: 'integer' },
                narration: { type: 'string' },
                visualPrompt: { type: 'string' },
                imageIndex: { type: 'integer', nullable: true },
              },
            },
          },
          narration: { type: 'string', description: 'Détail uniquement : voix off complète' },
        },
      },
      Payment: {
        type: 'object',
        properties: {
          transactionId: { type: 'string' },
          offer: { type: 'string', enum: Object.keys(PREMIUM_OFFERS) },
          amount: { type: 'integer' },
          currency: { type: 'string', example: 'GNF' },
          status: { type: 'string', enum: ['pending', 'accepted', 'refused', 'cancelled'] },
          provider: { type: 'string' },
          paymentUrl: {
            type: 'string',
            nullable: true,
            description: 'Page de paiement CinetPay à ouvrir',
          },
          paymentMethod: { type: 'string', nullable: true },
          paidAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Créer un compte',
        requestBody: jsonBody({
          type: 'object',
          required: ['firstName', 'email', 'phone', 'password'],
          properties: {
            firstName: { type: 'string', example: 'Awa' },
            email: { type: 'string', example: 'awa@example.com' },
            phone: {
              type: 'string',
              description: '8 à 15 chiffres, « + » facultatif ; espaces, points et tirets ignorés',
              example: '+224 622 12 34 56',
            },
            password: {
              type: 'string',
              minLength: 8,
              description: 'Au moins une lettre et un chiffre',
              example: 'Storya2026',
            },
            genres: {
              type: 'array',
              items: { type: 'string', enum: STORY_CATEGORIES },
              description: 'Thèmes favoris',
            },
            videoTypes: {
              type: 'array',
              items: { type: 'string', enum: VIDEO_TYPE_IDS },
              description: 'Types de vidéos à créer',
            },
          },
        }),
        responses: {
          201: success(ref('Session'), 'Compte créé'),
          400: common[400],
          409: error('Email déjà utilisé'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Se connecter',
        requestBody: jsonBody({
          type: 'object',
          required: ['email', 'password'],
          properties: { email: { type: 'string' }, password: { type: 'string' } },
        }),
        responses: {
          200: success(ref('Session')),
          401: error('Identifiants incorrects'),
          423: error('Compte temporairement verrouillé'),
          429: error('Trop de tentatives'),
        },
      },
    },
    '/auth/refresh-token': {
      post: {
        tags: ['Auth'],
        summary: 'Renouveler la session (rotation du refresh token)',
        description: 'Refresh token lu dans le cookie httpOnly, ou dans le corps pour le mobile.',
        requestBody: jsonBody(
          { type: 'object', properties: { refreshToken: { type: 'string' } } },
          false,
        ),
        responses: { 200: success(ref('Session')), 401: common[401] },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Se déconnecter (révoque le refresh token)',
        requestBody: jsonBody(
          { type: 'object', properties: { refreshToken: { type: 'string' } } },
          false,
        ),
        responses: { 200: success({ nullable: true }) },
      },
    },
    '/auth/logout-all': {
      post: {
        tags: ['Auth'],
        summary: 'Fermer toutes les sessions',
        security: bearer,
        responses: { 200: success({ nullable: true }), 401: common[401] },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Utilisateur connecté',
        security: bearer,
        responses: { 200: success(ref('User')), 401: common[401] },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Recevoir un code de réinitialisation à 6 chiffres (valable 15 min)',
        requestBody: jsonBody({
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string' } },
        }),
        responses: {
          200: success({ nullable: true }, 'Toujours 200 (pas de divulgation des comptes)'),
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Réinitialiser le mot de passe avec le code reçu par email',
        description: 'Le code est annulé après 5 essais erronés. Toutes les sessions sont fermées.',
        requestBody: jsonBody({
          type: 'object',
          required: ['email', 'code', 'password'],
          properties: {
            email: { type: 'string', example: 'awa@example.com' },
            code: { type: 'string', pattern: '^\\d{6}$', example: '482913' },
            password: { type: 'string', example: 'NouveauMdp2026' },
          },
        }),
        responses: {
          200: success({ nullable: true }),
          400: error('Code incorrect, expiré ou trop d’essais'),
        },
      },
    },
    '/auth/verify-email': {
      post: {
        tags: ['Auth'],
        summary: "Confirmer l'adresse email",
        requestBody: jsonBody({
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        }),
        responses: { 200: success({ nullable: true }), 400: error('Lien invalide ou expiré') },
      },
    },
    '/auth/resend-verification': {
      post: {
        tags: ['Auth'],
        summary: "Renvoyer l'email de confirmation",
        security: bearer,
        responses: { 200: success({ nullable: true }) },
      },
    },
    '/users/me': {
      get: {
        tags: ['Utilisateur'],
        summary: 'Mon profil',
        security: bearer,
        responses: { 200: success(ref('User')) },
      },
      patch: {
        tags: ['Utilisateur'],
        summary: 'Modifier mon prénom et/ou mon numéro de téléphone',
        security: bearer,
        requestBody: jsonBody({
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            phone: { type: 'string', example: '+224622123456' },
          },
        }),
        responses: {
          200: success(ref('User')),
          400: common[400],
          409: error('Numéro déjà utilisé par un autre compte'),
        },
      },
      delete: {
        tags: ['Utilisateur'],
        summary: 'Supprimer définitivement mon compte',
        security: bearer,
        requestBody: jsonBody({
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string' } },
        }),
        responses: { 200: success({ nullable: true }), 400: common[400] },
      },
    },
    '/users/me/preferences': {
      patch: {
        tags: ['Utilisateur'],
        summary: 'Thèmes et types de vidéos préférés',
        security: bearer,
        requestBody: jsonBody({
          type: 'object',
          properties: {
            genres: { type: 'array', items: { type: 'string', enum: STORY_CATEGORIES } },
            videoTypes: { type: 'array', items: { type: 'string', enum: VIDEO_TYPE_IDS } },
          },
        }),
        responses: { 200: success(ref('User')) },
      },
    },
    '/users/me/settings': {
      get: {
        tags: ['Utilisateur'],
        summary: "Réglages de l'app (langue, format, qualité, téléchargements, notifications)",
        security: bearer,
        responses: { 200: success(ref('Settings')) },
      },
      patch: {
        tags: ['Utilisateur'],
        summary: 'Modifier les réglages (seuls les champs envoyés changent)',
        security: bearer,
        requestBody: jsonBody({
          ...ref('Settings'),
          example: { language: 'en', notifications: { videoReady: false } },
        }),
        responses: { 200: success(ref('Settings')), 400: common[400] },
      },
    },
    '/users/me/password': {
      patch: {
        tags: ['Utilisateur'],
        summary: 'Changer de mot de passe (ferme les autres sessions)',
        security: bearer,
        requestBody: jsonBody({
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } },
        }),
        responses: { 200: success(ref('Session')), 400: common[400] },
      },
    },
    '/users/me/avatar': {
      put: {
        tags: ['Utilisateur'],
        summary: 'Photo de profil (JPEG, PNG, WebP)',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { avatar: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { 200: success(ref('User')), 400: common[400] },
      },
      delete: {
        tags: ['Utilisateur'],
        summary: 'Supprimer la photo de profil',
        security: bearer,
        responses: { 200: success(ref('User')) },
      },
    },
    '/videos': {
      post: {
        tags: ['Vidéos'],
        summary: 'Générer une vidéo (storytelling, cartoon ou publicité — 2 min 30 max)',
        description:
          'Répond 202 : la génération tourne en arrière-plan (script → scènes → voix off et musique → montage). ' +
          'Suivre ensuite GET /videos/{id} toutes les 5 à 10 s. Envoyer en multipart/form-data pour joindre ' +
          `jusqu'à ${VIDEO_IMAGES.max} images (champ « images », ${VIDEO_IMAGES.maxSizeMb} Mo max chacune) ` +
          "que l'IA utilise comme point de départ des scènes ; sinon en JSON.",
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': { schema: videoRequestSchema(true) },
            'application/json': { schema: videoRequestSchema(false) },
          },
        },
        responses: {
          202: success(ref('Video'), 'Génération lancée'),
          400: common[400],
          409: error('Une vidéo est déjà en cours de génération'),
          429: error('Quota journalier atteint'),
          503: error('Génération indisponible (aucune clé IA et mode démo désactivé)'),
        },
      },
      get: {
        tags: ['Vidéos'],
        summary: 'Mes vidéos',
        security: bearer,
        parameters: [
          ...pageParams,
          { name: 'type', in: 'query', schema: { type: 'string', enum: VIDEO_TYPE_IDS } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['queued', 'processing', 'completed', 'failed'] },
          },
        ],
        responses: { 200: success({ type: 'array', items: ref('Video') }, 'Succès', true) },
      },
    },
    '/videos/quota': {
      get: {
        tags: ['Vidéos'],
        summary: 'Quota de vidéos du jour (selon l’abonnement)',
        security: bearer,
        responses: {
          200: success({
            type: 'object',
            properties: {
              limit: { type: 'integer' },
              used: { type: 'integer' },
              remaining: { type: 'integer' },
            },
          }),
        },
      },
    },
    '/videos/{id}': {
      get: {
        tags: ['Vidéos'],
        summary: 'Progression ou résultat d’une vidéo (scènes et voix off incluses)',
        security: bearer,
        parameters: [idParam()],
        responses: { 200: success(ref('Video')), 404: error('Introuvable') },
      },
      patch: {
        tags: ['Vidéos'],
        summary: 'Renommer une vidéo',
        security: bearer,
        parameters: [idParam()],
        requestBody: jsonBody({
          type: 'object',
          required: ['title'],
          properties: { title: { type: 'string' } },
        }),
        responses: { 200: success(ref('Video')), 404: error('Introuvable') },
      },
      delete: {
        tags: ['Vidéos'],
        summary: 'Supprimer une vidéo (et ses fichiers)',
        security: bearer,
        parameters: [idParam()],
        responses: {
          200: success({ nullable: true }),
          404: error('Introuvable'),
          409: error('Génération en cours'),
        },
      },
    },
    '/videos/{id}/retry': {
      post: {
        tags: ['Vidéos'],
        summary: 'Relancer une génération échouée',
        security: bearer,
        parameters: [idParam()],
        responses: {
          202: success(ref('Video'), 'Génération relancée'),
          400: error('La vidéo n’a pas échoué'),
          409: error('Une autre vidéo est en cours'),
        },
      },
    },
    '/payments/offers': {
      get: {
        tags: ['Paiements'],
        summary: 'Offres Premium',
        responses: { 200: success({ type: 'array', items: { type: 'object' } }) },
      },
    },
    '/payments/checkout': {
      post: {
        tags: ['Paiements'],
        summary: 'Initier un paiement Mobile Money (CinetPay)',
        description:
          "Ouvrir `paymentUrl` dans l'app ; au retour, appeler GET /payments/{transactionId}.",
        security: bearer,
        requestBody: jsonBody({
          type: 'object',
          required: ['offer'],
          properties: { offer: { type: 'string', enum: Object.keys(PREMIUM_OFFERS) } },
        }),
        responses: { 201: success(ref('Payment')), 503: error('Prestataire indisponible') },
      },
    },
    '/payments': {
      get: {
        tags: ['Paiements'],
        summary: 'Historique de mes paiements',
        security: bearer,
        parameters: pageParams,
        responses: { 200: success({ type: 'array', items: ref('Payment') }, 'Succès', true) },
      },
    },
    '/payments/{transactionId}': {
      get: {
        tags: ['Paiements'],
        summary: 'Statut (vérifié auprès de CinetPay)',
        security: bearer,
        parameters: [idParam('transactionId')],
        responses: { 200: success(ref('Payment')), 404: error('Introuvable') },
      },
    },
    '/payments/cinetpay/notify': {
      post: {
        tags: ['Paiements'],
        summary: 'Webhook CinetPay (usage interne)',
        requestBody: {
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                properties: { cpm_trans_id: { type: 'string' }, cpm_site_id: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Toujours OK' } },
      },
    },
    '/admin/videos': {
      get: {
        tags: ['Admin'],
        summary: 'Toutes les vidéos générées (modération)',
        security: bearer,
        parameters: [
          ...pageParams,
          { name: 'type', in: 'query', schema: { type: 'string', enum: VIDEO_TYPE_IDS } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          {
            name: 'user',
            in: 'query',
            schema: { type: 'string' },
            description: 'Identifiant utilisateur',
          },
        ],
        responses: { 200: success({ type: 'array', items: ref('Video') }, 'Succès', true) },
      },
    },
    '/admin/videos/{id}': {
      delete: {
        tags: ['Admin'],
        summary: 'Supprimer une vidéo',
        security: bearer,
        parameters: [idParam()],
        responses: { 200: success({ nullable: true }), 404: error('Introuvable') },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'Lister les utilisateurs',
        security: bearer,
        parameters: [
          ...pageParams,
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['user', 'admin'] } },
          { name: 'plan', in: 'query', schema: { type: 'string', enum: ['free', 'premium'] } },
        ],
        responses: { 200: success({ type: 'array', items: ref('User') }, 'Succès', true) },
      },
    },
    '/admin/users/{id}/role': {
      patch: {
        tags: ['Admin'],
        summary: "Changer le rôle d'un utilisateur",
        security: bearer,
        parameters: [idParam()],
        requestBody: jsonBody({
          type: 'object',
          properties: { role: { type: 'string', enum: ['user', 'admin'] } },
        }),
        responses: { 200: success(ref('User')) },
      },
    },
    '/config': {
      get: {
        tags: ['Référentiel'],
        summary:
          'Référentiel de création : types et styles, durées, formats, voix, musiques, limites, offres et fonctionnalités actives',
        responses: { 200: success({ type: 'object' }) },
      },
    },
  },
} as const;
