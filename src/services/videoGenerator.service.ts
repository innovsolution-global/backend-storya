import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import axios from 'axios';
import { and, eq } from 'drizzle-orm';

import { db } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ASPECT_RATIOS, STYLE_PROMPTS, VIDEO_STEPS } from '../constants';
import { freeAudioUrl, freeVideoUrl } from '../constants/freeMedia';
import { videos } from '../db/schema';
import { findUserById } from '../db/users';
import { AiProviderError, getAiClients } from '../integrations/ai';
import { getStorageProvider } from '../integrations/storage';
import type { AmbientMood, FrameSize } from '../integrations/video';
import { getVideoComposer } from '../integrations/video';
import { UPLOAD_ROOT } from '../middlewares/upload';
import type { IMedia, IScene, IVideo } from '../models';
import { resolveUserLang } from '../i18n';
import { mediaUrl } from '../utils/serializers';
import { emailService } from './email.service';
import { notificationService } from './notification.service';
import type { VideoScript } from './videoScript.service';
import { buildDemoScript, writeScriptWithAi } from './videoScript.service';

/** Scènes générées en parallèle (les modèles vidéo mettent plusieurs minutes par clip). */
const SCENE_CONCURRENCY = 3;

/** Erreur dont le message peut être montré tel quel à l'utilisateur. */
export class VideoGenerationError extends Error {}

interface WorkContext {
  video: IVideo;
  dir: string;
  /** Images de l'utilisateur copiées dans le dossier de travail. */
  images: string[];
  frame: FrameSize;
  demo: boolean;
}

// ─── Utilitaires fichiers ─────────────────────────────────────────────────

async function download(url: string, dest: string): Promise<void> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 5 * 60_000,
    maxContentLength: 500 * 1024 * 1024,
  });
  await fs.writeFile(dest, Buffer.from(response.data));
}

/** Copie un média stocké (disque local ou URL distante) dans le dossier de travail. */
async function fetchMedia(media: IMedia, dest: string): Promise<void> {
  if (media.provider === 'local') {
    const source = path.resolve(UPLOAD_ROOT, media.url.replace(/^\/uploads\//, ''));
    if (!source.startsWith(UPLOAD_ROOT)) throw new Error('Chemin de média invalide');
    await fs.copyFile(source, dest);
    return;
  }
  await download(media.url, dest);
}

/** Une URL joignable par un fournisseur externe (Veo télécharge lui-même l'image). */
function isPublicUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(hostname);
  } catch {
    return false;
  }
}

/** Exécute `task` sur chaque élément avec au plus `limit` tâches simultanées, en gardant l'ordre. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Enregistre l'état de la génération (plus `changes`). Le titre n'en fait pas partie :
 * l'utilisateur peut renommer la vidéo pendant ce temps. Renvoie false si elle a été supprimée.
 */
async function saveVideo(video: IVideo, changes: Partial<IVideo> = {}): Promise<boolean> {
  Object.assign(video, changes);
  const saved = await db
    .update(videos)
    .set({
      status: video.status,
      progress: video.progress,
      scenes: video.scenes,
      narration: video.narration,
      description: video.description,
      output: video.output,
      thumbnail: video.thumbnail,
      outputDurationSeconds: video.outputDurationSeconds,
      error: video.error,
      warnings: video.warnings,
      providers: video.providers,
      finishedAt: video.finishedAt,
      ...changes,
    })
    .where(eq(videos.id, video.id))
    .returning({ id: videos.id });
  return saved.length > 0;
}

async function setProgress(
  video: IVideo,
  step: number,
  message: string,
  changes: Partial<IVideo> = {},
): Promise<void> {
  video.progress = { ...video.progress, step, message };
  await saveVideo(video, changes);
}

// ─── Étape 1 : script ─────────────────────────────────────────────────────

async function writeScript(ctx: WorkContext): Promise<VideoScript> {
  const { video } = ctx;
  if (ctx.demo) {
    video.providers.script = 'demo';
    return buildDemoScript(video, ctx.images.length);
  }
  // Images réduites pour l'analyse (coût et latence maîtrisés).
  const dataUrls: string[] = [];
  for (const [index, image] of ctx.images.entries()) {
    const small = path.join(ctx.dir, `vision-${index}.jpg`);
    await getVideoComposer().fitImage(image, small, {
      width: 512,
      height: Math.round((512 * ctx.frame.height) / ctx.frame.width),
    });
    dataUrls.push(`data:image/jpeg;base64,${(await fs.readFile(small)).toString('base64')}`);
  }
  video.providers.script = 'openai';
  return writeScriptWithAi(video, dataUrls);
}

// ─── Étape 2 : scènes ─────────────────────────────────────────────────────

function scenePrompt(video: IVideo, scene: IScene): string {
  const style = STYLE_PROMPTS[video.style] ?? video.style;
  const characters = video.characters ? ` Recurring characters: ${video.characters}.` : '';
  return `${scene.visualPrompt}. Visual style: ${style}.${characters} No on-screen text, no subtitles, no watermark.`;
}

/** Clip IA d'une scène : Sora (image de départ envoyée en fichier), sinon Veo (URL publique). */
async function renderSceneWithAi(ctx: WorkContext, scene: IScene, raw: string): Promise<string> {
  const { openai, veo } = getAiClients();
  const { video } = ctx;
  const source = ASPECT_RATIOS[video.aspectRatio].source;
  const prompt = scenePrompt(video, scene);
  const image = scene.imageIndex === undefined ? undefined : ctx.images[scene.imageIndex];

  let soraError: AiProviderError | undefined;
  if (openai.isConfigured) {
    try {
      let inputReference: Buffer | undefined;
      if (image) {
        const size =
          source === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
        const fitted = path.join(ctx.dir, `ref-${scene.order}.jpg`);
        await getVideoComposer().fitImage(image, fitted, size);
        inputReference = await fs.readFile(fitted);
      }
      const seconds = scene.durationSeconds <= 4 ? 4 : scene.durationSeconds <= 8 ? 8 : 12;
      const buffer = await openai.generateVideo({
        prompt,
        seconds,
        size: source === '9:16' ? '720x1280' : '1280x720',
        inputReference,
      });
      await fs.writeFile(raw, buffer);
      return 'sora';
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      soraError = error;
      logger.warn(
        { err: error, videoId: video.id, scene: scene.order },
        'Sora indisponible pour la scène',
      );
    }
  }

  if (!veo.isConfigured) {
    throw soraError ?? new AiProviderError('Vidéo', 'Aucun fournisseur vidéo configuré.', 503);
  }
  const imageMedia = scene.imageIndex === undefined ? undefined : video.images[scene.imageIndex];
  const imageUrl = imageMedia ? mediaUrl(imageMedia) : undefined;
  const publicImage = imageUrl && isPublicUrl(imageUrl) ? imageUrl : undefined;
  if (imageUrl && !publicImage) {
    const warning =
      "Veo n'a pas pu utiliser vos images : elles doivent être accessibles publiquement (stockage Cloudinary).";
    if (!video.warnings.includes(warning)) video.warnings.push(warning);
  }
  const url = await veo.generateVideo({
    prompt,
    durationSeconds: 8,
    aspectRatio: source,
    imageUrl: publicImage,
  });
  await download(url, raw);
  return 'veo';
}

/** Clip démo d'une scène : l'image de l'utilisateur animée, sinon une vidéo libre de droit. */
async function renderSceneDemo(
  ctx: WorkContext,
  scene: IScene,
  out: string,
  freeClips: Map<string, Promise<string>>,
): Promise<void> {
  const image = scene.imageIndex === undefined ? undefined : ctx.images[scene.imageIndex];
  if (image) {
    await getVideoComposer().imageClip(image, out, ctx.frame, scene.durationSeconds);
    return;
  }
  const url = freeVideoUrl(scene.order);
  // Chaque vidéo d'exemple n'est téléchargée qu'une fois par génération.
  let file = freeClips.get(url);
  if (!file) {
    const dest = path.join(ctx.dir, `free-${freeClips.size}.mp4`);
    file = download(url, dest).then(() => dest);
    freeClips.set(url, file);
  }
  await getVideoComposer().normalizeClip(await file, out, ctx.frame, scene.durationSeconds);
}

async function renderScenes(ctx: WorkContext, scenes: IScene[]): Promise<string[]> {
  const { video } = ctx;
  let done = 0;
  const providers = new Set<string>();
  const freeClips = new Map<string, Promise<string>>();

  const clips = await mapWithConcurrency(scenes, SCENE_CONCURRENCY, async (scene) => {
    const out = path.join(ctx.dir, `scene-${String(scene.order).padStart(3, '0')}.mp4`);
    if (ctx.demo) {
      await renderSceneDemo(ctx, scene, out, freeClips);
      providers.add('demo');
    } else {
      const raw = path.join(ctx.dir, `raw-${scene.order}.mp4`);
      providers.add(await renderSceneWithAi(ctx, scene, raw));
      await getVideoComposer().normalizeClip(raw, out, ctx.frame, scene.durationSeconds);
    }
    done += 1;
    // Sauvegarde de progression non bloquante : une erreur d'écriture ne doit pas arrêter le rendu.
    video.progress = { ...video.progress, message: `Scène ${done} sur ${scenes.length} prête` };
    await db.update(videos).set({ progress: video.progress }).where(eq(videos.id, video.id));
    return out;
  });

  video.providers.video = [...providers].join('+');
  return clips;
}

// ─── Étape 3 : voix off et musique ────────────────────────────────────────

function elevenLabsVoice(voice: IVideo['voice']): string {
  switch (voice) {
    case 'masculine':
      return env.ELEVENLABS_VOICE_MASCULINE;
    case 'enfant':
      return env.ELEVENLABS_VOICE_ENFANT;
    default:
      return env.ELEVENLABS_VOICE_ID;
  }
}

async function buildVoice(ctx: WorkContext, narration: string): Promise<string | undefined> {
  const { video } = ctx;
  if (video.voice === 'aucune' || !narration.trim()) return undefined;
  const out = path.join(ctx.dir, 'voice.mp3');

  if (ctx.demo) {
    try {
      await download(freeAudioUrl(video.durationSeconds), out);
      video.providers.voice = 'demo';
      video.warnings.push(
        'Mode démo : la voix off est une lecture du domaine public (LibriVox), pas votre script.',
      );
      return out;
    } catch {
      video.warnings.push('Mode démo : voix off d’exemple indisponible (connexion).');
      return undefined;
    }
  }

  const { elevenlabs } = getAiClients();
  if (!elevenlabs.isConfigured) {
    video.warnings.push('Voix off désactivée : aucune clé ElevenLabs configurée.');
    return undefined;
  }
  try {
    await fs.writeFile(out, await elevenlabs.synthesize(narration, elevenLabsVoice(video.voice)));
    video.providers.voice = 'elevenlabs';
    return out;
  } catch (error) {
    // La vidéo reste exploitable sans voix off.
    logger.warn({ err: error, videoId: video.id }, 'Voix off indisponible');
    video.warnings.push(
      error instanceof AiProviderError ? error.message : 'Voix off indisponible.',
    );
    return undefined;
  }
}

/** Piste de la bibliothèque (MUSIC_DIR) si elle existe, sinon nappe synthétisée. */
async function buildMusic(ctx: WorkContext): Promise<string | undefined> {
  const { video } = ctx;
  if (video.music === 'aucune') return undefined;
  const library = path.resolve(process.cwd(), env.MUSIC_DIR, `${video.music}.mp3`);
  try {
    await fs.access(library);
    video.providers.music = 'library';
    return library;
  } catch {
    const out = path.join(ctx.dir, 'music.mp3');
    await getVideoComposer().ambientMusic(video.music as AmbientMood, out, video.durationSeconds);
    video.providers.music = 'ambient';
    return out;
  }
}

// ─── Exécution du job ─────────────────────────────────────────────────────

/**
 * Email « Votre vidéo est prête » si l'utilisateur a laissé la notification
 * activée, dans sa langue (réglage du compte, sinon langue de l'app à la création).
 * Ne fait jamais échouer la génération.
 */
async function notifyVideoReady(video: IVideo): Promise<void> {
  await notificationService.videoFinished(video, 'completed');
  try {
    const user = await findUserById(video.userId);
    if (!user || user.settings?.notifications?.videoReady === false) return;
    await emailService.sendVideoReady(
      user.email,
      user.firstName,
      video.title,
      resolveUserLang(user.settings?.language, video.language),
    );
  } catch (error) {
    logger.warn({ err: error, videoId: video.id }, 'Email « vidéo prête » non envoyé');
  }
}

/**
 * Génère la vidéo de bout en bout. Toutes les erreurs sont capturées et
 * enregistrées sur la vidéo (jamais propagées à la file de jobs).
 */
export async function runVideoJob(videoId: string): Promise<void> {
  const [video] = await db
    .update(videos)
    .set({ status: 'processing', startedAt: new Date() })
    .where(and(eq(videos.id, videoId), eq(videos.status, 'queued')))
    .returning();
  if (!video) return;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `storya-${videoId}-`));
  const { width, height } = ASPECT_RATIOS[video.aspectRatio];
  const ctx: WorkContext = { video, dir, images: [], frame: { width, height }, demo: video.demo };

  try {
    for (const [index, image] of video.images.entries()) {
      const dest = path.join(dir, `image-${index}${path.extname(image.url) || '.jpg'}`);
      await fetchMedia(image, dest);
      ctx.images.push(dest);
    }

    await setProgress(video, 1, VIDEO_STEPS[0]);
    const script = await writeScript(ctx);
    video.scenes = script.scenes;
    video.narration = script.narration;
    video.description = script.description;
    const untitled = !video.title || video.title === 'Nouvelle vidéo';

    await setProgress(
      video,
      2,
      `${VIDEO_STEPS[1]} (${script.scenes.length})`,
      untitled ? { title: script.title } : {},
    );
    const clips = await renderScenes(ctx, script.scenes);

    await setProgress(video, 3, VIDEO_STEPS[2]);
    const [voice, music] = await Promise.all([buildVoice(ctx, script.narration), buildMusic(ctx)]);

    await setProgress(video, 4, VIDEO_STEPS[3]);
    const composer = getVideoComposer();
    const montage = path.join(dir, 'montage.mp4');
    const final = path.join(dir, 'final.mp4');
    const thumb = path.join(dir, 'thumbnail.jpg');
    await composer.concat(clips, montage);
    await composer.mixAudio(montage, { voice, music }, final, video.durationSeconds);
    await composer.thumbnail(final, thumb);

    const storage = getStorageProvider();
    video.output = await storage.uploadFile(final, { kind: 'video', folder: 'videos/outputs' });
    video.thumbnail = await storage.uploadFile(thumb, {
      kind: 'image',
      folder: 'videos/thumbnails',
    });
    video.outputDurationSeconds = Math.round((await composer.duration(final)) * 10) / 10;

    video.progress = {
      ...video.progress,
      step: video.progress.total,
      message: 'Votre vidéo est prête !',
    };
    if (!(await saveVideo(video, { status: 'completed', finishedAt: new Date() }))) {
      throw new VideoGenerationError('Vidéo supprimée pendant la génération.');
    }
    logger.info({ videoId, type: video.type, demo: video.demo }, 'Vidéo générée');
    await notifyVideoReady(video);
  } catch (error) {
    logger.error({ err: error, videoId }, 'Génération vidéo échouée');
    const message =
      error instanceof AiProviderError || error instanceof VideoGenerationError
        ? error.message
        : 'Impossible de générer la vidéo. Réessayez.';
    const saved = await saveVideo(video, {
      status: 'failed',
      error: message,
      finishedAt: new Date(),
    }).catch((saveError: unknown) => {
      logger.warn({ err: saveError, videoId }, 'Statut final non enregistré');
      return true;
    });
    // Vidéo supprimée entre-temps par l'utilisateur.
    if (!saved) logger.warn({ videoId }, 'Statut final non enregistré : vidéo supprimée');
    else await notificationService.videoFinished(video, 'failed');
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
