import { describe, expect, it } from 'vitest';
import { controlKind, type DOMContext, serializeDOMContext } from '../context';

function context(over: Partial<DOMContext> = {}): DOMContext {
  return {
    page: { title: 'Teile', path: '/skin-client/' },
    container: null,
    heading: null,
    siblings: [],
    target: { tag: 'div', role: null, name: 'Herunterladen', value: null, action: 'click' },
    ...over,
  };
}

describe('controlKind', () => {
  it('names a div that carries a button role as a button', () => {
    expect(controlKind('div', 'button')).toBe('button');
  });

  it('names menu entries in words a reader knows', () => {
    expect(controlKind('div', 'menuitem')).toBe('menu item');
    expect(controlKind('div', 'menuitemcheckbox')).toBe('menu item');
    expect(controlKind('li', 'treeitem')).toBe('tree item');
  });

  it('falls back to the tag when it is already meaningful', () => {
    expect(controlKind('button', null)).toBe('button');
    expect(controlKind('a', null)).toBe('link');
    expect(controlKind('select', null)).toBe('dropdown');
    expect(controlKind('input', null)).toBe('field');
  });

  it('says nothing for a bare div or span, which means nothing to a reader', () => {
    expect(controlKind('div', null)).toBeNull();
    expect(controlKind('span', null)).toBeNull();
  });

  it('prefers the role over the tag when the two disagree', () => {
    expect(controlKind('a', 'button')).toBe('button');
  });
});

describe('serializeDOMContext', () => {
  it('does not put a tag name in front of the label', () => {
    const text = serializeDOMContext(context());

    expect(text).toContain('→ Target: "Herunterladen" (click)');
    expect(text).not.toContain('div');
  });

  it('describes a role-bearing control by that role', () => {
    const text = serializeDOMContext(
      context({ target: { tag: 'div', role: 'menuitem', name: 'Bewegungen', value: null, action: 'click' } }),
    );

    expect(text).toContain('→ Target: menu item "Bewegungen" (click)');
  });

  it('never leaks a tag name through the nearby controls either', () => {
    const text = serializeDOMContext(
      context({
        siblings: [
          { tag: 'div', role: null, name: 'Speichern', value: null },
          { tag: 'div', role: 'checkbox', name: 'Archiviert', value: 'unchecked' },
          { tag: 'input', role: null, name: 'Suchbegriff', value: null },
        ],
      }),
    );

    expect(text).toContain('Nearby: "Speichern", checkbox "Archiviert" [unchecked], field "Suchbegriff"');
    expect(text).not.toMatch(/\bdiv\b/);
  });

  it('drops a container that has nothing a reader could recognise', () => {
    const text = serializeDOMContext(context({ container: { tag: 'div', role: null, label: null } }));

    expect(text).not.toContain('Container:');
  });

  it('keeps a container that does mean something', () => {
    const text = serializeDOMContext(context({ container: { tag: 'form', role: null, label: 'Stammdaten' } }));

    expect(text).toContain('Container: form "Stammdaten"');
  });

  it('still reports the value of a checked control', () => {
    const text = serializeDOMContext(
      context({ target: { tag: 'div', role: 'checkbox', name: 'Archiviert', value: 'checked', action: 'click' } }),
    );

    expect(text).toContain('→ Target: checkbox "Archiviert" [checked] (click)');
  });

  it('falls back to a plain word when there is neither a name nor a role', () => {
    const text = serializeDOMContext(
      context({ target: { tag: 'div', role: null, name: null, value: null, action: 'click' } }),
    );

    expect(text).toContain('→ Target: control (click)');
  });
});
