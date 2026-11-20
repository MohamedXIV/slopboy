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
  if (fenced && !fenced[2].includes('```')) {
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

/** The browser does not truncate Unicode source: limits are on UTF-8 bytes. */
export function sourceByteLength(source: string): number {
  return new TextEncoder().encode(source).byteLength;
}

type TabStorage = Pick<Storage, 'getItem' | 'setItem'>;
const TAB_SEED_KEY = 'slopboy:private-source-submission-seed:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let volatileSeed: string | null = null;

/** Only a random nonce lives in sessionStorage. No source text or hash is stored. */
export function getTabSubmissionSeed(storage?: TabStorage): string {
  try {
    const tab = storage ?? window.sessionStorage;
    const saved = tab.getItem(TAB_SEED_KEY);
    if (saved && UUID.test(saved)) return saved;
    const fresh = crypto.randomUUID();
    tab.setItem(TAB_SEED_KEY, fresh);
    return fresh;
  } catch {
    // Private browsing may deny storage. Keep in-memory retry safety in that case.
    return (volatileSeed ??= crypto.randomUUID());
  }
}

/** Confirmed saves start a new operation, permitting another identical draft. */
export function rotateTabSubmissionSeed(storage?: TabStorage) {
  const fresh = crypto.randomUUID();
  volatileSeed = fresh;
  try {(storage ?? window.sessionStorage).setItem(TAB_SEED_KEY, fresh);} catch {/* fallback in memory */}
}

/** Secret-salted deterministic UUID: same payload after reload, different after an edit. */
export async function scopedSubmissionId(seed: string, scope: string, payload: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify([seed, scope, payload]))));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
