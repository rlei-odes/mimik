/**
 * A keystroke pressed with Ctrl, Alt or Cmd inside a text field is a command, not
 * typing. Business software leans on them heavily — Ctrl+A over a field opens the
 * picker listing the records that field accepts — and the reader has no way to guess
 * one from a screenshot, so it has to be written into the step.
 */

/**
 * Cut, copy and paste already become their own steps through the clipboard events,
 * which carry what was actually transferred. Naming them here as well would describe
 * the same keystroke twice.
 */
const CLIPBOARD_KEYS = new Set(['c', 'x', 'v']);

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS']);

/**
 * Ctrl, Shift and the like fire a keydown of their own before the key they modify,
 * and keep firing it while held. Pressed alone they do nothing worth a step.
 */
export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

/**
 * How the chord is written in the step, or null when the keystroke is ordinary
 * typing. `AltGraph` is excluded on purpose: on a German keyboard it is how @ and \
 * are typed, and the browser reports those as Ctrl+Alt.
 */
export function commandChord(e: KeyboardEvent): string | null {
  if (isModifierKey(e.key)) return null;
  // Windows reports AltGr as Ctrl+Alt, so both have to be set before the AltGraph
  // state means anything — Alt+F4 alone is a real shortcut.
  if (e.ctrlKey && e.altKey && e.getModifierState?.('AltGraph')) return null;
  if (!e.ctrlKey && !e.metaKey && !e.altKey) return null;
  if ((e.ctrlKey || e.metaKey) && CLIPBOARD_KEYS.has(e.key.toLowerCase())) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Cmd');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  // A single letter arrives lowercase without Shift and uppercase with it; the chord
  // reads the same either way, and Shift is already named above.
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join('+');
}
