import fs from 'node:fs/promises';
import path from 'node:path';

/** Chaque fichier de test a sa propre base PostgreSQL en mémoire (PGlite, voir setup.ts). */
export default function setup(): () => Promise<void> {
  return async () => {
    // Fichiers copiés par le stockage factice des tests.
    await fs.rm(path.resolve(process.cwd(), 'uploads', 'test'), { recursive: true, force: true });
  };
}
