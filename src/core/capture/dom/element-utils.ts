/** Roles and tags that identify a control on their own. A match here is trusted outright. */
export const SEMANTIC_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="treeitem"]',
  '[role="gridcell"]',
  '[role="columnheader"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[contenteditable="true"]',
].join(', ');

/**
 * Weaker evidence: a bare `tabindex` says "focusable", not "control". Enterprise UIs
 * hang one on every layout pane, so a match here is only trusted when it is also
 * control-sized — otherwise a click on a tree row resolves to the whole navigator.
 */
export const WEAK_SELECTOR = '[tabindex], [aria-haspopup]';

export const FOCUSABLE_SELECTOR = `${SEMANTIC_SELECTOR}, ${WEAK_SELECTOR}`;

const MAX_ELEMENT_RATIO = 0.8;
const MAX_WEAK_AREA = 250_000;
const MAX_WEAK_RATIO = 0.5;

function labelledControl(el: Element): HTMLElement | null {
  const label = el.closest('label');
  return label instanceof HTMLLabelElement && label.control instanceof HTMLElement ? label.control : null;
}

function shadowHost(el: Element): Element | null {
  const root = el.getRootNode();
  return root instanceof ShadowRoot && root.host instanceof Element ? root.host : null;
}

/** A weak match is only a control if it is small enough to be one. */
function isControlSized(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.width * rect.height > MAX_WEAK_AREA) return false;
  return rect.width / window.innerWidth <= MAX_WEAK_RATIO && rect.height / window.innerHeight <= MAX_WEAK_RATIO;
}

export function findFocusableAncestor(el: Element): HTMLElement {
  let scope: Element | null = el;
  let weak: HTMLElement | null = null;
  while (scope) {
    for (let cursor: Element | null = scope; cursor; cursor = cursor.parentElement) {
      if (!(cursor instanceof HTMLElement)) continue;
      if (cursor.matches(SEMANTIC_SELECTOR)) return cursor;
      if (!weak && cursor.matches(WEAK_SELECTOR) && isControlSized(cursor)) weak = cursor;
    }
    const control = labelledControl(scope);
    if (control) return control;
    scope = shadowHost(scope);
  }
  if (weak) return weak;
  if (el instanceof HTMLElement) return el;
  let parent: Element | null = el.parentElement;
  while (parent && !(parent instanceof HTMLElement)) {
    parent = parent.parentElement;
  }
  return (parent as HTMLElement) ?? document.body;
}

export function isTextField(el: Element): boolean {
  // A readonly input is a picker's display slot, not somewhere the user types into.
  // Treating one as a text field opens an input session that waits for keystrokes
  // that never arrive, and the step reads as typing rather than a selection.
  if (el instanceof HTMLInputElement) {
    if (el.readOnly || el.disabled) return false;
    return ['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(el.type);
  }
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  return el instanceof HTMLElement && el.isContentEditable;
}

export function isNavigatingClick(el: HTMLElement): boolean {
  const anchor = el.closest('a[href]');
  if (!anchor) return false;
  const href = anchor.getAttribute('href');
  return !(!href || href === '#' || href.startsWith('javascript:'));
}

export function isTooLarge(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width / window.innerWidth > MAX_ELEMENT_RATIO || rect.height / window.innerHeight > MAX_ELEMENT_RATIO;
}

export function isMimikElement(el: Element): boolean {
  return !!el.closest('[data-mimik-ignore]');
}

export function isSensitiveField(el: Element | null): boolean {
  return el instanceof HTMLInputElement && el.type === 'password';
}

export function isRedactedField(el: Element | null): boolean {
  return el instanceof Element && !!el.closest('[data-mimik-blur]');
}

export function eventTarget(e: Event): Element | null {
  const inner = e.composedPath?.()[0];
  if (inner instanceof Element) return inner;
  return e.target instanceof Element ? e.target : null;
}

export function getFieldValue(el: HTMLElement): string {
  if (isSensitiveField(el)) return '';
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  if (el.isContentEditable) return el.textContent?.trim() ?? '';
  return '';
}

function meaningfulLabel(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed || !/[a-z0-9]/i.test(trimmed)) return null;
  return (
    trimmed
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /[a-z0-9]/i.test(line)) ?? null
  );
}

function slottedLabel(el: Element): string | null {
  const host = shadowHost(el);
  if (!host) return null;
  return (
    meaningfulLabel(host.getAttribute('aria-label')) ??
    meaningfulLabel(host.getAttribute('label')) ??
    meaningfulLabel((host as HTMLElement).textContent)
  );
}

/**
 * The readable name of a field, or null when the page gives it none. Kept separate
 * from `getFieldLabel` so callers that can cope without one — a step description
 * has other things to fall back on — are not handed the generic placeholder.
 */
export function findFieldLabel(el: HTMLElement): string | null {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const labels = el.labels;
    if (labels && labels.length > 0) {
      const labelText = meaningfulLabel(labels[0].innerText);
      if (labelText) return labelText;
    }
  }

  const slotted = slottedLabel(el);
  if (slotted) return slotted;

  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) {
      const labelText = meaningfulLabel((label as HTMLElement).innerText);
      if (labelText) return labelText;
    }
  }

  const parentLabel = el.closest('label');
  if (parentLabel) {
    const labelText = meaningfulLabel(parentLabel.innerText);
    if (labelText) return labelText;
  }

  const name = el.getAttribute('name');
  if (name && !/[-_]test|[-_]id|[-_]key/i.test(name)) return name;

  return null;
}

export function getFieldLabel(el: HTMLElement): string {
  return findFieldLabel(el) ?? 'text field';
}
