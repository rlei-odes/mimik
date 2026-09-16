import { generateText } from 'ai';
import { localStorage } from '@/lib/browser-api';
import type { DOMContext } from '../dom/context';
import { serializeDOMContext } from '../dom/context';
import { buildStepPrompt, DEFAULT_AI_LANGUAGE } from './prompts';
import { createModel } from './provider';

export async function getAIDescription(
  domContext: DOMContext,
  provider: string,
  model: string,
  apiKey: string,
  baseUrl?: string,
): Promise<string | null> {
  const settings = await localStorage.get(['aiLanguage']);
  const locale = (settings.aiLanguage as string) || DEFAULT_AI_LANGUAGE;
  const { text } = await generateText({
    model: createModel(provider, model, apiKey, baseUrl),
    prompt: buildStepPrompt(serializeDOMContext(domContext), locale),
    maxOutputTokens: 50,
  });
  return text.trim().replace(/^"|"$/g, '') || null;
}
