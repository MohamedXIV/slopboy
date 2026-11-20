import {PRIVATE_SOURCE_TEMPLATE} from '@slopboy/cartridge/private-source-template';

export type SourceLanguage = 'typescript' | 'javascript';
export type SourceIntent = 'validate' | 'save';

/** Clipboard normalization is a convenience, never a validation/security boundary. */
export function normalizePastedSource(text: string): {
  source: string;
  language: SourceLanguage | null;
  warning: string | null;
} {
  const fenced = /^\s*```(ts|typescript|js|javascript)\s*\r?\n([\s\S]*?)\r?\n```\s*$/i.exec(text);
  if (fenced) {
    return {
      source: fenced[2],
      language: /^(ts|typescript)$/i.test(fenced[1]) ? 'typescript' : 'javascript',
      warning: null,
    };
  }
  return {
    source: text,
    language: null,
    warning: text.includes('```')
      ? 'Paste one TypeScript/JavaScript code block or raw source, without other Markdown or explanations.'
      : null,
  };
}

export function newGameSourceRequest(title: string, description: string,
  language: SourceLanguage, source: string, intent: SourceIntent, submission?: string) {
  return {...existingGameSourceRequest(language, source, intent, submission),
    metadata: {title, description, genre: 'Other'}};
}

export function existingGameSourceRequest(language: SourceLanguage, source: string,
  intent: SourceIntent, submission?: string) {
  return {intent, content: {engine: PRIVATE_SOURCE_TEMPLATE.id,
    version: PRIVATE_SOURCE_TEMPLATE.version, language, source}, ...(submission ? {submission} : {})};
}

export type PendingSubmission = {payload: string; id: string};
/** An uncertain network retry must not accidentally append another revision. */
export function reuseSubmission(previous: PendingSubmission | null, payload: string,
  newId: () => string): PendingSubmission {
  return previous?.payload === payload ? previous : {payload, id: newId()};
}
