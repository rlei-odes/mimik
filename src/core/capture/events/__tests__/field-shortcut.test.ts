// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from '@/lib/messaging';
import { type CaptureHandle, startCapture } from '../handlers';

vi.mock('@/lib/messaging', () => ({ sendMessage: vi.fn(), onMessage: vi.fn() }));

vi.mock('@/lib/browser-api', () => ({
  localStorage: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
}));

let handle: CaptureHandle;

function field(label = 'Mitarbeiter'): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'text';
  el.setAttribute('aria-label', label);
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ x: 4, y: 6, top: 6, left: 4, right: 204, bottom: 30, width: 200, height: 24 }),
  });
  document.body.appendChild(el);
  return el;
}

function click(el: Element) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
  Object.defineProperty(event, 'isTrusted', { configurable: true, value: true });
  el.dispatchEvent(event);
}

function keydown(el: Element, key: string, mods: Partial<KeyboardEventInit> = {}) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
}

function type(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The picker the chord opens takes the focus, which is what ends the session. */
function focusAway(el: Element) {
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

async function settle() {
  for (let i = 0; i < 24; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function calls(name: string) {
  return vi.mocked(sendMessage).mock.calls.filter((c) => c[0] === name);
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    setTimeout(() => cb(0), 0);
    return 0;
  });
  vi.mocked(sendMessage).mockClear();
  vi.mocked(sendMessage).mockResolvedValue({ stepId: 'step-1' } as never);
  handle = startCapture('guide-1');
});

afterEach(() => {
  handle.stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('a command chord pressed in a field instead of typing', () => {
  it('rides along with the field step rather than opening one of its own', async () => {
    const el = field();
    click(el);
    await settle();
    keydown(el, 'a', { ctrlKey: true });
    focusAway(el);
    await settle();

    expect(calls('captureStep')).toHaveLength(1);
    expect(calls('captureStep')[0][1]).toMatchObject({ action: 'input' });
    expect(calls('finalizeInputStep')[0][1]).toMatchObject({ shortcut: 'Ctrl+A' });
  });

  it('keeps a chord pressed before the field step came back from the background', async () => {
    const el = field();
    click(el);
    // No settle: starting the step means a screenshot round trip, and in the real
    // case the chord is pressed the moment after the click, well inside it.
    keydown(el, 'a', { ctrlKey: true });
    await settle();
    focusAway(el);
    await settle();

    expect(calls('finalizeInputStep')[0][1]).toMatchObject({ shortcut: 'Ctrl+A' });
  });

  it('does not carry a chord over to the next field the user moves to', async () => {
    const first = field('Mitarbeiter');
    const second = field('Abteilung');
    click(first);
    await settle();
    keydown(first, 'a', { ctrlKey: true });
    click(second);
    await settle();
    focusAway(second);
    await settle();

    const finalized = calls('finalizeInputStep');
    expect(finalized[0][1]).toMatchObject({ shortcut: 'Ctrl+A' });
    expect(finalized[1]?.[1]).toMatchObject({ shortcut: undefined });
  });

  it('reports the chord that was actually pressed', async () => {
    const el = field();
    click(el);
    await settle();
    keydown(el, 'y', { ctrlKey: true });
    focusAway(el);
    await settle();

    expect(calls('finalizeInputStep')[0][1]).toMatchObject({ shortcut: 'Ctrl+Y' });
  });

  it('says nothing about a chord when the field was typed into, since that is the step', async () => {
    const el = field();
    click(el);
    await settle();
    type(el, 'Muster');
    await settle();
    keydown(el, 'a', { ctrlKey: true });
    focusAway(el);
    await settle();

    expect(calls('finalizeInputStep')[0][1]).toMatchObject({ shortcut: undefined });
  });

  it('does not treat ordinary typing as a chord', async () => {
    const el = field();
    click(el);
    await settle();
    keydown(el, 'M');
    focusAway(el);
    await settle();

    expect(calls('finalizeInputStep')[0][1]).toMatchObject({ shortcut: undefined });
    expect(calls('captureStep')).toHaveLength(1);
  });

  it('still records a chord pressed outside a field as its own step', async () => {
    const el = focusable();

    keydown(el, 'a', { ctrlKey: true });
    await settle();

    expect(calls('captureStep')[0][1]).toMatchObject({ action: 'keydown:Ctrl+A' });
  });
});

function focusable(): HTMLDivElement {
  const el = document.createElement('div');
  el.tabIndex = 0;
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 0, top: 0, left: 0, right: 40, bottom: 40, width: 40, height: 40 }),
  });
  document.body.appendChild(el);
  return el;
}

describe('a keystroke outside a field', () => {
  it('records Ctrl+F as one step naming the whole chord, not the Ctrl press before it', async () => {
    const el = focusable();

    keydown(el, 'Control', { ctrlKey: true });
    keydown(el, 'f', { ctrlKey: true });
    await settle();

    expect(calls('captureStep')).toHaveLength(1);
    expect(calls('captureStep')[0][1]).toMatchObject({ action: 'keydown:Ctrl+F' });
  });

  it('records nothing while Ctrl is held on its own', async () => {
    const el = focusable();

    keydown(el, 'Control', { ctrlKey: true });
    for (let i = 0; i < 30; i++) keydown(el, 'Control', { ctrlKey: true, repeat: true });
    await settle();

    expect(calls('captureStep')).toHaveLength(0);
  });

  it('records a held key once', async () => {
    const el = focusable();

    keydown(el, 'ArrowDown');
    for (let i = 0; i < 30; i++) keydown(el, 'ArrowDown', { repeat: true });
    await settle();

    expect(calls('captureStep')).toHaveLength(1);
    expect(calls('captureStep')[0][1]).toMatchObject({ action: 'keydown:ArrowDown' });
  });

  it('leaves copy to the clipboard event', async () => {
    const el = focusable();

    keydown(el, 'c', { ctrlKey: true });
    await settle();

    expect(calls('captureStep')).toHaveLength(0);
  });
});
