/**
 * Naming icon-only controls.
 *
 * Toolbars in business software are rows of bare pictograms: a diskette, a sheet of
 * paper, a folder. None of them carries text, so every other naming route comes back
 * empty and the step reads "Klicken Sie auf die Schaltfläche" — true of every button
 * on the page and therefore useless.
 *
 * Two routes out, in this order:
 *
 *  1. The tooltip. Almost every such toolbar has one, and it holds the real label in
 *     the application's own wording, so it is always preferred. It sits anywhere in
 *     the cluster — on the button, on the image inside it, sometimes on the cell
 *     around it — under `title` or one of the widget-library attributes below.
 *  2. Failing that, what the icon *depicts*, read off the image filename, the icon
 *     font class or the sprite id, and matched against the table at the bottom.
 *     That yields a key, not a label: it says what the control does, not what the
 *     page calls it, and callers must keep the two apart.
 */

const MAX_LABEL = 80;
const MAX_DESCENDANTS = 12;
const MAX_ANCESTORS = 2;

/**
 * `title` first: it is the one the browser actually renders as a tooltip. The rest
 * belong to widget libraries that suppress the native tooltip and draw their own.
 */
const TOOLTIP_ATTRS = [
  'title',
  'aria-label',
  'data-tooltip',
  'data-title',
  'data-original-title',
  'data-bs-original-title',
  'tooltip',
  'uib-tooltip',
  'matTooltip',
] as const;

const IMAGE_SELECTOR = 'img, svg, i, span, use, [class]';

function clean(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text || !/[a-z0-9]/i.test(text)) return null;
  return text.slice(0, MAX_LABEL);
}

function ownTooltip(el: Element): string | null {
  for (const attr of TOOLTIP_ATTRS) {
    const value = clean(el.getAttribute(attr));
    if (value) return value;
  }
  if (isTag(el, 'img')) return clean(el.getAttribute('alt'));
  return null;
}

/** Tag names, not `instanceof`: an SVG element inlined by innerHTML is not always one. */
function isTag(el: Element, name: string): boolean {
  return el.tagName?.toLowerCase() === name;
}

/** An `<svg>` names itself through a child `<title>` rather than an attribute. */
function svgTitle(el: Element): string | null {
  const svg = isTag(el, 'svg') ? el : el.querySelector('svg');
  return svg ? clean(svg.querySelector(':scope > title')?.textContent) : null;
}

function descendantTooltip(el: Element): string | null {
  let seen = 0;
  for (const child of el.querySelectorAll('*')) {
    if (seen++ >= MAX_DESCENDANTS) break;
    const value = ownTooltip(child);
    if (value) return value;
  }
  return null;
}

/**
 * A tooltip hung on a wrapper only names our control while it wraps nothing else.
 * `<td title="Speichern"><a><img></a></td>` is one control; a toolbar `<div>` with a
 * title is a group, and borrowing its tooltip would label every button in it alike.
 */
function ancestorTooltip(el: Element, isControl: (candidate: Element) => boolean): string | null {
  let current = el.parentElement;
  for (let depth = 0; current && current !== document.body && depth < MAX_ANCESTORS; depth++) {
    if (!isControl(current)) return null;
    const value = ownTooltip(current);
    if (value) return value;
    current = current.parentElement;
  }
  return null;
}

/**
 * The label the application itself gives this control, or null. Never a guess — what
 * comes back is text the page authored, safe to quote to the reader verbatim.
 */
export function findTooltipLabel(el: Element, isSoleControl?: (candidate: Element) => boolean): string | null {
  return (
    ownTooltip(el) ??
    svgTitle(el) ??
    descendantTooltip(el) ??
    (isSoleControl ? ancestorTooltip(el, isSoleControl) : null)
  );
}

/** Words an icon name is built from, gathered from wherever the page keeps them. */
function iconTokens(el: Element): string {
  const parts: string[] = [];
  const push = (value: string | null | undefined) => {
    if (value) parts.push(value);
  };

  const collect = (node: Element) => {
    push(node.getAttribute('class'));
    push(node.getAttribute('data-icon'));
    push(node.getAttribute('data-icon-name'));
    if (isTag(node, 'img')) push(node.getAttribute('src'));
    if (isTag(node, 'use')) push(node.getAttribute('href') || node.getAttribute('xlink:href'));
  };

  collect(el);
  let seen = 0;
  for (const child of el.querySelectorAll(IMAGE_SELECTOR)) {
    if (seen++ >= MAX_DESCENDANTS) break;
    collect(child);
  }

  // btnSpeichern.gif has to come apart into words before any of them can be matched.
  return parts
    .join(' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLowerCase();
}

/**
 * What the pictogram depicts, as one of the keys below, or null when it is not a
 * picture this table knows. Callers translate the key — it is not display text.
 */
export function findIconHint(el: Element): IconHint | null {
  const tokens = iconTokens(el);
  if (!tokens.trim()) return null;
  for (const [hint, pattern] of ICON_PATTERNS) {
    if (pattern.test(tokens)) return hint;
  }
  return null;
}

export const ICON_HINTS = [
  'save',
  'new',
  'open',
  'edit',
  'delete',
  'copy',
  'paste',
  'cut',
  'print',
  'search',
  'refresh',
  'export',
  'import',
  'add',
  'remove',
  'back',
  'forward',
  'first',
  'last',
  'up',
  'down',
  'close',
  'settings',
  'help',
  'filter',
  'sort',
  'calendar',
  'attach',
  'lock',
  'user',
  'mail',
  'info',
  'undo',
  'redo',
  'check',
  'cancel',
] as const;

export type IconHint = (typeof ICON_HINTS)[number];

/**
 * Matched in order, so the specific comes before the general: `saveas` must not be
 * eaten by `save`, and `newfolder` is a new thing, not a folder. Both the English
 * and the German stems are listed, because in-house icon sets are named in whichever
 * language the developer thought in — speichern.gif and save.gif sit side by side.
 */
const ICON_PATTERNS: Array<[IconHint, RegExp]> = [
  ['save', /\b(save|saveall|speichern|sichern|disk|diskette|floppy|datenspeichern)\b/],
  ['new', /\b(new|neu|neuanlage|create|anlegen|erfassen|blank|emptypage|newdoc|newdocument|newfile|newsheet)\b/],
  ['open', /\b(open|oeffnen|offnen|folder|ordner|openfolder|folderopen|load|laden)\b/],
  ['edit', /\b(edit|bearbeiten|aendern|andern|modify|change|pencil|stift|pen|rename|umbenennen)\b/],
  ['delete', /\b(delete|del|loeschen|loschen|remove|erase|trash|bin|papierkorb|muell|mull)\b/],
  ['copy', /\b(copy|kopieren|duplicate|duplizieren|clone)\b/],
  ['paste', /\b(paste|einfuegen|einfugen|clipboard|zwischenablage)\b/],
  ['cut', /\b(cut|ausschneiden|scissors|schere)\b/],
  ['print', /\b(print|drucken|drucker|printer|druck)\b/],
  ['search', /\b(search|suche|suchen|find|finden|magnifier|lupe|zoom|glass)\b/],
  ['refresh', /\b(refresh|reload|aktualisieren|neuladen|sync|synchron|update)\b/],
  ['export', /\b(export|exportieren|download|herunterladen|downloads)\b/],
  ['import', /\b(import|importieren|upload|hochladen)\b/],
  ['undo', /\b(undo|rueckgaengig|ruckgangig|zurueckn|revert)\b/],
  ['redo', /\b(redo|wiederholen|wiederherstellen)\b/],
  ['first', /\b(first|erste|erster|anfang|skipbackward|stepbackward)\b/],
  ['last', /\b(last|letzte|letzter|ende|skipforward|stepforward)\b/],
  ['back', /\b(back|zurueck|zuruck|prev|previous|vorherige|arrowleft|caretleft|chevronleft)\b/],
  ['forward', /\b(forward|weiter|next|naechste|nachste|arrowright|caretright|chevronright)\b/],
  ['up', /\b(moveup|hoch|nachoben|aufwaerts|aufwarts|arrowup|caretup|chevronup)\b/],
  ['down', /\b(movedown|runter|nachunten|abwaerts|abwarts|arrowdown|caretdown|chevrondown)\b/],
  ['add', /\b(add|plus|hinzufuegen|hinzufugen|neuezeile|addrow|insert)\b/],
  ['remove', /\b(minus|entfernen|removerow|deleterow|subtract)\b/],
  ['close', /\b(close|schliessen|schliesen|cross|kreuz|exit|beenden)\b/],
  ['cancel', /\b(cancel|abbrechen|verwerfen|discard|stop)\b/],
  ['check', /\b(ok|check|haken|bestaetigen|bestatigen|confirm|apply|uebernehmen|ubernehmen|tick|accept)\b/],
  ['settings', /\b(settings|einstellungen|options|optionen|config|konfiguration|gear|zahnrad|cog|wrench|tools)\b/],
  ['help', /\b(help|hilfe|question|fragezeichen|support|manual|handbuch)\b/],
  ['filter', /\b(filter|filtern|funnel|trichter)\b/],
  ['sort', /\b(sort|sortieren|sorting|orderby)\b/],
  ['calendar', /\b(calendar|kalender|date|datum|datepicker|termin|schedule)\b/],
  ['attach', /\b(attach|anhang|anhaengen|anhangen|attachment|paperclip|klammer|clip|beleg)\b/],
  ['lock', /\b(lock|sperren|gesperrt|locked|padlock|schloss|secure|unlock|entsperren)\b/],
  ['user', /\b(user|benutzer|person|mitarbeiter|account|konto|profile|profil|contact|kontakt)\b/],
  ['mail', /\b(mail|email|envelope|briefumschlag|umschlag|nachricht|message|send|senden)\b/],
  ['info', /\b(info|information|details|about|hinweis)\b/],
];
