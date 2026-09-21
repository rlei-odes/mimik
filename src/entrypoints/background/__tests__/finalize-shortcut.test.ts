import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElementMeta } from '@/core/guides/types';
import { captureVisibleTab } from '@/lib/browser-api';
import { queueDescription } from '../description-queue';
import { handleFinalizeInputStep } from '../step-pipeline';

const update = vi.fn();

vi.mock('@/lib/browser-api', () => ({
  captureVisibleTab: vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA'),
  localStorage: { get: vi.fn().mockResolvedValue({}) },
}));

vi.mock('@/core/guides/db', () => ({
  db: { steps: { update: (...args: unknown[]) => update(...args), get: vi.fn().mockResolvedValue({ guideId: 'g1' }) } },
}));

vi.mock('@/core/guides/service', () => ({
  addStepToGuide: vi.fn(),
  clearStepAiPending: vi.fn(),
  createStep: vi.fn(),
  saveScreenshot: vi.fn(),
  updateStepDescription: vi.fn(),
}));

vi.mock('../description-queue', () => ({ queueDescription: vi.fn() }));
vi.mock('../actor', () => ({ getActor: vi.fn() }));
vi.mock('../voice', () => ({ flushNarrationForStep: vi.fn(), getVoiceUpdate: () => ({ phase: 'idle' }) }));
vi.mock('@/core/capture/ai/keys', () => ({
  AI_KEY_SETTINGS: [],
  resolveAiKey: () => ({ apiKey: 'sk-test' }),
}));

function meta(): ElementMeta {
  return {
    tag: 'input',
    cssSelector: 'input#nr',
    textContent: null,
    ariaLabel: 'Mitarbeiter',
    placeholder: null,
    altText: null,
    name: null,
    role: 'input',
    href: null,
    inputType: 'text',
    fieldLabel: 'Mitarbeiter',
    dataTestId: null,
    rect: { x: 0, y: 0, width: 200, height: 24 },
    devicePixelRatio: 1,
  };
}

beforeEach(() => {
  update.mockReset();
  vi.mocked(captureVisibleTab).mockClear();
  vi.mocked(queueDescription).mockClear();
});

describe('finalizing a field step that ended in a shortcut', () => {
  it('keeps the screenshot taken when the field was clicked', async () => {
    await handleFinalizeInputStep('s1', meta(), undefined, 'Ctrl+A');

    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(update.mock.calls[0][1]).not.toHaveProperty('screenshotId');
  });

  it('writes the field and the chord into the step', async () => {
    await handleFinalizeInputStep('s1', meta(), undefined, 'Ctrl+A');

    expect(update.mock.calls[0][1]).toMatchObject({
      description: 'steps.shortcutInField[Mitarbeiter,Ctrl+A]',
      descriptionSource: 'heuristic',
    });
  });

  it('spends no AI call on a sentence it already knows in full', async () => {
    await handleFinalizeInputStep('s1', meta(), { target: {} } as never, 'Ctrl+A');

    expect(queueDescription).not.toHaveBeenCalled();
  });

  it('still re-shoots and describes an ordinary typing step', async () => {
    await handleFinalizeInputStep('s1', meta(), { target: {} } as never);

    expect(captureVisibleTab).toHaveBeenCalled();
    expect(queueDescription).toHaveBeenCalled();
  });
});
