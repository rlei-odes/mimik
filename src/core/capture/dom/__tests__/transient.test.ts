// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TransientOverlays } from '../transient';

const VIEWPORT_WIDTH = 1651;
const VIEWPORT_HEIGHT = 1297;

let overlays: TransientOverlays;

function sized<T extends Element>(el: T, width: number, height: number): T {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }),
  });
  return el;
}

/** Mutation records are delivered as a microtask, so let them land. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: VIEWPORT_WIDTH });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT });
  overlays = new TransientOverlays();
  overlays.start();
});

afterEach(() => {
  overlays.stop();
  document.body.innerHTML = '';
});

describe('spotting a transient overlay', () => {
  async function openDropdown(width = 255, height = 683) {
    const popup = sized(document.createElement('div'), width, height);
    const item = sized(document.createElement('div'), 247, 27);
    const label = sized(document.createElement('div'), 192, 15);
    item.appendChild(label);
    popup.appendChild(item);
    document.body.appendChild(popup);
    await settle();
    return { popup, item, label };
  }

  it('finds the dropdown that just opened under the pressed item', async () => {
    const { popup, label } = await openDropdown();
    expect(overlays.find(label)).toBe(popup);
  });

  it('returns the outermost overlay, since that is what the page removes as a unit', async () => {
    const { popup, item, label } = await openDropdown();
    expect(overlays.find(label)).not.toBe(item);
    expect(overlays.find(label)).toBe(popup);
  });

  it('ignores a control that was already on the page', async () => {
    const button = sized(document.createElement('div'), 98, 38);
    document.body.appendChild(button);
    // Inserted before the observer would have seen it as part of an interaction.
    const fresh = new TransientOverlays();
    fresh.start();
    expect(fresh.find(button)).toBeNull();
    fresh.stop();
  });

  it('arms nothing for a press inside a full-page re-render', async () => {
    const pane = sized(document.createElement('div'), 1651, 1297);
    const row = sized(document.createElement('div'), 281, 40);
    pane.appendChild(row);
    document.body.appendChild(pane);
    await settle();

    expect(overlays.find(row)).toBeNull();
  });

  it('ignores a zero-sized wrapper', async () => {
    const wrapper = sized(document.createElement('div'), 0, 0);
    document.body.appendChild(wrapper);
    await settle();

    expect(overlays.find(wrapper)).toBeNull();
  });
});

describe('knowing when the overlay went away', () => {
  it('reports nothing while the overlay is still open', async () => {
    const popup = sized(document.createElement('div'), 255, 683);
    document.body.appendChild(popup);
    await settle();

    overlays.watch(popup);
    expect(overlays.detachTime).toBeNull();
  });

  it('reports a time once the overlay is torn out', async () => {
    const popup = sized(document.createElement('div'), 255, 683);
    document.body.appendChild(popup);
    await settle();

    overlays.watch(popup);
    const before = Date.now();
    popup.remove();
    await settle();

    const detached = overlays.detachTime;
    expect(detached).not.toBeNull();
    expect(detached as number).toBeGreaterThanOrEqual(before);
  });

  it('notices a removal that happened higher up the tree', async () => {
    const host = document.createElement('div');
    const popup = sized(document.createElement('div'), 255, 683);
    host.appendChild(popup);
    document.body.appendChild(host);
    await settle();

    overlays.watch(popup);
    host.remove();
    await settle();

    expect(overlays.detachTime).not.toBeNull();
  });

  it('starts clean when a new overlay is watched', async () => {
    const first = sized(document.createElement('div'), 255, 683);
    document.body.appendChild(first);
    await settle();
    overlays.watch(first);
    first.remove();
    await settle();
    expect(overlays.detachTime).not.toBeNull();

    const second = sized(document.createElement('div'), 151, 224);
    document.body.appendChild(second);
    await settle();
    overlays.watch(second);

    expect(overlays.detachTime).toBeNull();
  });
});
