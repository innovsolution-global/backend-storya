import crypto from 'node:crypto';

/** Jeton aléatoire envoyé au client ; seule son empreinte SHA-256 est stockée en base. */
export function generateToken(bytes = 32): { token: string; hash: string } {
  const token = crypto.randomBytes(bytes).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Code numérique à usage unique, saisi à la main (ex. réinitialisation de mot de passe). */
export function generateNumericCode(length = 6): string {
  return crypto
    .randomInt(0, 10 ** length)
    .toString()
    .padStart(length, '0');
}

/** Comparaison à temps constant de deux empreintes. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}
