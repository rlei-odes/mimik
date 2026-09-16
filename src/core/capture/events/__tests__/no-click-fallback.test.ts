// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from '@/lib/messaging';
import { type CaptureHandle, startCapture } from '../handlers';

vi.mock('@/lib/messaging', () => ({ sendMessage: vi.fn(), onMessage: vi.fn() }));

vi.mock('@/lib/browser-api', () => ({
  localStorage: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
}));

let handle: CaptureHandle;

function place(tag: string): HTMLElement {
  const el = document.createElement(tag);
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ x: 4, y: 6, top: 6, left: 4, right: 124, bottom: 46, width: 120, height: 40 }),
  });
  document.body.appendChild(el);
  return el;
}

interface PointerOpts {
  pageX?: number;
  pageY?: number;
  button?: number;
}

function pointer(el: Element, type: 'pointerdown' | 'pointerup', opts: PointerOpts = {}) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, button: opts.button ?? 0 });
  Object.defineProperty(event, 'isTrusted', { configurable: true, value: true });
  Object.defineProperty(event, 'pageX', { configurable: true, value: opts.pageX ?? 10 });
  Object.defineProperty(event, 'pageY', { configurable: true, value: opts.pageY ?? 20 });
  Object.defineProperty(event, 'clientX', { configurable: true, value: opts.pageX ?? 10 });
  Object.defineProperty(event, 'clientY', { configurable: true, value: opts.pageY ?? 20 });
  el.dispatchEvent(event);
}

function userClick(el: Element) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
  Object.defineProperty(event, 'isTrusted', { configurable: true, value: true });
  el.dispatchEvent(event);
}

/** Longer than NO_CLICK_MS, so the fallback has either fired or been cancelled. */
async function pastFallback() {
  await new Promise((resolve) => setTimeout(resolve, 220));
  for (let i = 0; i < 16; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function steps() {
  return vi.mocked(sendMessage).mock.calls.filter((c) => c[0] === 'captureStep');
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

describe('pointerup fallback for interactions that never fire a click', () => {
  it('records a menu item whose dropdown tears itself down on mouseup', async () => {
    const item = place('div');
    item.tabIndex = -1;
    item.textContent = 'Save';
    // The browser withholds `click` because the item is gone before mouseup settles.
    item.addEventListener('mouseup', () => item.remove());

    pointer(item, 'pointerdown');
    pointer(item, 'pointerup');
    item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await pastFallback();

    expect(steps()).toHaveLength(1);
    expect(steps()[0][1]).toMatchObject({ action: 'click' });
  });

  it('keeps the element details that would be lost once it detaches', async () => {
    const item = place('div');
    item.tabIndex = -1;
    item.setAttribute('aria-label', 'Print preview');
    item.addEventListener('mouseup', () => item.remove());

    pointer(item, 'pointerdown');
    pointer(item, 'pointerup');
    item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await pastFallback();

    expect(steps()[0][1]).toMatchObject({
      elementMeta: expect.objectContaining({
        ariaLabel: 'Print preview',
        rect: expect.objectContaining({ width: 120 }),
      }),
    });
  });

  it('does not double-record an ordinary click that does fire', async () => {
    const button = place('button');

    pointer(button, 'pointerdown');
    pointer(button, 'pointerup');
    userClick(button);
    await pastFallback();

    expect(steps()).toHaveLength(1);
  });

  it('leaves a drag as a single drag step', async () => {
    const box = place('div');
    box.tabIndex = -1;

    pointer(box, 'pointerdown', { pageX: 0, pageY: 0 });
    pointer(box, 'pointerup', { pageX: 100, pageY: 0 });
    await pastFallback();

    expect(steps()).toHaveLength(1);
    expect(steps()[0][1]).toMatchObject({ action: 'drag' });
  });

  it('ignores a secondary-button press, which auxclick already covers', async () => {
    const box = place('div');
    box.tabIndex = -1;

    pointer(box, 'pointerdown', { button: 2 });
    pointer(box, 'pointerup', { button: 2 });
    await pastFallback();

    expect(steps()).toHaveLength(0);
  });

  it('leaves a text field to the typing session', async () => {
    const field = place('input');

    pointer(field, 'pointerdown');
    pointer(field, 'pointerup');
    await pastFallback();

    expect(steps()).toHaveLength(0);
  });

  it('claims the pointerdown screenshot when the item sat in a just-opened menu', async () => {
    const popup = place('div');
    const item = document.createElement('div');
    item.tabIndex = -1;
    Object.defineProperty(item, 'getBoundingClientRect', {
      value: () => ({ x: 4, y: 6, top: 6, left: 4, right: 124, bottom: 46, width: 120, height: 40 }),
    });
    popup.appendChild(item);
    document.body.appendChild(popup);
    await new Promise((resolve) => setTimeout(resolve, 0));

    pointer(item, 'pointerdown');
    pointer(item, 'pointerup');
    popup.remove();
    await pastFallback();

    expect(vi.mocked(sendMessage).mock.calls.some((c) => c[0] === 'prefetchScreenshot')).toBe(true);
    expect(steps()[0][1]).toMatchObject({
      prefetch: expect.objectContaining({ id: expect.any(String), detachedAt: expect.any(Number) }),
    });
  });

  it('sends no claim for an ordinary control that was already on the page', async () => {
    const item = place('div');
    item.tabIndex = -1;
    item.addEventListener('mouseup', () => item.remove());

    pointer(item, 'pointerdown');
    pointer(item, 'pointerup');
    item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await pastFallback();

    expect(vi.mocked(sendMessage).mock.calls.some((c) => c[0] === 'prefetchScreenshot')).toBe(false);
    expect(steps()[0][1]).toMatchObject({ prefetch: undefined });
  });

  it('records nothing once capture has stopped', async () => {
    const item = place('div');
    item.tabIndex = -1;

    pointer(item, 'pointerdown');
    pointer(item, 'pointerup');
    handle.stop();
    await pastFallback();

    expect(steps()).toHaveLength(0);
  });
});
