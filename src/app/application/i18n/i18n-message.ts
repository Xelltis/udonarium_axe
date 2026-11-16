import { TranslateFn } from '@axe/application/i18n/translate.token';

const I18N_PREFIX = '@i18n:';
const SEP = ':';
/** The key under which several packed messages travel as one, to be joined once each is translated. */
const LIST_KEY = '#list';

/**
 * Packs a translation key and its parameters into text that can be stored in a synced object.
 *
 * Each reader decodes it into their own language, so a notice written once reads right for
 * everyone. A parameter may itself be packed text, which is translated before it is filled in, so
 * a notice can name a translated thing inside it.
 */
export function encodeI18nMessage(key: string, params: Record<string, unknown> = {}): string {
  return I18N_PREFIX + key + SEP + JSON.stringify(params);
}

/**
 * Packs several texts, packed or plain, into one that reads as all of them in a row with the
 * separator between, each translated by the reader.
 */
export function encodeI18nList(parts: readonly string[], separator = ' '): string {
  return encodeI18nMessage(LIST_KEY, { parts, separator });
}

/** Whether this text was packed by `encodeI18nMessage` rather than written as it is. */
export function isI18nMessage(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.startsWith(I18N_PREFIX);
}

/**
 * Translates packed text into the reader's language, its packed parameters and the parts of a
 * packed list with it.
 *
 * Text that was never packed, or whose parameters no longer parse, comes back unchanged.
 */
export function decodeI18nMessage(text: string | null | undefined, t: TranslateFn): string {
  if (!isI18nMessage(text)) return text ?? '';
  const body = (text as string).slice(I18N_PREFIX.length);
  const sepIndex = body.indexOf(SEP);
  if (sepIndex < 0) return text as string;
  const key = body.slice(0, sepIndex);
  const paramsRaw = body.slice(sepIndex + 1);
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(paramsRaw) as Record<string, unknown>;
  } catch {
    return text as string;
  }
  if (key === LIST_KEY) {
    const parts = Array.isArray(params['parts']) ? (params['parts'] as unknown[]) : [];
    const separator = typeof params['separator'] === 'string' ? params['separator'] : ' ';
    return parts.map((part) => decodeValue(part, t)).join(separator);
  }
  const decoded: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(params)) decoded[name] = decodeValue(value, t);
  return t(key, decoded);
}

function decodeValue(value: unknown, t: TranslateFn): unknown {
  if (typeof value === 'string') return isI18nMessage(value) ? decodeI18nMessage(value, t) : value;
  if (Array.isArray(value)) return value.map((one) => decodeValue(one, t));
  return value;
}
