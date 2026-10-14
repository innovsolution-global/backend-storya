import fs from 'node:fs';
import path from 'node:path';

import type { ServiceAccount } from 'firebase-admin/app';

import { env, isProduction } from '../../config/env';
import { logger } from '../../config/logger';
import { ConsolePushProvider } from './ConsolePushProvider';
import { FirebasePushProvider } from './FirebasePushProvider';
import type { PushProvider } from './PushProvider';

export type { PushMessage, PushProvider, PushResult } from './PushProvider';
export { ConsolePushProvider } from './ConsolePushProvider';

let provider: PushProvider | undefined;

/** Compte de service Firebase : fichier JSON (FIREBASE_SERVICE_ACCOUNT_PATH) ou contenu (FIREBASE_SERVICE_ACCOUNT_JSON). */
function readServiceAccount(): ServiceAccount | null {
  try {
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON)
      return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
    if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const file = path.resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH);
      return JSON.parse(fs.readFileSync(file, 'utf8')) as ServiceAccount;
    }
  } catch (error) {
    logger.error({ err: error }, 'Compte de service Firebase illisible');
  }
  return null;
}

export function isPushConfigured(): boolean {
  return Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT_PATH);
}

function createProvider(): PushProvider {
  const account = readServiceAccount();
  if (account) return new FirebasePushProvider(account);
  if (isProduction)
    logger.warn('Firebase non configuré : les notifications sont seulement journalisées.');
  return new ConsolePushProvider();
}

export function getPushProvider(): PushProvider {
  provider ??= createProvider();
  return provider;
}

/** Permet de remplacer le fournisseur (tests). */
export function setPushProvider(next: PushProvider): void {
  provider = next;
}
