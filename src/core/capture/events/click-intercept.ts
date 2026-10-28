import { isTextField } from '../dom/element-utils';

const replayed = new WeakSet<Event>();

export function isReplayedClick(event: Event): boolean {
  return replayed.has(event);
}

export function shouldInterceptClick(target: HTMLElement, event: MouseEvent): boolean {
  if (!event.isTrusted || event.shiftKey) return false;
  if (target instanceof HTMLSelectElement || target instanceof HTMLOptionElement) return false;
  if (target.isContentEditable) return false;
  return !isTextField(target);
}

export function replayInit(event: MouseEvent): PointerEventInit {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    detail: event.detail,
    button: event.button,
    buttons: event.buttons,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };
}

/**
 * `target` is the control the step describes; `origin` is the element the user
 * actually clicked inside it. The click is dispatched at `origin` so it bubbles
 * through the same nodes the real one would have: a grid header listens on its
 * label, which a click dispatched at the header itself never passes through.
 */
export function replayClick(target: HTMLElement, origin: Element, init: PointerEventInit): void {
  if (target.isConnected && target.tabIndex >= 0) target.focus();
  const event = new PointerEvent('click', init);
  replayed.add(event);
  (origin.isConnected ? origin : target).dispatchEvent(event);
}
