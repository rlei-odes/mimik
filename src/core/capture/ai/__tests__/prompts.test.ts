import { describe, expect, it } from 'vitest';
import { AI_LANGUAGES, buildStepPrompt, GUIDE_META_PROMPT, getLanguageSuffix, getStepExamples } from '../prompts';

describe('step caption examples', () => {
  it('gives German examples when the guide language is German', () => {
    expect(getStepExamples('de')).toContain('Klicken Sie auf die Schaltfläche Senden');
  });

  it('gives German examples for a regional German locale too', () => {
    expect(getStepExamples('de-AT')).toContain('Klicken Sie');
  });

  it('falls back to English for a language with no examples of its own', () => {
    expect(getStepExamples('sv')).toContain('Click the Submit button');
  });

  it('shows how a menu selection should read, which bare tags never conveyed', () => {
    expect(getStepExamples('de')).toContain('Menü');
    expect(getStepExamples('en')).toContain('menu');
  });
});

describe('buildStepPrompt', () => {
  it('places the page context into the prompt', () => {
    expect(buildStepPrompt('→ Target: "Herunterladen" (click)', 'de')).toContain('→ Target: "Herunterladen" (click)');
  });

  it('leaves no placeholder unfilled', () => {
    const prompt = buildStepPrompt('→ Target: "X" (click)', 'de');
    expect(prompt).not.toContain('{{context}}');
    expect(prompt).not.toContain('{{examples}}');
  });

  it('pairs German examples with the German output instruction', () => {
    const prompt = buildStepPrompt('→ Target: "X" (click)', 'de');
    expect(prompt).toContain('Klicken Sie auf die Schaltfläche Senden');
    expect(prompt).toContain('Write the output in German');
  });

  it('carries no language instruction for English, which is the default', () => {
    expect(buildStepPrompt('→ Target: "X" (click)', 'en')).not.toContain('IMPORTANT');
  });

  it('tells the model the caption accompanies a screenshot', () => {
    const prompt = buildStepPrompt('→ Target: "X" (click)', 'en');
    expect(prompt).toContain('screenshot');
    expect(prompt).toContain('outlined');
  });

  it('keeps the rule that labels are never translated', () => {
    expect(buildStepPrompt('→ Target: "X" (click)', 'de')).toContain('never the label itself');
  });
});

describe('GUIDE_META_PROMPT', () => {
  it('has a steps placeholder', () => {
    expect(GUIDE_META_PROMPT).toContain('{{steps}}');
  });

  it('keeps the 60-character title constraint', () => {
    expect(GUIDE_META_PROMPT).toContain('60 characters');
  });

  it('asks for a description of one or two sentences', () => {
    expect(GUIDE_META_PROMPT.toLowerCase()).toContain('description');
    expect(GUIDE_META_PROMPT).toMatch(/one or two sentences/i);
  });
});

describe('getLanguageSuffix', () => {
  it('returns empty string for English', () => {
    expect(getLanguageSuffix('en')).toBe('');
  });

  it('returns empty string for en-US', () => {
    expect(getLanguageSuffix('en-US')).toBe('');
  });

  it('returns Spanish suffix for es', () => {
    expect(getLanguageSuffix('es')).toContain('Spanish');
  });

  it('returns French suffix for fr', () => {
    expect(getLanguageSuffix('fr')).toContain('French');
  });

  it('returns Chinese suffix for zh-CN', () => {
    expect(getLanguageSuffix('zh-CN')).toContain('Chinese');
  });

  it('returns Brazilian Portuguese suffix for pt-BR', () => {
    expect(getLanguageSuffix('pt-BR')).toContain('Brazilian Portuguese');
  });

  it('returns the locale code for unknown languages', () => {
    expect(getLanguageSuffix('sv')).toContain('sv');
  });

  it('includes IMPORTANT instruction', () => {
    const suffix = getLanguageSuffix('es');
    expect(suffix).toContain('IMPORTANT');
    expect(suffix).toContain('Write the output in');
  });
});

describe('AI_LANGUAGES', () => {
  it('has 6 supported languages', () => {
    expect(AI_LANGUAGES).toHaveLength(6);
  });

  it('includes English as first entry', () => {
    expect(AI_LANGUAGES[0]).toEqual({ code: 'en', label: 'English' });
  });

  it('includes Simplified Chinese', () => {
    expect(AI_LANGUAGES).toContainEqual({ code: 'zh-CN', label: '中文' });
  });

  it('each entry has code and label', () => {
    for (const lang of AI_LANGUAGES) {
      expect(lang.code).toBeTruthy();
      expect(lang.label).toBeTruthy();
    }
  });
});
