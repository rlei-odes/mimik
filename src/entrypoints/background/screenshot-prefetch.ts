import { captureVisibleTab } from '@/lib/browser-api';
import { logger } from '@/lib/logger';

/**
 * Menus that close on mouseup are gone roughly 5ms after pointerup, long before a
 * capture triggered by the resulting step could run. The only moment the menu is
 * reliably still on screen is pointerdown, so the content script asks for a frame
 * then and the step redeems it afterwards.
 *
 * `captureVisibleTab` is rate limited to a couple of calls a second, so a prefetch
 * never queues behind another and is dropped rather than retried. Losing one only
 * costs a stale screenshot, which is what would have happened anyway.
 */
const MAX_HELD = 3;
const MAX_AGE_MS = 5000;

interface HeldFrame {
  dataUrl: string;
  capturedAt: number;
}

const held = new Map<string, HeldFrame>();
let inFlight = false;

function evict(now: number): void {
  for (const [id, frame] of held) {
    if (now - frame.capturedAt > MAX_AGE_MS) held.delete(id);
  }
  while (held.size > MAX_HELD) {
    const oldest = held.keys().next();
    if (oldest.done) break;
    held.delete(oldest.value);
  }
}

export async function prefetchScreenshot(prefetchId: string): Promise<boolean> {
  if (inFlight) return false;
  inFlight = true;
  try {
    const dataUrl = await captureVisibleTab('jpeg', 90);
    // Stamp on completion, not on entry: a frame that finished before the overlay
    // detached provably shows it, whenever the underlying grab actually happened.
    const capturedAt = Date.now();
    held.set(prefetchId, { dataUrl, capturedAt });
    evict(capturedAt);
    return true;
  } catch (err) {
    logger.debug('Screenshot prefetch skipped', err);
    return false;
  } finally {
    inFlight = false;
  }
}

/** Redeem a held frame, but only if it was captured before the overlay went away. */
export function redeemPrefetch(prefetchId: string, detachedAt: number): string | undefined {
  const frame = held.get(prefetchId);
  held.delete(prefetchId);
  if (!frame) return undefined;
  if (frame.capturedAt > detachedAt) {
    logger.debug('Prefetched frame landed after the overlay closed, capturing fresh instead');
    return undefined;
  }
  return frame.dataUrl;
}

export function clearPrefetches(): void {
  held.clear();
}
