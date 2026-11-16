import { DataElement } from '@axe/domain/data/data-element';
import { tagLeafNames } from '@axe/domain/data/summary-tag-list';

/**
 * One name a room gives to the same value kept under different names on different sheets.
 *
 * The candidates are references as a sheet's items are referred to anywhere, a path or a bare name,
 * in the order they are tried.
 */
export interface ElementAlias {
  readonly name: string;
  readonly candidates: readonly string[];
}

/** Every alias of a room, in the order the room lists them. */
export type ElementAliasTable = readonly ElementAlias[];

/** The table of a room that has named no alias. */
export const NO_ELEMENT_ALIASES: ElementAliasTable = Object.freeze([]);

/**
 * Reads a room's aliases as they were sent or saved.
 *
 * Text that is not such a list gives none, so a room saved before there were aliases has none. An
 * entry without a name or with a blank one is passed over, as is a candidate that is not text or
 * is blank, and of two entries under one name the first is kept. Names and candidates come back
 * trimmed.
 */
export function readElementAliases(raw: unknown): ElementAlias[] {
  if (typeof raw !== 'string' || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const aliases: ElementAlias[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const { name, candidates } = entry as Record<string, unknown>;
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (trimmed.length < 1 || aliases.some((alias) => alias.name === trimmed)) continue;
    const kept: string[] = [];
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      if (typeof candidate !== 'string') continue;
      const reference = candidate.trim();
      if (reference.length > 0 && !kept.includes(reference)) kept.push(reference);
    }
    aliases.push({ name: trimmed, candidates: kept });
  }
  return aliases;
}

/** Writes aliases down as the text {@link readElementAliases} reads back. Empty when there are none. */
export function writeElementAliases(aliases: ElementAliasTable): string {
  return aliases.length > 0
    ? JSON.stringify(aliases.map(({ name, candidates }) => ({ name, candidates: [...candidates] })))
    : '';
}

/** The alias a reference names, or null when the room has none under that name. */
export function aliasNamed(aliases: ElementAliasTable, reference: string): ElementAlias | null {
  if (aliases.length < 1) return null;
  const name = reference.trim();
  if (name.length < 1) return null;
  return aliases.find((alias) => alias.name === name) ?? null;
}

/**
 * Every item of a sheet an alias stands for, in the order of its candidates and each once.
 *
 * A candidate that names nothing on the sheet, or a bare name several items answer to, is passed
 * over. The first is the one the alias is read from; a value written through the alias goes to
 * them all.
 */
export function aliasTargetsOn(root: DataElement, alias: ElementAlias): DataElement[] {
  const targets: DataElement[] = [];
  for (const candidate of alias.candidates) {
    const element = DataElement.findElementByReference(root, candidate);
    if (element && !targets.includes(element)) targets.push(element);
  }
  return targets;
}

/**
 * Every item a reference stands for on a sheet: the items of the alias it names, or the one item
 * it names itself, and none where it names nothing.
 *
 * An alias comes before an item of the same name, and an alias none of whose candidates is on the
 * sheet stands for nothing there rather than falling back to that item.
 */
export function elementsReferredTo(root: DataElement, reference: string, aliases: ElementAliasTable): DataElement[] {
  const alias = aliasNamed(aliases, reference);
  if (alias) return aliasTargetsOn(root, alias);
  const element = DataElement.findElementByReference(root, reference);
  return element ? [element] : [];
}

/** The item a reference is read from on a sheet: the first of {@link elementsReferredTo}, or null. */
export function elementReferredTo(
  root: DataElement,
  reference: string,
  aliases: ElementAliasTable
): DataElement | null {
  const alias = aliasNamed(aliases, reference);
  if (!alias) return DataElement.findElementByReference(root, reference);
  for (const candidate of alias.candidates) {
    const element = DataElement.findElementByReference(root, candidate);
    if (element) return element;
  }
  return null;
}

/**
 * The other items of the same sheet that share an alias with an item, each once.
 *
 * These are the items that take the same value when the item is edited. An item no alias stands
 * for has none.
 */
export function aliasMatesOf(element: DataElement, aliases: ElementAliasTable): DataElement[] {
  if (aliases.length < 1) return [];
  const root = DataElement.getDetailNameScope(element);
  if (root === element) return [];

  const mates: DataElement[] = [];
  for (const alias of aliases) {
    const targets = aliasTargetsOn(root, alias);
    if (!targets.includes(element)) continue;
    for (const target of targets) {
      if (target !== element && !mates.includes(target)) mates.push(target);
    }
  }
  return mates;
}

/**
 * The names whose items decide what a list of references shows: the name at the end of each
 * reference, and for a reference that is an alias the name at the end of each of its candidates.
 *
 * A view that follows items by name watches these, so a column or an order written as an alias
 * follows the items behind it.
 */
export function watchedLeafNames(references: readonly string[], aliases: ElementAliasTable): string[] {
  const expanded: string[] = [];
  for (const reference of references) {
    expanded.push(reference);
    const alias = aliasNamed(aliases, reference);
    if (alias) expanded.push(...alias.candidates);
  }
  return tagLeafNames(expanded);
}
