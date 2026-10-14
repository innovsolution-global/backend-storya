import { env } from '../config/env';
import type { IUser } from '../models';
import { isPremium } from '../models';
import type { IMedia } from '../models/shared';
import type { IVideo } from '../models/Video';
import { VIDEO_MUSIC, VIDEO_STEPS, VIDEO_TYPES, VIDEO_VOICES } from '../constants';
import { localize } from '../i18n';

/** Les fichiers locaux sont stockés en chemin relatif et exposés en URL absolue. */
export function mediaUrl(media?: IMedia | null): string {
  if (!media?.url) return '';
  if (media.provider === 'local') return new URL(media.url, env.APP_URL).toString();
  return media.url;
}

export interface UserSettingsDto {
  language: IUser['settings']['language'];
  defaultFormat: IUser['settings']['defaultFormat'] | null;
  exportQuality: IUser['settings']['exportQuality'];
  downloadNetwork: IUser['settings']['downloadNetwork'];
  notifications: IUser['settings']['notifications'];
}

/** Valeurs par défaut pour les réglages incomplets (comptes anciens, ajouts de réglages). */
export function toUserSettingsDto(user: Pick<IUser, 'settings'>): UserSettingsDto {
  const settings = user.settings;
  return {
    language: settings?.language ?? 'system',
    defaultFormat: settings?.defaultFormat ?? null,
    exportQuality: settings?.exportQuality ?? '1080p',
    downloadNetwork: settings?.downloadNetwork ?? 'wifi',
    notifications: {
      videoReady: settings?.notifications?.videoReady ?? true,
      tips: settings?.notifications?.tips ?? true,
      offers: settings?.notifications?.offers ?? false,
    },
  };
}

export interface UserDto {
  id: string;
  firstName: string;
  email: string;
  phone: string | null;
  role: IUser['role'];
  preferences: IUser['preferences'];
  settings: UserSettingsDto;
  avatarUrl: string;
  isEmailVerified: boolean;
  subscription: { plan: IUser['subscriptionPlan']; expiresAt: Date | null; isActive: boolean };
  createdAt: Date;
}

export function toUserDto(user: IUser): UserDto {
  return {
    id: user.id,
    firstName: user.firstName,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    preferences: {
      genres: [...(user.preferences?.genres ?? [])],
      videoTypes: [...(user.preferences?.videoTypes ?? [])],
    },
    settings: toUserSettingsDto(user),
    avatarUrl: mediaUrl(user.avatar),
    isEmailVerified: user.isEmailVerified,
    // Administrateur : Premium d'office, sans date de fin.
    subscription:
      user.role === 'admin'
        ? { plan: 'premium', expiresAt: null, isActive: true }
        : {
            plan: user.subscriptionPlan,
            expiresAt: user.subscriptionExpiresAt ?? null,
            isActive: isPremium(user),
          },
    createdAt: user.createdAt,
  };
}

export interface VideoDto {
  id: string;
  type: IVideo['type'];
  typeLabel: string;
  title: string;
  description: string;
  prompt: string;
  style: string;
  durationSeconds: number;
  aspectRatio: IVideo['aspectRatio'];
  voice: IVideo['voice'];
  voiceLabel: string;
  music: IVideo['music'];
  musicLabel: string;
  brand: string | null;
  keyMessage: string | null;
  callToAction: string | null;
  audience: string | null;
  characters: string | null;
  imageUrls: string[];
  status: IVideo['status'];
  progress: {
    step: number;
    total: number;
    /** Avancement de 0 à 1. */
    ratio: number;
    label: string | null;
    message: string | null;
  };
  videoUrl: string;
  thumbnailUrl: string;
  outputDurationSeconds: number | null;
  error: string | null;
  warnings: string[];
  demo: boolean;
  createdAt: Date;
  finishedAt: Date | null;
  /** Date de publication dans Explorer (null : privée). */
  publishedAt: Date | null;
  /** Détail uniquement : script découpé en scènes et voix off. */
  scenes?: IVideo['scenes'];
  narration?: string;
}

/**
 * Vidéo renvoyée à l'app. Libellés, étape, message de progression, erreur et
 * avertissements sont traduits dans la langue de la requête ; les identifiants
 * et les valeurs saisies (style, public…) restent tels quels.
 */
export function toVideoDto(
  video: Omit<IVideo, 'scenes' | 'narration'> & Partial<Pick<IVideo, 'scenes' | 'narration'>>,
  options: { detail?: boolean } = {},
): VideoDto {
  const { step, total, message } = video.progress;
  const done = video.status === 'completed';
  return {
    id: video.id,
    type: video.type,
    typeLabel: localize(VIDEO_TYPES[video.type]),
    title: video.title,
    description: video.description ?? '',
    prompt: video.prompt,
    style: video.style,
    durationSeconds: video.durationSeconds,
    aspectRatio: video.aspectRatio,
    voice: video.voice,
    voiceLabel: localize(VIDEO_VOICES[video.voice]),
    music: video.music,
    musicLabel: localize(VIDEO_MUSIC[video.music]),
    brand: video.brand ?? null,
    keyMessage: video.keyMessage ?? null,
    callToAction: video.callToAction ?? null,
    audience: video.audience ?? null,
    characters: video.characters ?? null,
    imageUrls: video.images.map((image) => mediaUrl(image)),
    status: video.status,
    progress: {
      step: done ? total : step,
      total,
      ratio: done ? 1 : Math.min(0.99, Math.max(0, step - 1) / total),
      label: done ? null : localize(VIDEO_STEPS[Math.max(0, step - 1)] ?? '') || null,
      message: message ? localize(message) : null,
    },
    videoUrl: mediaUrl(video.output),
    thumbnailUrl: mediaUrl(video.thumbnail),
    outputDurationSeconds: video.outputDurationSeconds ?? null,
    error: video.error ? localize(video.error) : null,
    warnings: video.warnings.map((warning) => localize(warning)),
    demo: video.demo,
    createdAt: video.createdAt,
    finishedAt: video.finishedAt ?? null,
    publishedAt: video.publishedAt ?? null,
    ...(options.detail
      ? {
          scenes: (video.scenes ?? []).map((scene) => ({
            order: scene.order,
            durationSeconds: scene.durationSeconds,
            narration: scene.narration,
            visualPrompt: scene.visualPrompt,
            imageIndex: scene.imageIndex,
          })),
          narration: video.narration ?? '',
        }
      : {}),
  };
}
