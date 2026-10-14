/**
 * Médias libres de droit utilisés par le mode démo de la génération
 * (aucune clé API nécessaire).
 */

/** Vidéos d'exemple libres d'usage (samplelib.com, Big Buck Bunny — Blender Foundation, CC BY). */
export const FREE_VIDEOS = [
  'https://download.samplelib.com/mp4/sample-5s.mp4',
  'https://download.samplelib.com/mp4/sample-10s.mp4',
  'https://download.samplelib.com/mp4/sample-15s.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
  'https://download.samplelib.com/mp4/sample-20s.mp4',
  'https://download.samplelib.com/mp4/sample-30s.mp4',
] as const;

/** Lectures françaises LibriVox (domaine public), utilisées comme voix off de démonstration. */
export const FREE_AUDIOS = [
  'https://archive.org/download/La-Cigale-et-la-Fourmi/LaFontaine-Lacigaleetlafourmi.mp3',
  ...[0, 1, 2, 3, 4, 5, 7, 8, 9].map(
    (n) =>
      `https://archive.org/download/trois_mousquetaires_0810_librivox/troismousquetaires_${String(n).padStart(2, '0')}_dumas_64kb.mp3`,
  ),
];

export function freeVideoUrl(index: number): string {
  return FREE_VIDEOS[Math.abs(index) % FREE_VIDEOS.length] ?? FREE_VIDEOS[0];
}

export function freeAudioUrl(index: number): string {
  return FREE_AUDIOS[Math.abs(index) % FREE_AUDIOS.length] ?? '';
}
