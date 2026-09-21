import { i18n } from '#imports';
import { logger } from '@/lib/logger';
import { sendMessage } from '@/lib/messaging';
import { extractDOMContext } from '../dom/context';
import { extractElementMeta, type FrozenRect, freezeRect } from '../dom/element-meta';
import { getFieldLabel, getFieldValue, isRedactedField, isSensitiveField } from '../dom/element-utils';

export class InputSession {
  stepId: string | null = null;
  target: HTMLElement | null = null;

  private guideId: string;
  private atEvent: FrozenRect | undefined;
  private typed = false;
  private shortcut: { chord: string; target: HTMLElement } | null = null;

  constructor(guideId: string) {
    this.guideId = guideId;
  }

  get active() {
    return this.stepId !== null;
  }

  /** Typing always wins: once there is text to report, that is what the step is about. */
  markTyped() {
    this.typed = true;
    this.shortcut = null;
  }

  /**
   * Records a command chord pressed in a field, against the field it was pressed in.
   *
   * Deliberately accepted before the session exists. `start` only returns once the
   * background has taken the screenshot and handed back a step id, and the case this
   * is for — click a field, immediately press the chord — reliably beats that round
   * trip. Requiring an active session here dropped the chord nearly every time.
   */
  noteShortcut(chord: string, target: HTMLElement) {
    if (!this.typed) this.shortcut = { chord, target };
  }

  async start(target: HTMLElement, atEvent?: FrozenRect) {
    this.atEvent = atEvent;
    const res = await sendMessage('captureStep', {
      guideId: this.guideId,
      action: 'input',
      elementMeta: extractElementMeta(target, atEvent),
      domContext: extractDOMContext(target, 'input'),
    });
    if ('stepId' in res) {
      this.stepId = res.stepId;
      this.target = target;
    }
  }

  update(target: HTMLElement) {
    if (!this.stepId) return;
    this.atEvent = freezeRect(target);
    const label = getFieldLabel(target);
    if (isSensitiveField(target) || isRedactedField(target)) {
      const description = isSensitiveField(target) ? i18n.t('steps.typeSecret') : i18n.t('steps.typeInto', [label]);
      sendMessage('updateInputStep', { stepId: this.stepId, description }).catch((err) =>
        logger.warn('Failed to update input step', err),
      );
      return;
    }
    const val = getFieldValue(target);
    const desc = val ? i18n.t('steps.typeValue', [val, label]) : i18n.t('steps.clearField', [label]);
    sendMessage('updateInputStep', { stepId: this.stepId, description: desc, inputValue: val || undefined }).catch(
      (err) => logger.warn('Failed to update input step', err),
    );
  }

  async finalize() {
    if (!this.target || !this.stepId) return;
    const target = this.target;
    const stepId = this.stepId;
    const atEvent = this.atEvent;
    // Only a chord pressed in this very field belongs to this step; one left over
    // from a field the user moved on from does not.
    const shortcut = this.shortcut?.target === target ? this.shortcut.chord : undefined;
    this.stepId = null;
    this.target = null;
    this.atEvent = undefined;
    this.typed = false;
    this.shortcut = null;
    await sendMessage('finalizeInputStep', {
      stepId,
      elementMeta: extractElementMeta(target, atEvent),
      domContext: extractDOMContext(target, 'input'),
      shortcut,
    });
  }
}
