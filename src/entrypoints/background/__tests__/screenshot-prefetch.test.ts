import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureVisibleTab } from '@/lib/browser-api';
import { clearPrefetches, prefetchScreenshot, redeemPrefetch } from '../screenshot-prefetch';

vi.mock('@/lib/browser-api', () => ({ captureVisibleTab: vi.fn() }));

const START = 1_700_000_000_000;

function at(ms: number) {
  vi.setSystemTime(START + ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  at(0);
  clearPrefetches();
  vi.mocked(captureVisibleTab).mockReset();
  vi.mocked(captureVisibleTab).mockResolvedValue('data:image/jpeg;base64,AAAA');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('redeeming a prefetched frame', () => {
  it('hands back a frame that finished before the overlay closed', async () => {
    await prefetchScreenshot('a');
    expect(redeemPrefetch('a', START + 50)).toBe('data:image/jpeg;base64,AAAA');
  });

  it('refuses a frame that landed after the overlay closed, so a fresh one is taken', async () => {
    at(100);
    await prefetchScreenshot('a');
    expect(redeemPrefetch('a', START + 50)).toBeUndefined();
  });

  it('accepts a frame that landed in the same millisecond as the close', async () => {
    at(50);
    await prefetchScreenshot('a');
    expect(redeemPrefetch('a', START + 50)).toBe('data:image/jpeg;base64,AAAA');
  });

  it('returns nothing for an unknown claim', () => {
    expect(redeemPrefetch('missing', START + 50)).toBeUndefined();
  });

  it('consumes the frame so a replayed claim cannot reuse it', async () => {
    await prefetchScreenshot('a');
    expect(redeemPrefetch('a', START + 50)).toBeDefined();
    expect(redeemPrefetch('a', START + 50)).toBeUndefined();
  });
});

describe('capture quota protection', () => {
  it('drops a prefetch while another is still in flight', async () => {
    let release!: (url: string) => void;
    vi.mocked(captureVisibleTab).mockReturnValueOnce(
      new Promise<string>((resolve) => {
        release = resolve;
      }),
    );

    const first = prefetchScreenshot('a');
    const second = await prefetchScreenshot('b');

    expect(second).toBe(false);
    expect(captureVisibleTab).toHaveBeenCalledTimes(1);

    release('data:image/jpeg;base64,AAAA');
    await first;
  });

  it('never rejects when the capture quota is exceeded', async () => {
    vi.mocked(captureVisibleTab).mockRejectedValue(new Error('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND'));
    await expect(prefetchScreenshot('a')).resolves.toBe(false);
    expect(redeemPrefetch('a', START + 50)).toBeUndefined();
  });

  it('forgets a frame nobody redeemed rather than holding it forever', async () => {
    await prefetchScreenshot('stale');
    at(6000);
    await prefetchScreenshot('fresh');

    expect(redeemPrefetch('stale', START + 6000)).toBeUndefined();
    expect(redeemPrefetch('fresh', START + 6000)).toBeDefined();
  });

  it('keeps only the most recent few frames', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      at(1);
      await prefetchScreenshot(id);
    }
    const kept = ['a', 'b', 'c', 'd', 'e'].filter((id) => redeemPrefetch(id, START + 10) !== undefined);
    expect(kept).toEqual(['c', 'd', 'e']);
  });
});
