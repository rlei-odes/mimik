// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractDOMContext, serializeDOMContext } from '../context';

function toolbar(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.querySelector('[data-target]') as HTMLElement;
}

describe('naming an icon-only toolbar button', () => {
  it('takes the label from the tooltip on the button', () => {
    const el = toolbar('<button data-target title="Speichern"><img src="save.gif"></button>');
    const ctx = extractDOMContext(el, 'click');

    expect(ctx.target.name).toBe('Speichern');
    expect(serializeDOMContext(ctx)).toContain('→ Target: button "Speichern" (click)');
  });

  it('takes it from the tooltip on the image inside the button', () => {
    const el = toolbar('<a href="#" data-target><img src="new.gif" title="Neuen Satz anlegen"></a>');
    const ctx = extractDOMContext(el, 'click');

    expect(ctx.target.name).toBe('Neuen Satz anlegen');
    expect(ctx.target.icon).toBeNull();
  });

  it('keeps the printed text when the control has both', () => {
    const el = toolbar('<button data-target title="Datensatz speichern (Strg+S)">Speichern</button>');

    expect(extractDOMContext(el, 'click').target.name).toBe('Speichern');
  });

  it('falls back to the picture when the page names the control nowhere', () => {
    const el = toolbar('<a href="#" data-target><img src="/img/toolbar/save.gif"></a>');
    const ctx = extractDOMContext(el, 'click');

    expect(ctx.target.name).toBeNull();
    expect(ctx.target.icon).toBe('save');
  });

  it('offers the picture as a hint, never as a label the model could quote', () => {
    const text = serializeDOMContext(
      extractDOMContext(toolbar('<a href="#" data-target><img src="/img/trash.gif"></a>'), 'click'),
    );

    expect(text).toContain('Icon shown on it: delete (no printed label)');
    expect(text).not.toContain('"delete"');
  });

  it('says nothing about an icon it cannot place', () => {
    const el = toolbar('<a href="#" data-target><img src="/img/b_4711.gif"></a>');

    expect(extractDOMContext(el, 'click').target.icon).toBeNull();
  });
});

/** Markup taken verbatim from the toolbar of the ERP this fork is used on. */
describe('a widget kit that builds its controls out of bare divs', () => {
  it('reads the label out of data-title and the kind out of the class list', () => {
    const el = toolbar(
      '<div class="sc-widget p-frame pa-toolbar panel-frame" tabindex="-1">' +
        '<div class="sc-button sc-widget p-button btn_update pa-img-icon_open flat" data-target' +
        ' data-title="Bearbeiten" tabindex="-1"><span></span></div></div>',
    );
    const ctx = extractDOMContext(el, 'click');

    expect(ctx.target.name).toBe('Bearbeiten');
    expect(serializeDOMContext(ctx)).toContain('→ Target: button "Bearbeiten" (click)');
  });

  it('does not mistake the toolbar that holds those buttons for a button', () => {
    const el = toolbar('<div class="sc-widget p-button-bar pa-toolbar" data-target tabindex="-1"></div>');

    expect(extractDOMContext(el, 'click').target.role).toBeNull();
  });

  it('carries the same reading over to the surrounding controls', () => {
    document.body.innerHTML =
      '<form><div class="sc-button p-button" data-title="Speichern" tabindex="0"></div>' +
      '<div class="sc-checkbox p-checkbox" data-title="Aktiv" tabindex="0" aria-checked="true"></div></form>';
    const el = document.querySelector('[data-title="Speichern"]') as HTMLElement;

    expect(serializeDOMContext(extractDOMContext(el, 'click'))).toContain(
      'Nearby: button "Speichern", checkbox "Aktiv" [checked]',
    );
  });
});
