/** Valeurs métier partagées avec l'app Flutter. */

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Types de vidéos que Storya sait générer (identifiants identiques à l'app Flutter). */
export const VIDEO_TYPES = {
  storytelling: 'Storytelling',
  cartoon: 'Cartoon',
  publicite: 'Publicité',
} as const;
export type VideoType = keyof typeof VIDEO_TYPES;
export const VIDEO_TYPE_IDS = Object.keys(VIDEO_TYPES) as [VideoType, ...VideoType[]];

/** Styles visuels (storytelling, cartoon) ou tons (publicité), par type. */
export const VIDEO_STYLES: Readonly<Record<VideoType, readonly string[]>> = {
  storytelling: ['Cinématique', 'Réaliste', 'Conte africain', 'Aquarelle', 'Noir & blanc'],
  cartoon: ['Animation 3D', 'Dessin animé 2D', 'Anime', 'Pâte à modeler', 'Livre illustré'],
  publicite: ['Dynamique', 'Premium', 'Humour', 'Émotion', 'Minimaliste'],
};

/** Consignes visuelles (anglais) transmises au modèle vidéo pour chaque style. */
export const STYLE_PROMPTS: Readonly<Record<string, string>> = {
  Cinématique:
    'cinematic film look, shallow depth of field, dramatic lighting, smooth camera moves',
  Réaliste: 'photorealistic, natural lighting, documentary camera',
  'Conte africain': 'warm West African storytelling atmosphere, rich earthy colors, firelight',
  Aquarelle: 'animated watercolor painting style, soft paper texture',
  'Noir & blanc': 'black and white film, high contrast, film grain',
  'Animation 3D': '3D animated cartoon, Pixar-like characters, vibrant colors',
  'Dessin animé 2D': '2D hand-drawn cartoon animation, bold outlines, flat colors',
  Anime: 'Japanese anime style animation, expressive characters, cel shading',
  'Pâte à modeler': 'claymation stop-motion style, handmade clay characters',
  'Livre illustré': "animated children's picture book illustration style",
  Dynamique: 'fast-paced commercial, quick cuts feel, energetic camera, bold colors',
  Premium: 'luxury commercial, elegant lighting, slow motion close-ups',
  Humour: 'playful funny commercial, bright colors, comedic timing',
  Émotion: 'emotional commercial, warm tones, heartfelt human moments',
  Minimaliste: 'minimalist commercial, clean background, simple elegant composition',
};

/** Voix off (identifiant API → libellé). */
export const VIDEO_VOICES = {
  feminine: 'Féminine',
  masculine: 'Masculine',
  enfant: 'Enfant',
  aucune: 'Sans voix',
} as const;
export type VideoVoice = keyof typeof VIDEO_VOICES;
export const VIDEO_VOICE_IDS = Object.keys(VIDEO_VOICES) as [VideoVoice, ...VideoVoice[]];

/** Musique de fond (identifiant API → libellé). */
export const VIDEO_MUSIC = {
  douce: 'Douce',
  epique: 'Épique',
  joyeuse: 'Joyeuse',
  aucune: 'Sans musique',
} as const;
export type VideoMusic = keyof typeof VIDEO_MUSIC;
export const VIDEO_MUSIC_IDS = Object.keys(VIDEO_MUSIC) as [VideoMusic, ...VideoMusic[]];

/** Public visé (publicité, cartoon). */
export const VIDEO_AUDIENCES = [
  'Jeunes',
  'Familles',
  'Professionnels',
  'Enfants',
  'Famille',
  'Tous publics',
] as const;
export const CALLS_TO_ACTION = [
  'Acheter maintenant',
  'En savoir plus',
  'Commander',
  'Nous contacter',
  'S’inscrire',
] as const;

/** Thèmes proposés pour le storytelling et les dessins animés (préférences du profil). */
export const STORY_CATEGORIES = [
  'Contes africains',
  'Inspiration',
  'Mystère',
  'Aventure',
  'Romance',
  'Science-fiction',
] as const;
export type StoryCategory = (typeof STORY_CATEGORIES)[number];

/** Durée d'une vidéo : 2 min 30 au maximum. */
export const VIDEO_DURATION = {
  minSeconds: 10,
  maxSeconds: 150,
  /** Durées proposées dans l'app (toute valeur entre min et max reste acceptée). */
  presets: [15, 30, 60, 90, 120, 150],
  defaults: { storytelling: 90, cartoon: 60, publicite: 30 },
} as const;

/**
 * Formats d'image. `source` : format demandé au modèle vidéo (Sora/Veo ne font
 * que du 9:16 ou du 16:9) avant recadrage au montage.
 */
export const ASPECT_RATIOS = {
  '9:16': {
    label: 'Vertical',
    usage: 'TikTok, Reels, Stories',
    width: 720,
    height: 1280,
    source: '9:16',
  },
  '16:9': { label: 'Horizontal', usage: 'YouTube, TV', width: 1280, height: 720, source: '16:9' },
  '1:1': {
    label: 'Carré',
    usage: 'Fil Instagram, Facebook',
    width: 960,
    height: 960,
    source: '9:16',
  },
} as const;
export type AspectRatio = keyof typeof ASPECT_RATIOS;
export const ASPECT_RATIO_IDS = Object.keys(ASPECT_RATIOS) as [AspectRatio, ...AspectRatio[]];

/** Réglages de l'app enregistrés sur le compte (Profil › Création). */
export const EXPORT_QUALITIES = ['720p', '1080p'] as const;
export type ExportQuality = (typeof EXPORT_QUALITIES)[number];
export const DOWNLOAD_NETWORKS = ['wifi', 'any'] as const;
export type DownloadNetwork = (typeof DOWNLOAD_NETWORKS)[number];

/** Images de référence fournies par l'utilisateur. */
export const VIDEO_IMAGES = { max: 5, maxSizeMb: 10 } as const;

/** Durée cible d'une scène (les modèles vidéo produisent des clips de 4 à 12 s). */
export const SCENE_SECONDS = 8;

export const VIDEO_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** Étapes annoncées pendant la génération. */
export const VIDEO_STEPS = [
  'Écriture du script',
  'Génération des scènes',
  'Voix off',
  'Montage final',
] as const;

export const SUBSCRIPTION_PLANS = ['free', 'premium'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export interface PremiumOffer {
  id: string;
  label: string;
  amount: number;
  currency: typeof PAYMENT_CURRENCY;
  durationDays: number;
}

/** Devise de facturation : franc guinéen (pris en charge par CinetPay). */
export const PAYMENT_CURRENCY = 'GNF' as const;

/** Offres Premium (montants en francs guinéens, multiples de 5 comme l'exige CinetPay). */
export const PREMIUM_OFFERS = {
  premium_monthly: {
    id: 'premium_monthly',
    label: 'Premium mensuel',
    amount: 30_000,
    currency: PAYMENT_CURRENCY,
    durationDays: 30,
  },
  premium_yearly: {
    id: 'premium_yearly',
    label: 'Premium annuel',
    amount: 300_000,
    currency: PAYMENT_CURRENCY,
    durationDays: 365,
  },
} as const satisfies Record<string, PremiumOffer>;
export type PremiumOfferId = keyof typeof PREMIUM_OFFERS;

export const PAYMENT_STATUSES = ['pending', 'accepted', 'refused', 'cancelled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAGINATION = { defaultLimit: 20, maxLimit: 100 } as const;

export const REFRESH_COOKIE_NAME = 'storya_rt';
