export const STEP_DESCRIPTION_PROMPT = `You are writing one caption for an illustrated software guide. Each caption sits underneath a screenshot of the application, with the control the user acted on outlined in the image, and the reader has that same application open in front of them while following along.

The context below was read from the page at the moment of the action. It lists the control that was used, what surrounds it, and where in the application it sits:

{{context}}

Rules:
- Describe one action, addressed to the reader.
- Name a control the way it looks on screen. Never use markup or technical words such as div, span, anchor, input, node or element, even if they appear above.
- Reproduce interface labels exactly as written, keeping their original language, capitalisation and punctuation. Translate the sentence around a label, never the label itself.
- Labels in business software are often product-specific terms. Treat a quoted label as a literal string printed on screen, never as a word to interpret, expand or correct.
- When no name is given for the control, describe what it does rather than inventing a label.
- The reader can see the screenshot, so do not describe the layout, colours or position of anything.

Examples of good captions:
{{examples}}

Write only the caption, no preamble.`;

/**
 * Few-shot examples carry more style than any instruction does, so a reader writing
 * in German gets German ones. Anything without its own set falls back to English,
 * which still beats no examples at all.
 */
const STEP_EXAMPLES: Record<string, string[]> = {
  en: [
    'Click the Submit button',
    'Enter the email address in the Email field',
    "Select 'Admin' from the Role dropdown",
    'Choose Movements from the File menu',
    'Open the Settings page',
  ],
  de: [
    'Klicken Sie auf die Schaltfläche Senden',
    'Geben Sie die E-Mail-Adresse in das Feld E-Mail ein',
    'Wählen Sie in der Auswahlliste Rolle den Eintrag Admin aus',
    'Wählen Sie im Menü Datei den Eintrag Bewegungen',
    'Öffnen Sie die Seite Einstellungen',
  ],
};

export function getStepExamples(locale: string): string {
  const examples = STEP_EXAMPLES[locale.split('-')[0]] ?? STEP_EXAMPLES.en;
  return examples.map((line) => `- "${line}"`).join('\n');
}

export function buildStepPrompt(context: string, locale: string): string {
  return (
    STEP_DESCRIPTION_PROMPT.replace('{{context}}', context).replace('{{examples}}', getStepExamples(locale)) +
    getLanguageSuffix(locale)
  );
}

export const GUIDE_META_PROMPT = `These are the steps of a browser workflow, with the page URL and description for each step:

{{steps}}

Write a title and a description for this workflow.

TITLE: specific and descriptive. Mention the application or website name and the specific task performed. Reference specific pages, features, or items that were interacted with. MUST be under 60 characters.

Examples of good titles:
- "Review claude-code Pull Requests"
- "Configure Slack Notification Preferences"
- "Submit Expense Report in Workday"
- "Create Repository in GitHub Organization"

DESCRIPTION: one or two sentences stating what the workflow accomplishes and who would follow it. Do not repeat the title. Do not list the individual steps. Do not mention any UI element that does not appear in the steps above.

Examples of good descriptions:
- "Reset a locked-out user's password from the Okta admin panel. For IT support staff."
- "Configure which Slack channels send desktop notifications, and set a do-not-disturb schedule."`;

export const GUIDE_META_JSON_SUFFIX = `

Reply with nothing but a JSON object shaped {"title": string, "description": string}. No code fence, no commentary.`;

export const REWRITE_PROMPT = `You are editing one span of text inside a browser workflow guide. The text describes a step a reader must perform, or summarises what the workflow accomplishes.

Selected text:
"""
{{text}}
"""

Instruction: {{instruction}}

Rules:
- Keep it imperative and describing a single action when the original does.
- Never introduce a UI element, button, page, or value that is absent from the original.
- Preserve specific names, labels, and quoted strings exactly as written.
- Match the length the instruction implies; otherwise stay close to the original length.

Return only the rewritten text. No preamble, no quotes, no explanation.`;

export const REWRITE_PRESETS = {
  shorter: 'Make it shorter and tighter without losing any required detail.',
  detail: 'Add detail that clarifies the action, using only information already present.',
  grammar: 'Fix grammar, spelling, and punctuation. Change nothing else.',
  formal: 'Make the tone more formal and professional.',
  casual: 'Make the tone more casual and conversational.',
} as const;

export type RewritePreset = keyof typeof REWRITE_PRESETS;

export const AI_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '中文' },
  { code: 'es', label: 'Español' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
] as const;

export type AILanguageCode = (typeof AI_LANGUAGES)[number]['code'];

/** This fork is used internally, where guides are written in German. */
export const DEFAULT_AI_LANGUAGE: AILanguageCode = 'de';

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  fr: 'French',
  pt: 'Brazilian Portuguese',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
};

export function getLanguageSuffix(locale: string): string {
  if (locale.startsWith('en')) return '';
  const lang = LANGUAGE_NAMES[locale.split('-')[0]] || locale;
  // The labels come from the page and are already in the user's language. Translating
  // them would leave the reader hunting for a control that is not on screen.
  return `\nIMPORTANT: Write the output in ${lang}. Interface labels quoted from the page keep their original wording — translate the sentence around them, never the labels themselves.`;
}
