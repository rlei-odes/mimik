import PQueue from 'p-queue';
import { DEFAULT_TARGET_COLOR } from '@/core/screenshot/types';
import { localStorage } from '@/lib/browser-api';
import { HoverRing } from '@/lib/hover-ring';
import { logger } from '@/lib/logger';
import { type PrefetchClaim, sendMessage } from '@/lib/messaging';
import { extractDOMContext } from '../dom/context';
import { extractElementMeta, freezeRect } from '../dom/element-meta';
import {
  eventTarget,
  findFocusableAncestor,
  isMimikElement,
  isNavigatingClick,
  isSensitiveField,
  isTextField,
  isTooLarge,
} from '../dom/element-utils';
import { TransientOverlays } from '../dom/transient';
import { isReplayedClick, replayClick, replayInit, shouldInterceptClick } from './click-intercept';
import { InputSession } from './input-session';

const DEDUP_MS = 300;
const DRAG_MIN_PX = 30;
const INTERCEPT_DELAY_MS = 100;
/**
 * How long to wait after `pointerup` before assuming no `click` is coming. A real
 * click lands in the same task as `mouseup`, so this only needs to clear the turn.
 * Kept under DEDUP_MS so a late click still dedups against the fallback.
 */
const NO_CLICK_MS = 150;
const PAINT_FRAMES = 3;
const CAPTURE_BUDGET_MS = 2500;
const EMBED_TAGS = new Set(['IFRAME', 'EMBED', 'OBJECT']);
const EMBED_SELECTOR = 'iframe, embed, object';

function focusInEmbed(): boolean {
  const active = document.activeElement;
  return !!active && EMBED_TAGS.has(active.tagName);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    let remaining = PAINT_FRAMES;
    const tick = () => {
      if (--remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

let lastClickTarget: Element | null = null;
let lastClickTime = 0;

export interface CaptureHandle {
  stop: () => void;
}

const PASSIVE_CAPTURE = { capture: true, passive: true } as const;
const ACTIVE_CAPTURE = { capture: true } as const;

class CaptureController {
  private input: InputSession;
  private queue = new PQueue({ concurrency: 1 });
  private listeners: [string, EventListener, AddEventListenerOptions][] = [];
  private dragStartX: number | null = null;
  private dragStartY: number | null = null;
  private dragStartElement: Element | null = null;
  private ring = new HoverRing(DEFAULT_TARGET_COLOR);
  private hovered: HTMLElement | null = null;
  private busy = false;
  private noClickTimer: ReturnType<typeof setTimeout> | null = null;
  private overlays = new TransientOverlays();
  private prefetchId: string | null = null;

  constructor(
    private guideId: string,
    isTopFrame: boolean,
  ) {
    this.input = new InputSession(guideId);
    this.listeners = [
      ['click', this.onClick.bind(this), ACTIVE_CAPTURE],
      ['auxclick', this.onAuxClick.bind(this), ACTIVE_CAPTURE],
      ['keydown', this.onKeydown.bind(this), ACTIVE_CAPTURE],
      ['input', this.onInput.bind(this), PASSIVE_CAPTURE],
      ['focusout', this.onFocusOut.bind(this), PASSIVE_CAPTURE],
    ];
    if (isTopFrame) {
      this.listeners.push(
        ['copy', this.onClipboard.bind(this), PASSIVE_CAPTURE],
        ['paste', this.onClipboard.bind(this), PASSIVE_CAPTURE],
        ['cut', this.onClipboard.bind(this), PASSIVE_CAPTURE],
        ['pointerdown', this.onPointerDown.bind(this), PASSIVE_CAPTURE],
        ['pointerup', this.onPointerUp.bind(this), PASSIVE_CAPTURE],
        ['dragend', this.onDragEnd.bind(this), PASSIVE_CAPTURE],
        ['mouseover', this.onMouseOver.bind(this), PASSIVE_CAPTURE],
        ['mouseout', this.onMouseOut.bind(this), PASSIVE_CAPTURE],
      );
      this.overlays.start();
      localStorage
        .get(['targetColor'])
        .then(({ targetColor }) => {
          if (typeof targetColor === 'string' && targetColor) this.ring.setColor(targetColor);
        })
        .catch(() => {});
    }
    for (const [event, handler, opts] of this.listeners) {
      window.addEventListener(event, handler, opts);
    }
  }

  private capture(action: string, target: HTMLElement, point?: { x: number; y: number }) {
    const atEvent = freezeRect(target);
    return async () => {
      const elementMeta = extractElementMeta(target, atEvent);
      await sendMessage('captureStep', {
        guideId: this.guideId,
        action,
        elementMeta: point ? { ...elementMeta, clickPoint: point } : elementMeta,
        domContext: extractDOMContext(target, action),
      });
    };
  }

  /**
   * Same payload as `capture`, but read out now rather than when the queue runs it.
   * The fallback path targets elements that are about to leave the DOM, and a
   * detached node yields a zero rect and no surrounding context.
   */
  private captureSnapshot(
    action: string,
    target: HTMLElement,
    point: { x: number; y: number },
    prefetch?: () => PrefetchClaim | undefined,
  ) {
    const elementMeta = { ...extractElementMeta(target, freezeRect(target)), clickPoint: point };
    const domContext = extractDOMContext(target, action);
    return async () => {
      await sendMessage('captureStep', {
        guideId: this.guideId,
        action,
        elementMeta,
        domContext,
        prefetch: prefetch?.(),
      });
    };
  }

  /**
   * Ask the background for a frame now, while the overlay under the pointer is still
   * up. Fire-and-forget: the step redeems it later, and only if it can prove the
   * frame predates the overlay closing.
   */
  private armPrefetch(raw: Element) {
    this.prefetchId = null;
    const overlay = this.overlays.find(raw);
    if (!overlay) return;
    const prefetchId = crypto.randomUUID();
    this.prefetchId = prefetchId;
    this.overlays.watch(overlay);
    void sendMessage('prefetchScreenshot', { prefetchId }).catch(() => {});
  }

  private claimPrefetch(prefetchId: string | null): PrefetchClaim | undefined {
    if (!prefetchId) return undefined;
    const detachedAt = this.overlays.detachTime;
    return detachedAt === null ? undefined : { id: prefetchId, detachedAt };
  }

  private enqueue(task: () => Promise<unknown>) {
    this.busy = true;
    this.ring.hide();
    this.queue.add(async () => {
      await waitForPaint();
      await task();
    });
    this.queue.onIdle().then(() => {
      this.busy = false;
      if (this.hovered?.isConnected && !focusInEmbed()) this.ring.show(this.hovered);
    });
  }

  private hoverTarget(raw: EventTarget | null): HTMLElement | null {
    if (!(raw instanceof Element) || isMimikElement(raw)) return null;
    const target = findFocusableAncestor(raw);
    if (target === document.body || target === document.documentElement) return null;
    if (EMBED_TAGS.has(target.tagName) || isTooLarge(target)) return null;
    if (target.querySelector(EMBED_SELECTOR)) return null;
    return target;
  }

  private onMouseOver(e: Event) {
    const target = this.hoverTarget(eventTarget(e));
    if (target === this.hovered) return;
    this.hovered = target;
    if (this.busy) return;
    if (target && !focusInEmbed()) this.ring.show(target);
    else this.ring.hide();
  }

  private onMouseOut(e: Event) {
    const related = (e as MouseEvent).relatedTarget;
    if (related instanceof Element && this.hovered?.contains(related)) return;
    this.hovered = null;
    this.ring.hide();
  }

  /**
   * Menus that tear the chosen item out of the DOM on `mouseup` leave the browser
   * with no connected common ancestor, so it never dispatches `click` and the
   * action goes unrecorded. Snapshot the target while it is still there and
   * capture it only if no click arrives.
   */
  private scheduleNoClickFallback(pe: PointerEvent, raw: Element) {
    const target = findFocusableAncestor(raw);
    if (isMimikElement(target) || isTextField(target) || !target.isConnected) return;
    const prefetchId = this.prefetchId;
    const task = this.captureSnapshot('click', target, { x: pe.clientX, y: pe.clientY }, () =>
      this.claimPrefetch(prefetchId),
    );
    this.clearNoClickFallback();
    this.noClickTimer = setTimeout(() => {
      this.noClickTimer = null;
      const now = Date.now();
      if (target === lastClickTarget && now - lastClickTime < DEDUP_MS) return;
      lastClickTarget = target;
      lastClickTime = now;
      this.enqueue(task);
    }, NO_CLICK_MS);
  }

  private clearNoClickFallback() {
    if (this.noClickTimer === null) return;
    clearTimeout(this.noClickTimer);
    this.noClickTimer = null;
  }

  private onClick(e: Event) {
    // A click arrived, so the pointerup fallback must not also fire. Do this before
    // any early return below — every one of them still means a click was dispatched.
    this.clearNoClickFallback();
    const me = e as MouseEvent;
    const raw = eventTarget(me);
    if (!raw || !(raw instanceof Element) || isReplayedClick(me) || me.shiftKey) return;
    const target = findFocusableAncestor(raw);
    if (isMimikElement(target)) return;

    const now = Date.now();
    if (target === lastClickTarget && now - lastClickTime < DEDUP_MS) return;
    lastClickTarget = target;
    lastClickTime = now;

    if (isTextField(target)) {
      const atEvent = freezeRect(target);
      this.enqueue(async () => {
        if (this.input.active && this.input.target !== target) await this.input.finalize();
        if (!this.input.active) await this.input.start(target, atEvent);
      });
      return;
    }

    if (isNavigatingClick(target)) {
      me.preventDefault();
      me.stopImmediatePropagation();
      this.enqueue(this.capture('click', target, { x: me.clientX, y: me.clientY }));
      const anchor = target.closest('a[href]') as HTMLAnchorElement;
      if (anchor) {
        const href = anchor.href;
        requestAnimationFrame(() =>
          setTimeout(() => {
            window.location.href = href;
          }, INTERCEPT_DELAY_MS),
        );
      }
      return;
    }

    const task = this.capture('click', target, { x: me.clientX, y: me.clientY });

    if (!shouldInterceptClick(target, me)) {
      this.enqueue(task);
      return;
    }

    me.preventDefault();
    me.stopImmediatePropagation();
    const init = replayInit(me);
    this.enqueue(async () => {
      try {
        await Promise.race([task(), sleep(CAPTURE_BUDGET_MS)]);
      } catch (err) {
        logger.warn('Capture failed, replaying the click anyway', err);
      } finally {
        replayClick(target, init);
      }
    });
  }

  private onAuxClick(e: Event) {
    const raw = eventTarget(e);
    if (!raw || !(raw instanceof Element)) return;
    const target = findFocusableAncestor(raw);
    if (isMimikElement(target)) return;
    this.enqueue(this.capture('auxclick', target, { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY }));
  }

  private onKeydown(e: Event) {
    const ke = e as KeyboardEvent;
    const resolved = eventTarget(ke);
    const target = resolved instanceof HTMLElement ? resolved : document.activeElement;
    if (!target || !(target instanceof HTMLElement) || isMimikElement(target)) return;

    if (this.input.active && (ke.key === 'Enter' || ke.key === 'Escape')) {
      this.enqueue(() => this.input.finalize());
      return;
    }

    if (isSensitiveField(target) || isTextField(target)) return;
    this.enqueue(this.capture(`keydown:${ke.key}`, target));
  }

  private onInput(e: Event) {
    const target = eventTarget(e);
    if (!target || !(target instanceof HTMLElement)) return;
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      )
    )
      return;

    if (target instanceof HTMLSelectElement) {
      this.enqueue(this.capture('input', target));
      return;
    }

    if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) return;

    if (this.input.active && this.input.target !== target) {
      this.enqueue(() => this.input.finalize());
    }

    if (!this.input.active) {
      this.enqueue(() => this.input.start(target));
    } else {
      this.input.update(target);
    }
  }

  private onFocusOut(e: Event) {
    if (!this.input.active) return;
    const related = (e as FocusEvent).relatedTarget;
    if (related instanceof Element && related === this.input.target) return;
    this.enqueue(() => this.input.finalize());
  }

  private onClipboard(e: Event) {
    const resolved = eventTarget(e);
    const target = resolved instanceof HTMLElement ? resolved : document.activeElement;
    if (!target || !(target instanceof HTMLElement) || isMimikElement(target)) return;
    this.enqueue(this.capture(e.type, target));
  }

  private onPointerDown(e: Event) {
    this.ring.hide();
    const pe = e as PointerEvent;
    this.dragStartX = pe.pageX;
    this.dragStartY = pe.pageY;
    this.dragStartElement = eventTarget(pe);
    if (pe.button === 0 && this.dragStartElement) this.armPrefetch(this.dragStartElement);
  }

  private onPointerUp(e: Event) {
    const pe = e as PointerEvent;
    if (this.dragStartX == null || this.dragStartY == null || !this.dragStartElement) {
      this.dragStartX = this.dragStartY = null;
      this.dragStartElement = null;
      return;
    }

    const dx = Math.abs(pe.pageX - this.dragStartX);
    const dy = Math.abs(pe.pageY - this.dragStartY);

    if (dx >= DRAG_MIN_PX || dy >= DRAG_MIN_PX) {
      const target = findFocusableAncestor(this.dragStartElement);
      if (!isMimikElement(target)) this.enqueue(this.capture('drag', target));
    } else if (pe.button === 0) {
      const raw = eventTarget(pe);
      if (raw) this.scheduleNoClickFallback(pe, raw);
    }

    this.dragStartX = this.dragStartY = null;
    this.dragStartElement = null;
  }

  private onDragEnd(e: Event) {
    const target = eventTarget(e);
    if (!target || isMimikElement(target)) return;
    this.enqueue(this.capture('drag', findFocusableAncestor(target)));
  }

  stop() {
    this.clearNoClickFallback();
    this.overlays.stop();
    for (const [event, handler, opts] of this.listeners) {
      window.removeEventListener(event, handler, opts);
    }
    this.hovered = null;
    this.ring.dispose();
    this.queue.add(() => this.input.finalize());
  }
}

export function startCapture(guideId: string, isTopFrame = true): CaptureHandle {
  const controller = new CaptureController(guideId, isTopFrame);
  return {
    stop: () => controller.stop(),
  };
}
