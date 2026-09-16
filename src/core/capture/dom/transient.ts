/**
 * Tracks subtrees that appeared as a result of the previous interaction — menus,
 * dropdowns, autocomplete lists, context menus. Pressing something inside one is
 * the case where the page tears the element out on mouseup and the browser never
 * dispatches a click, so the screenshot has to be taken early to show anything.
 *
 * The test is deliberately structural rather than class- or role-based: an overlay
 * is simply a recently inserted element small enough not to be a page re-render.
 * A false positive costs one discarded screenshot, never a wrong one.
 */
const FRESH_MS = 60_000;
const MAX_OVERLAY_RATIO = 0.8;
const POSITIONED = new Set(['absolute', 'fixed']);

export class TransientOverlays {
  private insertedAt = new WeakMap<Element, number>();
  private observer: MutationObserver | null = null;
  private watched: Element | null = null;
  private detachedAt: number | null = null;

  start(): void {
    if (this.observer) return;
    this.observer = new MutationObserver((records) => {
      const now = Date.now();
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) this.insertedAt.set(node, now);
        }
      }
      // Checked against the watched element itself rather than the removed nodes,
      // so it holds however deep in the tree the removal happened.
      if (this.watched && this.detachedAt === null && !this.watched.isConnected) {
        this.detachedAt = now;
      }
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.watched = null;
    this.detachedAt = null;
  }

  /**
   * Outermost recently-inserted ancestor that is overlay-shaped, or null. Outermost
   * rather than nearest because that is the element the page removes as a unit.
   */
  find(el: Element): Element | null {
    const now = Date.now();
    let overlay: Element | null = null;
    for (let cursor: Element | null = el; cursor; cursor = cursor.parentElement) {
      const at = this.insertedAt.get(cursor);
      if (at === undefined || now - at > FRESH_MS) continue;
      const rect = cursor.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.width / window.innerWidth > MAX_OVERLAY_RATIO) continue;
      if (rect.height / window.innerHeight > MAX_OVERLAY_RATIO) continue;
      // Being newly inserted is not enough: an app re-renders ordinary controls all
      // the time. An overlay floats over the page, which means it left the flow.
      if (!POSITIONED.has(getComputedStyle(cursor).position)) continue;
      overlay = cursor;
    }
    return overlay;
  }

  watch(el: Element): void {
    this.watched = el;
    this.detachedAt = null;
  }

  /** When the watched overlay left the DOM, or null while it is still there. */
  get detachTime(): number | null {
    if (this.watched && this.detachedAt === null && !this.watched.isConnected) {
      this.detachedAt = Date.now();
    }
    return this.detachedAt;
  }
}
