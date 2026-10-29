import { normalizeSearchText } from '@axe/core/util/text-search';

/** `position` counts from 1, the way every portrait picker in the app numbers them. */
export type PortraitCommand =
  { type: 'none' } | { type: 'hide' } | { type: 'index'; position: number } | { type: 'name'; name: string };

export interface ImageNameEntry {
  label: string;
  identifier: string;
}

export interface ImageIdentifierResult {
  identifier: string;
  index: number;
}

/** Where a trailing portrait command sits in a line: `from` is the `@`, `to` the end of its word. */
export interface PortraitCommandSite {
  command: Exclude<PortraitCommand, { type: 'none' }>;
  from: number;
  to: number;
}

const PORTRAIT_TAIL = /\s[@＠](\S+)\s*$/i;

/**
 * Finds the `@name`, `@3` or `@hide` at the end of a line, which picks the portrait it is spoken
 * with, and where it stands.
 *
 * The command must follow a space, so an address such as `mail@example.com` is not one. Full-width
 * `＠` counts too.
 */
export function portraitCommandSite(text: string): PortraitCommandSite | null {
  const match = PORTRAIT_TAIL.exec(' ' + text);
  if (!match) return null;
  const token = match[1];
  const from = match.index;
  const to = from + 1 + token.length;
  const normalized = normalizeSearchText(token);
  if (normalized === 'hide') return { command: { type: 'hide' }, from, to };
  if (/^\d+$/.test(normalized)) return { command: { type: 'index', position: parseInt(normalized, 10) }, from, to };
  return { command: { type: 'name', name: token }, from, to };
}

/**
 * Reads an `@name`, `@3` or `@hide` at the end of a line, which picks the portrait it is spoken
 * with.
 *
 * Full-width `＠` counts too. Anything else at the end of the line reads as no command.
 */
export function parsePortraitCommand(text: string): PortraitCommand {
  return portraitCommandSite(text)?.command ?? { type: 'none' };
}

/**
 * Whether a portrait can be picked by its name at the end of a line: `@name` written there reads
 * back as that name. A name with a space in it does not, as the command is one word, nor one read
 * as a position or as `hide`.
 */
export function portraitNamedAtLineEnd(name: string): boolean {
  const command = portraitCommandSite(`@${name}`)?.command;
  return command?.type === 'name' && command.name === name;
}

/** The line with its trailing portrait command taken off, so the command itself is never shown. */
export function stripPortraitCommand(text: string): string {
  return text.replace(/([@＠]\S+\s*)$/i, '');
}

/**
 * Finds the portrait a name picks: an exact label first, else the first label that starts with it.
 *
 * Labels and the name are compared after search normalisation, so width and case do not matter. No
 * match, or an empty name, answers an empty identifier at index 0.
 */
export function findImageIdentifierByName(entries: ImageNameEntry[], name: string): ImageIdentifierResult {
  const wanted = normalizeSearchText(name);
  if (wanted.length < 1) return { identifier: '', index: 0 };

  const labels = entries.map((entry) => normalizeSearchText(entry.label));

  for (let i = 0; i < entries.length; i++) {
    if (labels[i].length > 0 && labels[i] === wanted) {
      return { identifier: entries[i].identifier, index: i };
    }
  }

  for (let i = 0; i < entries.length; i++) {
    if (labels[i].length > 0 && labels[i].startsWith(wanted)) {
      return { identifier: entries[i].identifier, index: i };
    }
  }

  return { identifier: '', index: 0 };
}
