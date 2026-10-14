import { env } from '../../config/env';
import { ElevenLabsClient } from './ElevenLabsClient';
import { OpenAiClient } from './OpenAiClient';
import { VeoClient } from './VeoClient';

export { AiProviderError } from './errors';
export type { ChatContentPart, ChatMessage } from './OpenAiClient';
export { OpenAiClient, VeoClient, ElevenLabsClient };

export interface AiClients {
  openai: OpenAiClient;
  veo: VeoClient;
  elevenlabs: ElevenLabsClient;
}

let clients: AiClients | undefined;

export function getAiClients(): AiClients {
  clients ??= {
    openai: new OpenAiClient(
      [env.OPENAI_API_KEY, env.OPENAI_FALLBACK_API_KEY].filter(
        (key, index, all): key is string => Boolean(key) && all.indexOf(key) === index,
      ),
      env.OPENAI_TEXT_MODEL,
      env.SORA_MODEL,
    ),
    veo: new VeoClient(env.KIE_VEO_API_KEY),
    elevenlabs: new ElevenLabsClient(env.ELEVENLABS_API_KEY, env.ELEVENLABS_VOICE_ID),
  };
  return clients;
}

/** Injection de clients factices (tests). */
export function setAiClients(next: AiClients): void {
  clients = next;
}
