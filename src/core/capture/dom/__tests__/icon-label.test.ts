// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SEMANTIC_SELECTOR } from '../element-utils';
import { findIconHint, findTooltipLabel } from '../icon-label';

function render(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

function isSoleControl(el: Element): boolean {
  return el.querySelectorAll(SEMANTIC_SELECTOR).length <= 1;
}

describe('findTooltipLabel', () => {
  it('reads the tooltip off the control itself', () => {
    const el = render('<button title="Speichern"><img src="save.gif"></button>');
    expect(findTooltipLabel(el)).toBe('Speichern');
  });

  it('reads it off the image inside, which is where old toolbars keep it', () => {
    const el = render('<a href="#"><img src="new.gif" title="Neuen Satz anlegen"></a>');
    expect(findTooltipLabel(el)).toBe('Neuen Satz anlegen');
  });

  it('falls back to the alt text of that image', () => {
    const el = render('<a href="#"><img src="edit.gif" alt="Bearbeiten"></a>');
    expect(findTooltipLabel(el)).toBe('Bearbeiten');
  });

  it('accepts the tooltip attributes drawn by widget libraries', () => {
    const el = render('<div role="button" data-original-title="Als Kopiervorlage verwenden"></div>');
    expect(findTooltipLabel(el)).toBe('Als Kopiervorlage verwenden');
  });

  it('names an inline svg by its title child', () => {
    const el = render('<button><svg><title>Löschen</title></svg></button>');
    expect(findTooltipLabel(el)).toBe('Löschen');
  });

  it('borrows the tooltip of a wrapper that holds this control alone', () => {
    const el = render(
      '<table><tr><td title="Abbruch"><a href="#"><img src="cancel.gif"></a></td></tr></table>',
    ).querySelector('a') as HTMLElement;
    expect(findTooltipLabel(el, isSoleControl)).toBe('Abbruch');
  });

  it('refuses a tooltip from a wrapper around several controls', () => {
    const toolbar = render('<div title="Symbolleiste"><a href="#"><img></a><a href="#"><img></a></div>');
    const first = toolbar.querySelector('a') as HTMLElement;
    expect(findTooltipLabel(first, isSoleControl)).toBeNull();
  });

  it('ignores a tooltip that carries no readable text', () => {
    const el = render('<button title="  "><img src="save.gif"></button>');
    expect(findTooltipLabel(el)).toBeNull();
  });

  it('collapses the whitespace of a multi-line tooltip', () => {
    const el = render('<button title="Neuen Satz\n  anlegen"></button>');
    expect(findTooltipLabel(el)).toBe('Neuen Satz anlegen');
  });
});

describe('findIconHint', () => {
  it('reads the picture off an image filename', () => {
    expect(findIconHint(render('<a href="#"><img src="/img/toolbar/save.gif"></a>'))).toBe('save');
    expect(findIconHint(render('<a href="#"><img src="/img/toolbar/drucken.png"></a>'))).toBe('print');
  });

  it('splits a camel-cased filename into words first', () => {
    expect(findIconHint(render('<a href="#"><img src="btnSpeichern.gif"></a>'))).toBe('save');
  });

  it('reads an icon font class', () => {
    expect(findIconHint(render('<button><i class="fa fa-trash"></i></button>'))).toBe('delete');
    expect(findIconHint(render('<button class="icon-refresh"></button>'))).toBe('refresh');
  });

  it('reads a sprite reference', () => {
    expect(findIconHint(render('<button><svg><use href="#icon-search"></use></svg></button>'))).toBe('search');
  });

  it('prefers the specific reading when two words could match', () => {
    expect(findIconHint(render('<button class="icon-newFolder"></button>'))).toBe('new');
  });

  it('says nothing about a picture it cannot place', () => {
    expect(findIconHint(render('<button><img src="/img/logo_4711.png"></button>'))).toBeNull();
  });

  it('does not read a framework class prefix as a close button', () => {
    expect(findIconHint(render('<button class="x-btn x-toolbar-item"></button>'))).toBeNull();
  });
});
