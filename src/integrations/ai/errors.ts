/** Erreur d'un fournisseur IA, avec un message lisible pour l'utilisateur. */
export class AiProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

interface ProviderErrorBody {
  error?: { code?: string; type?: string; message?: string } | string;
  message?: string;
}

function parse(body: unknown): ProviderErrorBody | undefined {
  if (body && typeof body === 'object') return body as ProviderErrorBody;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as ProviderErrorBody;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Traduit une réponse d'erreur HTTP en message français.
 * Les détails techniques (clés, quotas) sont destinés aux logs, pas à l'utilisateur final.
 */
export function humanizeProviderError(provider: string, status: number, body: unknown): string {
  const parsed = parse(body);
  const error = typeof parsed?.error === 'object' ? parsed.error : undefined;
  const code = error?.code ?? error?.type ?? '';
  const raw = typeof body === 'string' ? body : JSON.stringify(body ?? '');

  if (code === 'insufficient_quota' || raw.includes('insufficient_quota')) {
    return `${provider} : crédit ou quota épuisé côté fournisseur.`;
  }
  if (status === 429 || code === 'rate_limit_exceeded') {
    return `${provider} : trop de requêtes. Réessayez dans une minute.`;
  }
  if (status === 401 || status === 403 || code === 'invalid_api_key') {
    return `${provider} : clé API invalide ou accès refusé.`;
  }
  const message =
    error?.message ?? parsed?.message ?? (typeof parsed?.error === 'string' ? parsed.error : '');
  if (message && message.length < 200) return `${provider} : ${message}`;
  return `${provider} : erreur inattendue (${status}).`;
}

/** Clé refusée ou quota épuisé : la clé de secours a une chance de fonctionner. */
export function shouldTryFallbackKey(status: number, body: unknown): boolean {
  if (status === 401 || status === 403) return true;
  if (status === 429) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body ?? '');
    return raw.includes('insufficient_quota') || raw.includes('invalid_api_key');
  }
  return false;
}
