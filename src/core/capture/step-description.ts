import { i18n } from '#imports';
import { ICON_HINTS } from '@/core/capture/dom/icon-label';
import type { ElementMeta } from '@/core/guides/types';

/**
 * "Speichern-Symbol" rather than "Schaltfläche": the control prints no text, so the
 * only thing left to name it by is the picture on it. Guarded against an unknown key
 * so a stale recording can never put a bare `icons.foo` in front of a reader.
 */
function iconTarget(icon: string | null | undefined): string | null {
  if (!icon || !(ICON_HINTS as readonly string[]).includes(icon)) return null;
  return i18n.t('steps.iconTarget', [i18n.t(`icons.${icon}` as 'icons.save')]);
}

export function buildFallbackDescription(action: string, meta: ElementMeta): string {
  const target =
    meta.fieldLabel ||
    meta.ariaLabel ||
    meta.placeholder ||
    meta.textContent?.slice(0, 80) ||
    meta.altText ||
    // Before the tag: on an icon toolbar the tooltip is the only label there is.
    meta.tooltip ||
    iconTarget(meta.icon) ||
    meta.name ||
    meta.role ||
    meta.tag;

  if (action.startsWith('keydown:')) {
    const key = action.split(':')[1];
    return i18n.t('steps.pressKey', [key, target]);
  }

  switch (action) {
    case 'click':
    case 'auxclick':
      if (meta.tag === 'input' && meta.inputType === 'checkbox') return i18n.t('steps.toggleCheckbox', [target]);
      if (meta.tag === 'input' && meta.inputType === 'radio') return i18n.t('steps.selectRadio', [target]);
      if (meta.role === 'switch') return i18n.t('steps.toggleSwitch', [target]);
      if (meta.role === 'checkbox') return i18n.t('steps.toggleCheckbox', [target]);
      if (meta.role === 'radio') return i18n.t('steps.selectRadio', [target]);
      if (meta.href) return i18n.t('steps.clickLink', [target]);
      return i18n.t('steps.click', [target]);
    case 'input':
      // Naming the field beats naming its input type: "In Feld text eingeben input"
      // told the reader nothing, because the tag was standing in for a missing label.
      if (meta.fieldLabel) return i18n.t('steps.typeInto', [meta.fieldLabel]);
      if (meta.inputType) return i18n.t('steps.typeIntoField', [meta.inputType, target]);
      return i18n.t('steps.typeInto', [target]);
    case 'copy':
      return i18n.t('steps.copyFrom', [target]);
    case 'paste':
      return i18n.t('steps.pasteInto', [target]);
    case 'cut':
      return i18n.t('steps.cutFrom', [target]);
    case 'drag':
      return i18n.t('steps.drag', [target]);
    case 'navigate':
      return i18n.t('steps.navigate');
    default:
      return i18n.t('steps.defaultAction', [action, target]);
  }
}
