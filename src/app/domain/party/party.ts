import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { parseAttributesKeepingIdentifier, toAttributesKeepingIdentifier } from '@axe/core/sync/persisted-identifier';

export const PARTY_COLORS = ['#7dd3fc', '#fca5a5', '#bef264', '#fcd34d', '#c4b5fd', '#f9a8d4'] as const;

@SyncObject('party')
export class Party extends GameObject {
  @SyncVar() name: string = '';
  @SyncVar() color: string = PARTY_COLORS[0];
  /**
   * The parties this one stands with, by identifier, written one after another.
   *
   * A table of two sides needs none of this: everybody not in your party is against you. A
   * table with allied villagers, a rival band that has thrown in with the heroes, or three
   * sides where two have made terms needs a way to say so, and this is it.
   */
  @SyncVar() allies: string = '';

  /** The parties it stands with, as identifiers. */
  get alliedWith(): string[] {
    return readAllies(this.allies);
  }

  /**
   * The identifier is written out with the name and colour.
   *
   * Characters name their party by its identifier, so a party read back under a new one would
   * leave every member of it in no party at all.
   */
  toAttributes(): Attributes {
    return toAttributesKeepingIdentifier(this);
  }

  /** Reads the name and colour back from a file, taking up the identifier written with them. */
  parseAttributes(attributes: NamedNodeMap): void {
    parseAttributesKeepingIdentifier(this, attributes);
  }
}

/**
 * The first party colour not in use yet, or, when every one is taken, the next one round the
 * palette.
 */
export function nextPartyColor(usedColors: readonly string[]): string {
  const free = PARTY_COLORS.find((color) => !usedColors.includes(color));
  return free ?? PARTY_COLORS[usedColors.length % PARTY_COLORS.length];
}

/** Reads a written list of allies, dropping the blanks and the repeats. */
export function readAllies(written: string): string[] {
  return [...new Set(written.split(' ').filter((held) => held.length > 0))];
}

/** Writes a list of allies back, which is the identifiers with a space between them. */
export function writeAllies(allies: readonly string[]): string {
  return [...new Set(allies.filter((held) => held.length > 0))].join(' ');
}
