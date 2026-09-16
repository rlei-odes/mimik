// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  eventTarget,
  findFocusableAncestor,
  getFieldLabel,
  getFieldValue,
  isSensitiveField,
  isTextField,
  isTooLarge,
} from '../element-utils';

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 800;

function makeElement(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }),
  });
  return el;
}

describe('isTooLarge', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: VIEWPORT_WIDTH });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT });
  });

  it('reports a full-width banner as too large even when it is short', () => {
    expect(isTooLarge(makeElement(VIEWPORT_WIDTH, VIEWPORT_HEIGHT * 0.1))).toBe(true);
  });

  it('reports a full-height sidebar as too large even when it is narrow', () => {
    expect(isTooLarge(makeElement(VIEWPORT_WIDTH * 0.1, VIEWPORT_HEIGHT))).toBe(true);
  });

  it('reports a small element as not too large', () => {
    expect(isTooLarge(makeElement(120, 40))).toBe(false);
  });

  it('does not report an element sitting exactly at the 0.8 ratio', () => {
    expect(isTooLarge(makeElement(VIEWPORT_WIDTH * 0.8, VIEWPORT_HEIGHT * 0.8))).toBe(false);
  });

  it('reports an element just past the 0.8 width ratio', () => {
    expect(isTooLarge(makeElement(VIEWPORT_WIDTH * 0.81, 40))).toBe(true);
  });
});

describe('getFieldValue', () => {
  function makeInput(type: string, value: string): HTMLInputElement {
    const el = document.createElement('input');
    el.type = type;
    el.value = value;
    return el;
  }

  it('returns nothing for a password field so the typed value is never captured', () => {
    expect(getFieldValue(makeInput('password', 'hunter2'))).toBe('');
  });

  it('still returns the value for an ordinary text field', () => {
    expect(getFieldValue(makeInput('text', 'ada@example.com'))).toBe('ada@example.com');
  });

  it('returns the value for a contenteditable element', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    el.textContent = ' notes ';
    expect(getFieldValue(el)).toBe('notes');
  });
});

describe('isSensitiveField', () => {
  it('reports a password input as sensitive', () => {
    const el = document.createElement('input');
    el.type = 'password';
    expect(isSensitiveField(el)).toBe(true);
  });

  it('does not report a text input as sensitive', () => {
    const el = document.createElement('input');
    el.type = 'text';
    expect(isSensitiveField(el)).toBe(false);
  });

  it('does not report a textarea as sensitive', () => {
    expect(isSensitiveField(document.createElement('textarea'))).toBe(false);
  });
});

describe('eventTarget', () => {
  function retargeted(host: Element, inner: Element): Event {
    return { target: host, composedPath: () => [inner, host, document.body] } as unknown as Event;
  }

  it('returns the inner field rather than the web component wrapping it', () => {
    const host = document.createElement('faceplate-text-input');
    const inner = document.createElement('input');
    inner.type = 'password';
    expect(eventTarget(retargeted(host, inner))).toBe(inner);
  });

  it('leaves an ordinary target untouched', () => {
    const button = document.createElement('button');
    expect(eventTarget({ target: button, composedPath: () => [button] } as unknown as Event)).toBe(button);
  });

  it('falls back to target when composedPath is unavailable', () => {
    const button = document.createElement('button');
    expect(eventTarget({ target: button } as unknown as Event)).toBe(button);
  });

  it('returns null when there is no element to resolve', () => {
    expect(eventTarget({ target: null } as unknown as Event)).toBe(null);
  });
});

describe('findFocusableAncestor', () => {
  function wrappedInput(type: string) {
    const host = document.createElement('faceplate-text-input');
    const shadow = host.attachShadow({ mode: 'open' });
    const label = document.createElement('label');
    const outer = document.createElement('span');
    const decoration = document.createElement('span');
    const input = document.createElement('input');
    input.type = type;
    input.id = `field-${type}`;
    label.htmlFor = input.id;
    outer.appendChild(decoration);
    outer.appendChild(input);
    label.appendChild(outer);
    shadow.appendChild(label);
    document.body.appendChild(host);
    return { host, decoration, input };
  }

  it('resolves a decorative span inside a web component to the control it labels', () => {
    const { host, decoration, input } = wrappedInput('text');
    expect(findFocusableAncestor(decoration)).toBe(input);
    host.remove();
  });

  it('resolves to the password control so the sensitive guard sees it', () => {
    const { host, decoration, input } = wrappedInput('password');
    expect(findFocusableAncestor(decoration)).toBe(input);
    expect(isSensitiveField(findFocusableAncestor(decoration))).toBe(true);
    host.remove();
  });

  it('still returns the nearest focusable ancestor on an ordinary page', () => {
    const button = document.createElement('button');
    const span = document.createElement('span');
    button.appendChild(span);
    document.body.appendChild(button);
    expect(findFocusableAncestor(span)).toBe(button);
    button.remove();
  });
});

// Structures taken from an enterprise web client that hangs `tabindex` on every
// layout pane, so the bare-tabindex fallback used to swallow whole panels.
describe('findFocusableAncestor on tabindex-heavy layouts', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: VIEWPORT_WIDTH });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT });
  });

  function sized<T extends Element>(el: T, width: number, height: number): T {
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }),
    });
    return el;
  }

  function build(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  it('picks the tree row rather than the scroll container holding the tabindex', () => {
    const root = build(`
      <div id="tree" role="tree" tabindex="1048">
        <ul role="none">
          <li role="treeitem"><div><span><div class="prog-path">modules/sales</div></span></div></li>
        </ul>
      </div>`);
    sized(root.querySelector('#tree') as Element, 300, 1232);
    sized(root.querySelector('li') as Element, 281, 40);
    const leaf = sized(root.querySelector('.prog-path') as HTMLElement, 281, 20);

    expect(findFocusableAncestor(leaf)).toBe(root.querySelector('li'));
    root.remove();
  });

  it('keeps a control-sized tabindex wrapper such as a menu bar item', () => {
    const root = build(`
      <div class="content">
        <div class="sc-menuitem" tabindex="-1"><div class="entry">File</div></div>
      </div>`);
    const item = sized(root.querySelector('.sc-menuitem') as HTMLElement, 54, 20);
    const entry = sized(root.querySelector('.entry') as HTMLElement, 46, 15);

    expect(findFocusableAncestor(entry)).toBe(item);
    root.remove();
  });

  it('refuses a tabindex container far larger than any control', () => {
    const root = build(`
      <div id="pane" tabindex="-1"><div id="inner"><span id="leaf">x</span></div></div>`);
    sized(root.querySelector('#pane') as Element, 1298, 1297);
    const leaf = sized(root.querySelector('#leaf') as HTMLElement, 40, 12);

    expect(findFocusableAncestor(leaf)).toBe(leaf);
    root.remove();
  });

  it('refuses a zero-width label wrapper that would annotate nothing', () => {
    const root = build(`<label id="wrap" tabindex="-1"><pre id="text">Article</pre></label>`);
    sized(root.querySelector('#wrap') as Element, 0, 23);
    const text = sized(root.querySelector('#text') as HTMLElement, 52, 15);

    expect(findFocusableAncestor(text)).toBe(text);
    root.remove();
  });

  it('resolves a checkbox menu entry to the role-bearing element', () => {
    const root = build(`
      <div class="sc-menuitem" tabindex="-1">
        <div role="checkbox" aria-checked="true"><div class="box"></div></div>
        <div class="entry">Toolbar</div>
      </div>`);
    sized(root.querySelector('.sc-menuitem') as Element, 143, 27);
    const box = sized(root.querySelector('.box') as HTMLElement, 13, 13);

    expect(findFocusableAncestor(box)).toBe(root.querySelector('[role="checkbox"]'));
    root.remove();
  });
});

describe('isTextField', () => {
  function input(type = 'text'): HTMLInputElement {
    const el = document.createElement('input');
    el.type = type;
    return el;
  }

  it('reports an ordinary text input as a text field', () => {
    expect(isTextField(input())).toBe(true);
  });

  it('does not report a readonly combo box display slot as a text field', () => {
    const el = input();
    el.readOnly = true;
    expect(isTextField(el)).toBe(false);
  });

  it('does not report a disabled input as a text field', () => {
    const el = input();
    el.disabled = true;
    expect(isTextField(el)).toBe(false);
  });

  it('does not report a readonly textarea as a text field', () => {
    const el = document.createElement('textarea');
    el.readOnly = true;
    expect(isTextField(el)).toBe(false);
  });

  it('still reports a writable textarea as a text field', () => {
    expect(isTextField(document.createElement('textarea'))).toBe(true);
  });
});

describe('getFieldLabel', () => {
  function slottedField(labelText: string) {
    const host = document.createElement('faceplate-text-input');
    host.textContent = labelText;
    const shadow = host.attachShadow({ mode: 'open' });
    const label = document.createElement('label');
    const marker = document.createElement('span');
    marker.textContent = '*';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'slotted-field';
    label.htmlFor = input.id;
    label.appendChild(marker);
    label.appendChild(input);
    shadow.appendChild(label);
    document.body.appendChild(host);
    return { host, input };
  }

  it('uses the slotted host text rather than the required marker', () => {
    const { host, input } = slottedField('Email or username');
    expect(getFieldLabel(input)).toBe('Email or username');
    host.remove();
  });

  it('prefers an explicit aria-label over everything else', () => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Search');
    expect(getFieldLabel(input)).toBe('Search');
  });

  it('falls back to the name when nothing readable is available', () => {
    const input = document.createElement('input');
    input.setAttribute('name', 'username');
    expect(getFieldLabel(input)).toBe('username');
  });
});
