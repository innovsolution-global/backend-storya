import type { AxiosInstance, AxiosResponse } from 'axios';
import axios from 'axios';

import { AiProviderError, humanizeProviderError, shouldTryFallbackKey } from './errors';

/** Partie de message : texte ou image (URL https ou data URL base64, lue par les modèles vision). */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Client OpenAI (Chat Completions + Sora) avec bascule automatique
 * vers une clé de secours si la clé principale est refusée ou à court de quota.
 */
export class OpenAiClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly apiKeys: string[],
    private readonly textModel: string,
    private readonly videoModel: string,
  ) {
    this.http = axios.create({
      baseURL: 'https://api.openai.com/v1',
      timeout: 120_000,
      validateStatus: () => true,
    });
  }

  get isConfigured(): boolean {
    return this.apiKeys.length > 0;
  }

  /** Exécute la requête avec chaque clé jusqu'à succès. Retourne aussi la clé utilisée. */
  private async withKeys<T>(
    provider: string,
    send: (key: string) => Promise<AxiosResponse<T>>,
  ): Promise<{ data: T; key: string }> {
    if (!this.isConfigured)
      throw new AiProviderError(provider, `${provider} : aucune clé API configurée.`, 503);
    let last: AxiosResponse<T> | undefined;
    for (const [index, key] of this.apiKeys.entries()) {
      const response = await send(key);
      if (response.status >= 200 && response.status < 300) return { data: response.data, key };
      last = response;
      const hasFallback = index < this.apiKeys.length - 1;
      if (!(hasFallback && shouldTryFallbackKey(response.status, response.data))) break;
    }
    const status = last?.status ?? 500;
    throw new AiProviderError(
      provider,
      humanizeProviderError(provider, status, last?.data),
      status,
    );
  }

  /** Chat Completions en mode JSON : renvoie l'objet JSON produit par le modèle. */
  async chatJson(messages: ChatMessage[], temperature: number): Promise<Record<string, unknown>> {
    const { data } = await this.withKeys<{ choices?: { message?: { content?: string } }[] }>(
      'OpenAI texte',
      (key) =>
        this.http.post(
          '/chat/completions',
          {
            model: this.textModel,
            response_format: { type: 'json_object' },
            messages,
            temperature,
          },
          { headers: { Authorization: `Bearer ${key}` } },
        ),
    );
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new AiProviderError('OpenAI texte', 'OpenAI texte : réponse vide.');
    try {
      const parsed: unknown = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>;
    } catch {
      // traité ci-dessous
    }
    throw new AiProviderError('OpenAI texte', 'OpenAI texte : réponse JSON invalide.');
  }

  /**
   * Génère une vidéo Sora et renvoie le MP4 en mémoire.
   * `inputReference` : image de départ (JPEG aux dimensions exactes de `size`).
   */
  async generateVideo(options: {
    prompt: string;
    seconds: number;
    size?: string;
    inputReference?: Buffer;
    pollIntervalMs?: number;
    timeoutMs?: number;
  }): Promise<Buffer> {
    const {
      prompt,
      seconds,
      size = '720x1280',
      inputReference,
      pollIntervalMs = 15_000,
      timeoutMs = 10 * 60_000,
    } = options;

    const { data: job, key } = await this.withKeys<{ id?: string }>('Sora', (apiKey) => {
      const form = new FormData();
      form.append('model', this.videoModel);
      form.append('prompt', prompt);
      form.append('size', size);
      form.append('seconds', String(seconds));
      if (inputReference) {
        form.append(
          'input_reference',
          new Blob([new Uint8Array(inputReference)], { type: 'image/jpeg' }),
          'reference.jpg',
        );
      }
      return this.http.post('/videos', form, { headers: { Authorization: `Bearer ${apiKey}` } });
    });
    if (!job.id) throw new AiProviderError('Sora', 'Sora : identifiant de vidéo absent.');

    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (Date.now() > deadline) {
        throw new AiProviderError(
          'Sora',
          `Sora : délai dépassé (plus de ${Math.round(timeoutMs / 60_000)} min).`,
          504,
        );
      }
      const status = await this.http.get<{
        status?: string;
        error?: { message?: string } | string;
      }>(`/videos/${job.id}`, { headers: { Authorization: `Bearer ${key}` } });
      if (status.status !== 200) {
        throw new AiProviderError(
          'Sora',
          humanizeProviderError('Sora', status.status, status.data),
          status.status,
        );
      }
      if (status.data.status === 'completed') break;
      if (status.data.status === 'failed') {
        const error = status.data.error;
        const message = typeof error === 'string' ? error : error?.message;
        throw new AiProviderError('Sora', `Sora a échoué : ${message ?? 'erreur inconnue'}.`);
      }
      await sleep(pollIntervalMs);
    }

    const content = await this.http.get<ArrayBuffer>(`/videos/${job.id}/content`, {
      headers: { Authorization: `Bearer ${key}` },
      responseType: 'arraybuffer',
      timeout: 5 * 60_000,
    });
    if (content.status !== 200) {
      throw new AiProviderError(
        'Sora',
        humanizeProviderError('Sora', content.status, ''),
        content.status,
      );
    }
    return Buffer.from(content.data);
  }
}
