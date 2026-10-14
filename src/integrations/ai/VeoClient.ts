import type { AxiosInstance } from 'axios';
import axios from 'axios';

import { AiProviderError, humanizeProviderError } from './errors';

interface VeoEnvelope<T> {
  code?: number;
  msg?: string;
  data?: T;
}

interface VeoRecord {
  successFlag?: number;
  errorCode?: number;
  errorMessage?: string;
  response?: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function firstUrl(value: unknown): string | undefined {
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  if (typeof value === 'string' && value) {
    try {
      const decoded: unknown = JSON.parse(value);
      if (Array.isArray(decoded) && decoded.length > 0) return String(decoded[0]);
    } catch {
      return value;
    }
  }
  return undefined;
}

/** Client Veo 3.1 via kie.ai (https://docs.kie.ai/veo3-api/generate-veo-3-video). */
export class VeoClient {
  private readonly http: AxiosInstance;

  constructor(private readonly apiKey: string | undefined) {
    this.http = axios.create({
      baseURL: 'https://api.kie.ai/api/v1/veo',
      timeout: 60_000,
      validateStatus: () => true,
      headers: { Authorization: `Bearer ${apiKey ?? ''}`, Accept: 'application/json' },
    });
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Lance une génération et renvoie l'URL du MP4 produit.
   * Avec `imageUrl` (URL publique), la vidéo part de cette image (image → vidéo).
   */
  async generateVideo(options: {
    prompt: string;
    durationSeconds: number;
    aspectRatio?: '16:9' | '9:16';
    imageUrl?: string;
    pollIntervalMs?: number;
    timeoutMs?: number;
  }): Promise<string> {
    if (!this.isConfigured)
      throw new AiProviderError('Veo', 'Veo : aucune clé API configurée.', 503);
    const {
      prompt,
      durationSeconds,
      aspectRatio = '9:16',
      imageUrl,
      pollIntervalMs = 8_000,
      timeoutMs = 5 * 60_000,
    } = options;

    const start = await this.http.post<VeoEnvelope<{ taskId?: string }>>('/generate', {
      prompt,
      model: 'veo3_fast',
      generationType: imageUrl ? 'FIRST_AND_LAST_FRAMES_2_VIDEO' : 'TEXT_2_VIDEO',
      ...(imageUrl ? { imageUrls: [imageUrl] } : {}),
      aspect_ratio: aspectRatio,
      resolution: '1080p',
      duration: durationSeconds,
      enableTranslation: true,
    });
    const code = start.data?.code ?? start.status;
    const taskId = start.data?.data?.taskId;
    if (code !== 200 || !taskId) {
      throw new AiProviderError(
        'Veo',
        start.data?.msg
          ? `Veo : ${start.data.msg}`
          : humanizeProviderError('Veo', start.status, start.data),
      );
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const info = await this.http.get<VeoEnvelope<VeoRecord>>('/record-info', {
        params: { taskId },
      });
      const record = info.data?.data;
      if ((info.data?.code ?? info.status) !== 200 || !record) {
        throw new AiProviderError('Veo', `Veo : ${info.data?.msg ?? 'statut illisible'}.`);
      }
      switch (record.successFlag) {
        case 1: {
          const response = record.response ?? {};
          const url =
            firstUrl(response.resultUrls) ??
            firstUrl(response.fullResultUrls) ??
            firstUrl(response.originUrls);
          if (!url) throw new AiProviderError('Veo', 'Veo : vidéo générée sans URL.');
          return url;
        }
        case 2:
        case 3:
          throw new AiProviderError('Veo', `Veo : ${record.errorMessage ?? 'génération échouée'}.`);
        default:
          await sleep(pollIntervalMs);
      }
    }
    throw new AiProviderError('Veo', 'Veo : délai dépassé, la vidéo est toujours en cours.', 504);
  }
}
