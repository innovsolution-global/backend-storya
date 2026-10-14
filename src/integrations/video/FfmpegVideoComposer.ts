import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { AmbientMood, FrameSize, VideoComposer } from './VideoComposer';

const FPS = 30;
const ENCODE = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];
const TIMEOUT_MS = 10 * 60_000;

/** Remplit le cadre sans déformer : redimensionne puis recadre au centre. */
function cover({ width, height }: FrameSize): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
}

export class FfmpegVideoComposer implements VideoComposer {
  constructor(private readonly binary: string) {}

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.binary,
        ['-hide_banner', '-loglevel', 'error', '-y', ...args],
        { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
        (error, _stdout, stderr) => {
          if (error) {
            reject(
              new Error(
                `ffmpeg a échoué : ${stderr.trim().split('\n').slice(-3).join(' ') || error.message}`,
              ),
            );
            return;
          }
          resolve(stderr);
        },
      );
    });
  }

  async normalizeClip(
    input: string,
    output: string,
    frame: FrameSize,
    seconds: number,
  ): Promise<void> {
    await this.run([
      '-stream_loop',
      '-1',
      '-i',
      input,
      '-t',
      seconds.toFixed(2),
      '-vf',
      `${cover(frame)},fps=${FPS}`,
      '-an',
      ...ENCODE,
      output,
    ]);
  }

  async imageClip(image: string, output: string, frame: FrameSize, seconds: number): Promise<void> {
    const { width, height } = frame;
    const fade = Math.min(0.5, seconds / 4);
    // Image agrandie de 15 %, puis fenêtre qui glisse lentement de gauche à droite.
    const big = `scale=${Math.round(width * 1.15)}:${Math.round(height * 1.15)}:force_original_aspect_ratio=increase`;
    const pan = `crop=${width}:${height}:x='(iw-ow)*t/${seconds.toFixed(2)}':y='(ih-oh)/2'`;
    await this.run([
      '-loop',
      '1',
      '-framerate',
      String(FPS),
      '-i',
      image,
      '-t',
      seconds.toFixed(2),
      '-vf',
      `${big},${pan},setsar=1,fade=t=in:st=0:d=${fade},fade=t=out:st=${(seconds - fade).toFixed(2)}:d=${fade},fps=${FPS}`,
      ...ENCODE,
      output,
    ]);
  }

  async fitImage(image: string, output: string, frame: FrameSize): Promise<void> {
    await this.run(['-i', image, '-vf', cover(frame), '-frames:v', '1', '-q:v', '3', output]);
  }

  async concat(clips: string[], output: string): Promise<void> {
    const list = path.join(path.dirname(output), `concat-${Date.now()}.txt`);
    // Format du démultiplexeur concat : chemins entre apostrophes, apostrophes échappées.
    const content = clips
      .map((clip) => `file '${clip.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    await fs.writeFile(list, content, 'utf8');
    try {
      await this.run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', output]);
    } finally {
      await fs.unlink(list).catch(() => undefined);
    }
  }

  async mixAudio(
    video: string,
    tracks: { voice?: string; music?: string },
    output: string,
    seconds: number,
  ): Promise<void> {
    const inputs = ['-i', video];
    const filters: string[] = [];
    let index = 1;
    let voiceLabel: string | undefined;
    let musicLabel: string | undefined;

    if (tracks.voice) {
      inputs.push('-i', tracks.voice);
      filters.push(`[${index}:a]apad[voice]`);
      voiceLabel = '[voice]';
      index += 1;
    }
    if (tracks.music) {
      // Musique en boucle, plus discrète quand il y a une voix off.
      inputs.push('-stream_loop', '-1', '-i', tracks.music);
      filters.push(`[${index}:a]volume=${tracks.voice ? 0.18 : 0.6}[music]`);
      musicLabel = '[music]';
    }

    if (!voiceLabel && !musicLabel) {
      await fs.copyFile(video, output);
      return;
    }
    if (voiceLabel && musicLabel) {
      filters.push(`${voiceLabel}${musicLabel}amix=inputs=2:duration=longest:normalize=0[mix]`);
    }
    const out = voiceLabel && musicLabel ? '[mix]' : (voiceLabel ?? musicLabel ?? '');
    const fadeStart = Math.max(0, seconds - 1.5).toFixed(2);
    filters.push(`${out}afade=t=out:st=${fadeStart}:d=1.5[aout]`);

    await this.run([
      ...inputs,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '0:v',
      '-map',
      '[aout]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-t',
      seconds.toFixed(2),
      '-movflags',
      '+faststart',
      output,
    ]);
  }

  async ambientMusic(mood: AmbientMood, output: string, seconds: number): Promise<void> {
    // Accords tenus (fréquences en Hz) avec une pulsation lente.
    const chords: Record<AmbientMood, { notes: number[]; pulse: number }> = {
      douce: { notes: [220, 261.63, 329.63, 392], pulse: 0.15 },
      epique: { notes: [73.42, 146.83, 220, 293.66], pulse: 0.5 },
      joyeuse: { notes: [261.63, 329.63, 392, 523.25], pulse: 2 },
    };
    const { notes, pulse } = chords[mood];
    const tone = notes.map((f, i) => `${(0.16 / (i + 1)).toFixed(3)}*sin(2*PI*${f}*t)`).join('+');
    const expression = `(${tone})*(0.75+0.25*sin(2*PI*${pulse}*t))`;
    await this.run([
      '-f',
      'lavfi',
      '-i',
      `aevalsrc=${expression}:s=44100:d=${seconds.toFixed(2)}`,
      '-af',
      `afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, seconds - 2).toFixed(2)}:d=2`,
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      output,
    ]);
  }

  async thumbnail(video: string, output: string): Promise<void> {
    await this.run(['-ss', '1', '-i', video, '-frames:v', '1', '-q:v', '3', output]);
  }

  async duration(file: string): Promise<number> {
    // ffmpeg sans sortie affiche les métadonnées puis échoue : on lit « Duration: hh:mm:ss.cc ».
    const stderr = await new Promise<string>((resolve) => {
      execFile(
        this.binary,
        ['-hide_banner', '-i', file],
        { windowsHide: true },
        (_error, _out, err) => resolve(err),
      );
    });
    const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
    if (!match) return 0;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
}
