import type { App } from 'firebase-admin/app';
import { cert, initializeApp } from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import type { PushMessage, PushProvider, PushResult } from './PushProvider';

/** FCM accepte 500 jetons par envoi groupé. */
const BATCH_SIZE = 500;

/** Erreurs FCM qui signifient que le jeton ne servira plus jamais. */
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Envoi réel via Firebase Cloud Messaging (compte de service du projet). */
export class FirebasePushProvider implements PushProvider {
  readonly name = 'firebase';
  private readonly app: App;

  constructor(serviceAccount: ServiceAccount) {
    this.app = initializeApp({ credential: cert(serviceAccount) }, 'storya-push');
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const result: PushResult = { sent: 0, failed: 0, invalidTokens: [] };
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const response = await getMessaging(this.app).sendEachForMulticast({
        tokens: batch,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: {
          priority: 'high',
          notification: { channelId: 'storya_default', color: '#F6A623', icon: 'ic_notification' },
        },
        apns: { payload: { aps: { sound: 'default' } } },
      });
      result.sent += response.successCount;
      result.failed += response.failureCount;
      response.responses.forEach((item, index) => {
        const code = item.error?.code;
        if (code && INVALID_TOKEN_CODES.has(code)) result.invalidTokens.push(batch[index] ?? '');
      });
    }
    return result;
  }
}
