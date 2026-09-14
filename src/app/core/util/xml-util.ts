import { Logger } from '@axe/core/logging/logger';
import { decodeXML, escapeUTF8 } from 'entities';

/**
 * Parses XML into its root element, or null when it does not parse, logging why.
 *
 * Characters XML does not allow are removed first, so data with stray control characters still
 * loads.
 */
export function xml2element(xml: string): HTMLElement | null {
  const domParser: DOMParser = new DOMParser();
  let xmlDocument: Document | null = null;
  try {
    xml = sanitizeXml(xml);
    xmlDocument = domParser.parseFromString(xml, 'application/xml');
    const parsererror = xmlDocument.getElementsByTagName('parsererror');
    if (parsererror.length) {
      Logger.error('[XML] パース失敗', xmlDocument.documentElement);
      xmlDocument = null;
    }
  } catch (error) {
    Logger.error('[XML] パースエラー', error);
  }
  return xmlDocument ? xmlDocument.documentElement : null;
}

/**
 * Escapes a value for XML text or an attribute, turning markup characters into entity references
 * and leaving the rest as it is.
 */
export function encodeEntityReference(string: string): string {
  return escapeUTF8(string);
}

/** Turns XML entity and character references back into the characters they stand for. */
export function decodeEntityReference(string: string): string {
  return decodeXML(string);
}

function isUnwantedAt(xml: string, index: number): boolean {
  const code = xml.charCodeAt(index);
  if (code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f)) return true;
  if (code >= 0xfffd) return true;
  if (code >= 0xd800 && code <= 0xdbff) {
    const next = index + 1 < xml.length ? xml.charCodeAt(index + 1) : 0;
    return next < 0xdc00 || next > 0xdfff;
  }
  if (code >= 0xdc00 && code <= 0xdfff) {
    const previous = index > 0 ? xml.charCodeAt(index - 1) : 0;
    return previous < 0xd800 || previous > 0xdbff;
  }
  return false;
}

/**
 * Removes the characters XML does not allow, such as control characters, unpaired surrogates and
 * the replacement character, and trims both ends.
 */
export function sanitizeXml(xml: string): string {
  let kept = '';
  let from = 0;
  for (let index = 0; index < xml.length; index++) {
    if (!isUnwantedAt(xml, index)) continue;
    kept += xml.slice(from, index);
    from = index + 1;
  }
  return (from === 0 ? xml : kept + xml.slice(from)).trim();
}
