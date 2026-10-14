/** Vérification manuelle du montage ffmpeg : `npx tsx scripts/composer-smoke.ts`. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import ffmpegStatic from 'ffmpeg-static';

import { FfmpegVideoComposer } from '../src/integrations/video/FfmpegVideoComposer';

async function main(): Promise<void> {
  const bin = ffmpegStatic as unknown as string;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storya-smoke-'));
  const p = (name: string) => path.join(dir, name);
  const gen = (args: string[]) =>
    execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

  // Médias synthétiques : une image 800x600, un clip 640x360 de 3 s, 20 s d'audio.
  gen(['-f', 'lavfi', '-i', 'testsrc=size=800x600', '-frames:v', '1', p('image.png')]);
  gen(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-t', '3', p('clip.mp4')]);
  gen(['-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '20', p('voice.mp3')]);

  const composer = new FfmpegVideoComposer(bin);
  const frame = { width: 720, height: 1280 };
  const started = Date.now();
  await composer.imageClip(p('image.png'), p('scene1.mp4'), frame, 6);
  await composer.normalizeClip(p('clip.mp4'), p('scene2.mp4'), frame, 8);
  await composer.fitImage(p('image.png'), p('fitted.jpg'), frame);
  await composer.concat([p('scene1.mp4'), p('scene2.mp4')], p('montage.mp4'));
  await composer.ambientMusic('joyeuse', p('music.mp3'), 14);
  await composer.mixAudio(
    p('montage.mp4'),
    { voice: p('voice.mp3'), music: p('music.mp3') },
    p('final.mp4'),
    14,
  );
  await composer.mixAudio(p('montage.mp4'), { music: p('music.mp3') }, p('music-only.mp4'), 14);
  await composer.thumbnail(p('final.mp4'), p('thumb.jpg'));

  const duration = await composer.duration(p('final.mp4'));
  const report = {
    durationSeconds: duration,
    sizeKb: Math.round(fs.statSync(p('final.mp4')).size / 1024),
    musicOnlySeconds: await composer.duration(p('music-only.mp4')),
    thumbnail: fs.existsSync(p('thumb.jpg')),
    fitted: fs.existsSync(p('fitted.jpg')),
    elapsedMs: Date.now() - started,
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
