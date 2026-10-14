import ffmpegStatic from 'ffmpeg-static';

import { env } from '../../config/env';
import { FfmpegVideoComposer } from './FfmpegVideoComposer';
import type { VideoComposer } from './VideoComposer';

export type { AmbientMood, FrameSize, VideoComposer } from './VideoComposer';

let composer: VideoComposer | undefined;

export function getVideoComposer(): VideoComposer {
  if (!composer) {
    const binary = env.FFMPEG_PATH ?? (ffmpegStatic as unknown as string | null);
    if (!binary)
      throw new Error('ffmpeg introuvable : installez ffmpeg-static ou définissez FFMPEG_PATH.');
    composer = new FfmpegVideoComposer(binary);
  }
  return composer;
}

/** Remplace le compositeur (tests). */
export function setVideoComposer(next: VideoComposer): void {
  composer = next;
}
