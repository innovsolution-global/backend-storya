import { isDatabaseUp } from '../config/database';
import { isAiDemoMode } from '../config/env';
import {
  ASPECT_RATIOS,
  CALLS_TO_ACTION,
  PREMIUM_OFFERS,
  STORY_CATEGORIES,
  VIDEO_AUDIENCES,
  VIDEO_DURATION,
  VIDEO_IMAGES,
  VIDEO_MUSIC,
  VIDEO_STEPS,
  VIDEO_STYLES,
  VIDEO_TYPE_IDS,
  VIDEO_TYPES,
  VIDEO_VOICES,
} from '../constants';
import { getAiClients } from '../integrations/ai';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';

const toOptions = (map: Readonly<Record<string, string>>) =>
  Object.entries(map).map(([id, label]) => ({ id, label }));

export const metaController = {
  /** Référentiel de l'écran de création : évite de dupliquer les listes en dur dans l'app. */
  config: asyncHandler(async (_req, res) => {
    const { openai, veo, elevenlabs } = getAiClients();
    sendSuccess(res, {
      videoTypes: VIDEO_TYPE_IDS.map((id) => ({
        id,
        label: VIDEO_TYPES[id],
        styles: VIDEO_STYLES[id],
        defaultDurationSeconds: VIDEO_DURATION.defaults[id],
        defaultAspectRatio: id === 'cartoon' ? '16:9' : '9:16',
      })),
      durations: {
        minSeconds: VIDEO_DURATION.minSeconds,
        maxSeconds: VIDEO_DURATION.maxSeconds,
        presets: VIDEO_DURATION.presets,
      },
      aspectRatios: Object.entries(ASPECT_RATIOS).map(([id, spec]) => ({
        id,
        label: spec.label,
        usage: spec.usage,
        width: spec.width,
        height: spec.height,
      })),
      voices: toOptions(VIDEO_VOICES),
      music: toOptions(VIDEO_MUSIC),
      audiences: VIDEO_AUDIENCES,
      callsToAction: CALLS_TO_ACTION,
      themes: STORY_CATEGORIES,
      images: {
        max: VIDEO_IMAGES.max,
        maxSizeMb: VIDEO_IMAGES.maxSizeMb,
        types: ['jpeg', 'png', 'webp'],
      },
      steps: VIDEO_STEPS,
      premiumOffers: Object.values(PREMIUM_OFFERS),
      features: {
        videoGeneration: openai.isConfigured || isAiDemoMode,
        /** Génération simulée (montage réel de vos images ou de clips libres de droit, sans IA). */
        demoMode: isAiDemoMode,
        videoFallback: veo.isConfigured,
        voiceover: elevenlabs.isConfigured || isAiDemoMode,
      },
    });
  }),

  health: asyncHandler(async (_req, res) => {
    const dbUp = await isDatabaseUp();
    res.status(dbUp ? 200 : 503).json({
      success: dbUp,
      message: dbUp ? 'OK' : 'Base de données indisponible',
      data: { uptime: Math.round(process.uptime()), database: dbUp ? 'up' : 'down' },
    });
  }),
};
