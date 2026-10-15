import type { Settings } from '@/core/guides/types';
import { localStorage } from '@/lib/browser-api';
import { logger } from '@/lib/logger';
import { type AIApiKeys, migrateApiKeys } from './keys';
import { type AIProviderKey, providerOrDefault } from './models';

/**
 * Settings this fork ships preconfigured, so a colleague handed the zip does not
 * have to type the internal endpoint and model in by hand before Mimik can write
 * anything. Every one of them stays editable in Settings afterwards.
 *
 * Leave a value empty and it is simply not seeded, so filling in only some of them
 * is safe.
 */
export const FORK_AI_DEFAULTS: Partial<Settings> = {
  aiProvider: 'openai',
  aiBaseUrl: 'http://192.168.129.190:8000/v1',
  aiModel: 'RedHatAI/gemma-4-26B-A4B-it-FP8-Dynamic',
};

/**
 * A placeholder, not a credential: the internal server checks no key, and the
 * settings UI refuses to proceed without something in the field.
 *
 * Never put a real key here. This file ships inside every zip, readable by anyone
 * the build is passed on to, and a key baked into an installed build cannot be
 * rotated out. A real key belongs in each person's own Settings.
 */
export const FORK_AI_PLACEHOLDER_KEY = 'abc';

const SEEDED_KEYS = ['aiProvider', 'aiBaseUrl', 'aiModel'] as const;

/** The stored keys with ours added, or null when the provider already has one. */
function withSeededKey(stored: AIApiKeys, provider: AIProviderKey): AIApiKeys | null {
  if (stored[provider] || !FORK_AI_PLACEHOLDER_KEY) return null;
  return { ...stored, [provider]: FORK_AI_PLACEHOLDER_KEY };
}

/**
 * Writes the shipped defaults for keys the user has not set.
 *
 * Runs on update as well as on install, because a colleague reloading an unpacked
 * build is not always reported as a fresh install. It is idempotent: a value that
 * is already there is never overwritten, so nobody's own endpoint or key is
 * replaced by ours the next time they upgrade.
 */
export async function seedForkDefaults(): Promise<void> {
  try {
    const stored = await localStorage.get([...SEEDED_KEYS, 'aiApiKeys', 'aiApiKey']);
    const missing: Partial<Settings> = {};

    for (const key of SEEDED_KEYS) {
      const shipped = FORK_AI_DEFAULTS[key];
      if (typeof shipped !== 'string' || shipped === '') continue;
      const current = stored[key];
      if (typeof current === 'string' && current !== '') continue;
      // Every seeded key holds a string; the cast only escapes the per-key unions,
      // and the value came straight out of the typed constant above.
      (missing as Record<string, string>)[key] = shipped;
    }

    const provider = providerOrDefault(missing.aiProvider ?? stored.aiProvider);
    const keys = withSeededKey(migrateApiKeys(stored), provider);
    if (keys) missing.aiApiKeys = keys;

    if (Object.keys(missing).length > 0) await localStorage.set(missing);
  } catch (err) {
    logger.warn('Could not seed the shipped AI defaults', err);
  }
}
