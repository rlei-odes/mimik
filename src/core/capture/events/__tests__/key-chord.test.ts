// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { commandChord } from '../key-chord';

function press(key: string, mods: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...mods });
}

/** A German layout types @ and \ as AltGr, which the browser reports as Ctrl+Alt. */
function altGr(key: string): KeyboardEvent {
  const e = press(key, { ctrlKey: true, altKey: true });
  Object.defineProperty(e, 'getModifierState', { value: (m: string) => m === 'AltGraph' });
  return e;
}

describe('commandChord', () => {
  it('names the chord the reader has to press', () => {
    expect(commandChord(press('a', { ctrlKey: true }))).toBe('Ctrl+A');
    expect(commandChord(press('g', { ctrlKey: true }))).toBe('Ctrl+G');
    expect(commandChord(press('F4', { altKey: true }))).toBe('Alt+F4');
  });

  it('keeps the modifiers in a fixed order', () => {
    expect(commandChord(press('S', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+S');
    expect(commandChord(press('k', { metaKey: true }))).toBe('Cmd+K');
  });

  it('reads the same whether the letter arrived shifted or not', () => {
    expect(commandChord(press('y', { ctrlKey: true }))).toBe('Ctrl+Y');
    expect(commandChord(press('Y', { ctrlKey: true }))).toBe('Ctrl+Y');
  });

  it('ignores ordinary typing', () => {
    expect(commandChord(press('a'))).toBeNull();
    expect(commandChord(press('Enter'))).toBeNull();
    expect(commandChord(press('Backspace'))).toBeNull();
    expect(commandChord(press('ö', { shiftKey: true }))).toBeNull();
  });

  it('ignores the modifier keys themselves, which fire a keydown of their own', () => {
    expect(commandChord(press('Control', { ctrlKey: true }))).toBeNull();
    expect(commandChord(press('Alt', { altKey: true }))).toBeNull();
    expect(commandChord(press('Shift', { shiftKey: true }))).toBeNull();
  });

  it('leaves cut, copy and paste to the clipboard events that carry the content', () => {
    expect(commandChord(press('c', { ctrlKey: true }))).toBeNull();
    expect(commandChord(press('v', { ctrlKey: true }))).toBeNull();
    expect(commandChord(press('x', { metaKey: true }))).toBeNull();
  });

  it('does not turn AltGr into a shortcut, since it is how @ is typed', () => {
    expect(commandChord(altGr('@'))).toBeNull();
    expect(commandChord(altGr('\\'))).toBeNull();
  });
});
