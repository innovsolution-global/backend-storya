import axios from 'axios';

import { AiProviderError, humanizeProviderError } from './errors';

/** Synthèse vocale ElevenLabs (modèle multilingue, adapté au français). */
export class ElevenLabsClient {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly voiceId: string,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async synthesize(text: string, voiceId: string = this.voiceId): Promise<Buffer> {
    if (!this.isConfigured)
      throw new AiProviderError('ElevenLabs', 'ElevenLabs : aucune clé API configurée.', 503);
    const trimmed = text.trim();
    if (!trimmed) throw new AiProviderError('ElevenLabs', 'ElevenLabs : texte de narration vide.');

    const response = await axios.post<ArrayBuffer>(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      { text: trimmed, model_id: 'eleven_multilingual_v2' },
      {
        headers: {
          'xi-api-key': this.apiKey ?? '',
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        responseType: 'arraybuffer',
        timeout: 120_000,
        validateStatus: () => true,
      },
    );

    if (response.status !== 200) {
      const body = Buffer.from(response.data).toString('utf8');
      throw new AiProviderError(
        'ElevenLabs',
        humanizeProviderError('ElevenLabs', response.status, body),
        response.status,
      );
    }
    return Buffer.from(response.data);
  }
}
