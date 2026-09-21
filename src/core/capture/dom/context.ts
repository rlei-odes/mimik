import { isRedactedField, SEMANTIC_SELECTOR } from './element-utils';
import { findIconHint, findTooltipLabel, type IconHint } from './icon-label';

export interface SiblingElement {
  tag: string;
  role: string | null;
  name: string | null;
  value: string | null;
}

export interface DOMContext {
  page: { title: string; path: string };
  container: { tag: string; role: string | null; label: string | null } | null;
  heading: string | null;
  siblings: SiblingElement[];
  target: {
    tag: string;
    role: string | null;
    name: string | null;
    value: string | null;
    action: string;
    /** What the pictogram shows, when the control is an icon the page never names. */
    icon?: IconHint | null;
  };
}

const SEMANTIC_CONTAINERS = new Set([
  'form',
  'nav',
  'dialog',
  'section',
  'main',
  'aside',
  'header',
  'footer',
  'article',
]);

const INTERACTIVE_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])';

const MAX_WALK_UP = 3;
const MAX_SIBLINGS = 10;

/**
 * Names a control the way a reader sees it. Apps routinely build buttons and menu
 * entries out of bare divs, and handing the raw tag to the model produced steps like
 * 'Click the div "Download"' — a reader has no idea what a div is.
 */
const ROLE_KINDS: Record<string, string> = {
  button: 'button',
  link: 'link',
  tab: 'tab',
  menuitem: 'menu item',
  menuitemcheckbox: 'menu item',
  menuitemradio: 'menu item',
  menu: 'menu',
  checkbox: 'checkbox',
  radio: 'radio button',
  switch: 'toggle',
  option: 'option',
  combobox: 'dropdown',
  listbox: 'list',
  treeitem: 'tree item',
  tree: 'tree',
  gridcell: 'cell',
  columnheader: 'column header',
  row: 'row',
  dialog: 'dialog',
  searchbox: 'search field',
  textbox: 'text field',
  spinbutton: 'number field',
  slider: 'slider',
  tabpanel: 'panel',
};

const TAG_KINDS: Record<string, string> = {
  button: 'button',
  a: 'link',
  select: 'dropdown',
  textarea: 'text field',
  summary: 'expander',
  form: 'form',
  nav: 'navigation',
  dialog: 'dialog',
  table: 'table',
  li: 'list item',
};

export function controlKind(tag: string, role: string | null): string | null {
  if (role && ROLE_KINDS[role]) return ROLE_KINDS[role];
  if (TAG_KINDS[tag]) return TAG_KINDS[tag];
  if (tag === 'input') return 'field';
  // A div or span says nothing a reader would recognise, so say nothing.
  return role ?? null;
}

function describeControl(tag: string, role: string | null, name: string | null): string {
  const kind = controlKind(tag, role);
  const label = name ? `"${name}"` : '';
  if (kind && label) return `${kind} ${label}`;
  return kind || label || 'control';
}

function textOf(el: Element | null): string | null {
  return el?.textContent?.trim() || null;
}

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name) || null;
}

/**
 * Enterprise widget kits build every control out of bare divs and record the kind in
 * the class list rather than in a role — `sc-button p-button btn_update`. Without
 * this the reader is told to click "Bearbeiten" and never learns that Bearbeiten is
 * a button. Matched in order, specific before general.
 */
const CLASS_ROLES: Array<[string, RegExp]> = [
  ['checkbox', /\bcheckbox\b/],
  ['radio', /\bradio(button)?\b/],
  ['menuitem', /\bmenuitem\b/],
  ['combobox', /\b(combobox|dropdown)\b/],
  ['tab', /\btab\b/],
  ['button', /\b(button|btn)\b/],
];

/**
 * Words that mark the box those controls sit in rather than a control. A toolbar is
 * routinely classed `button-bar`, and calling it a button would name the whole strip.
 */
const CONTAINER_WORDS = /\b(group|bar|toolbar|container|panel|frame|wrapper|list|row|grid|menu|nav)\b/;

function roleFromClass(el: Element): string | null {
  const words = attr(el, 'class')
    ?.replace(/[^a-z0-9]+/gi, ' ')
    .toLowerCase();
  if (!words || CONTAINER_WORDS.test(words)) return null;
  return CLASS_ROLES.find(([, pattern]) => pattern.test(words))?.[0] ?? null;
}

/** The role the page declares, or the one its class list gives away. */
function roleOf(el: Element): string | null {
  return attr(el, 'role') ?? roleFromClass(el);
}

function resolveAriaLabelledBy(el: Element): string | null {
  const ids = attr(el, 'aria-labelledby');
  if (!ids) return null;
  return (
    ids
      .split(/\s+/)
      .map((id) => textOf(document.getElementById(id)))
      .filter(Boolean)
      .join(' ') || null
  );
}

function getLabelForInput(el: Element): string | null {
  const id = el.id;
  if (id) {
    const label = textOf(document.querySelector(`label[for="${CSS.escape(id)}"]`));
    if (label) return label;
  }
  const parentLabel = el.closest('label');
  if (!parentLabel) return null;
  const clone = parentLabel.cloneNode(true) as HTMLElement;
  for (const c of clone.querySelectorAll('input, select, textarea')) c.remove();
  return textOf(clone);
}

/**
 * A tooltip may only be borrowed from a wrapper that holds this control alone —
 * a toolbar's own title would otherwise be pinned onto each button inside it.
 */
function isSoleControl(el: Element): boolean {
  return el.querySelectorAll(SEMANTIC_SELECTOR).length <= 1;
}

function getAccessibleName(el: Element): string | null {
  return (
    attr(el, 'aria-label') ??
    resolveAriaLabelledBy(el) ??
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
      ? getLabelForInput(el)
      : null) ??
    ((el.textContent?.trim()?.length ?? 0) <= 80 ? el.textContent?.trim() || null : null) ??
    // Icon buttons have no text of their own, and the tooltip is where such a toolbar
    // keeps its labels — on the button, on the image inside it, or on the cell around it.
    findTooltipLabel(el, isSoleControl) ??
    attr(el, 'placeholder')
  );
}

function getElementValue(el: Element): string | null {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio'))
    return el.checked ? 'checked' : 'unchecked';
  if (el instanceof HTMLInputElement && el.type === 'password') return '***';
  if (isRedactedField(el)) return '***';
  if (el instanceof HTMLInputElement && el.value) return `value=${el.value.slice(0, 50)}`;
  if (el instanceof HTMLTextAreaElement && el.value) return `value=${el.value.slice(0, 50)}`;
  if (el instanceof HTMLSelectElement && el.selectedOptions.length)
    return `selected=${el.selectedOptions[0].text.slice(0, 50)}`;
  if (attr(el, 'aria-checked')) return attr(el, 'aria-checked') === 'true' ? 'checked' : 'unchecked';
  if (attr(el, 'aria-selected') === 'true') return 'selected';
  if (attr(el, 'aria-current')) return 'current';
  return null;
}

function getContainerLabel(el: Element): string | null {
  return (
    attr(el, 'aria-label') ?? textOf(el.querySelector(':scope > legend, :scope > caption')) ?? resolveAriaLabelledBy(el)
  );
}

function findContainer(el: Element): { tag: string; role: string | null; label: string | null } | null {
  let current = el.parentElement;
  for (
    let depth = 0;
    current && current !== document.body && depth < MAX_WALK_UP;
    depth++, current = current.parentElement
  ) {
    const tag = current.tagName.toLowerCase();
    const role = attr(current, 'role');
    if (SEMANTIC_CONTAINERS.has(tag) || role) {
      return { tag, role, label: getContainerLabel(current) };
    }
  }
  return null;
}

function findNearestHeading(el: Element): string | null {
  let current = el.parentElement;
  for (let depth = 0; current && current !== document.body && depth < 5; depth++, current = current.parentElement) {
    const text = textOf(current.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]'));
    if (text) return text.slice(0, 100);
  }

  let closest: Element | null = null;
  for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')) {
    if (el.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_PRECEDING) closest = h;
    else break;
  }
  return closest ? (textOf(closest)?.slice(0, 100) ?? null) : null;
}

function collectSiblings(el: Element, container: Element | null): SiblingElement[] {
  const parent = container ?? el.parentElement;
  if (!parent) return [];

  const result: SiblingElement[] = [];
  for (const sib of parent.querySelectorAll(INTERACTIVE_SELECTOR)) {
    if (result.length >= MAX_SIBLINGS) break;
    if (sib.closest('[data-mimik-ignore]')) continue;
    result.push({
      tag: sib.tagName.toLowerCase(),
      role: roleOf(sib),
      name: getAccessibleName(sib),
      value: getElementValue(sib),
    });
  }
  return result;
}

export function extractDOMContext(el: HTMLElement, action: string): DOMContext {
  const container = findContainer(el);
  const containerEl = container
    ? el.closest(`${container.tag}${container.role ? `[role="${container.role}"]` : ''}`)
    : null;
  const name = getAccessibleName(el);

  return {
    page: { title: document.title, path: location.pathname },
    container,
    heading: findNearestHeading(el),
    siblings: collectSiblings(el, containerEl),
    target: {
      tag: el.tagName.toLowerCase(),
      role: roleOf(el),
      name,
      value: getElementValue(el),
      action,
      // Only worth reading the picture when the page gave the control no name at all.
      icon: name ? null : findIconHint(el),
    },
  };
}

export function serializeDOMContext(ctx: DOMContext): string {
  const lines: string[] = [];

  lines.push(`Page: "${ctx.page.title}" ${ctx.page.path}`);

  if (ctx.container) {
    const container = describeControl(ctx.container.tag, ctx.container.role, ctx.container.label);
    if (container !== 'control') lines.push(`Container: ${container}`);
  }

  lines.push(`Heading: ${ctx.heading ? `"${ctx.heading}"` : 'none'}`);

  if (ctx.siblings.length > 0) {
    lines.push(
      `Nearby: ${ctx.siblings
        .map((s) => `${describeControl(s.tag, s.role, s.name)}${s.value ? ` [${s.value}]` : ''}`)
        .join(', ')}`,
    );
  }

  const { tag, role, name, value, action, icon } = ctx.target;
  lines.push(`→ Target: ${describeControl(tag, role, name)}${value ? ` [${value}]` : ''} (${action})`);
  // Deliberately on its own line and unquoted: everything quoted above is text the
  // page prints, and this is not — it is what the pictogram shows, read off the icon
  // file. Quoting it would invite the model to reproduce it as a printed label.
  if (!name && icon) lines.push(`Icon shown on it: ${icon} (no printed label)`);

  return lines.join('\n');
}
