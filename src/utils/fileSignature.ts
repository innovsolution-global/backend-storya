import fs from 'node:fs/promises';

import type { MediaKind } from '../middlewares/upload';

/**
 * Vérifie les « magic bytes » du fichier : le type MIME envoyé par le client
 * peut être falsifié, pas le contenu réel.
 */
export async function hasValidSignature(filePath: string, kind: MediaKind): Promise<boolean> {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    await handle.read(header, 0, 16, 0);
    const hex = header.toString('hex');
    const ascii = header.toString('latin1');

    switch (kind) {
      case 'image':
        return (
          hex.startsWith('ffd8ff') || // JPEG
          hex.startsWith('89504e470d0a1a0a') || // PNG
          (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP')
        );
      case 'audio':
        return (
          ascii.startsWith('ID3') || // MP3 avec tag ID3
          hex.startsWith('fff') || // trame MPEG / AAC ADTS
          ascii.slice(4, 8) === 'ftyp' // M4A
        );
      case 'video':
        return (
          ascii.slice(4, 8) === 'ftyp' || // MP4 / MOV
          hex.startsWith('1a45dfa3') // WebM / Matroska
        );
    }
  } finally {
    await handle.close();
  }
}
