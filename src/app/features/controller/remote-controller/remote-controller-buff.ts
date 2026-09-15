import { BuffAppearance, parseBuffAppearance } from '@axe/domain/character/buff-appearance';
import { GameCharacter } from '@axe/domain/character/game-character';
import type { ResourceSlot } from '@axe/domain/data/resource-slot';

export interface RemoteControllerSelect {
  /** The item the buttons point at. Empty where none has been picked out. */
  name: string;
  nowOrMax: ResourceSlot;
  dispName: string;
}

export interface ParsedBuffInput {
  buffname: string;
  sub: string;
  round: number;
  bufftext: string;
  appearance: BuffAppearance;
}

/**
 * Reads a line typed into the remote controller's buff field as a buff to put on the targets.
 *
 * The words are, separated by spaces: the buff's name, an optional note such as `攻撃+2`, an optional
 * number of rounds (3 when missing or not a number), and then any colour, timing, `@trigger` or
 * icon words. The chat line announcing it joins them with slashes and marks the rounds with `R`. An
 * empty line is null.
 */
export function parseBuffInput(text: string): ParsedBuffInput | null {
  const parts = text.split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return null;
  const buffname = parts[0];
  let bufftext = parts[0];
  let sub = '';
  let round = 3;
  if (parts.length > 1) {
    sub = parts[1];
    bufftext += '/' + parts[1];
  }
  if (parts.length > 2) {
    round = parseInt(parts[2]);
    if (Number.isNaN(round)) round = 3;
  }
  bufftext += '/' + round + 'R';
  const appearance = parseBuffAppearance(parts.slice(3));
  for (const token of parts.slice(3)) bufftext += '/' + token;
  return { buffname, sub, round, bufftext, appearance };
}

/**
 * Puts the same buff on each of the given characters for the given number of rounds; a buff one
 * already has starts over with the new values.
 */
export function addBuffRound(
  characters: GameCharacter[],
  name: string,
  info: string,
  round: number,
  appearance: BuffAppearance = {}
): void {
  for (const character of characters) {
    character.buffs.addRound(name, info, round, appearance);
  }
}

/** Steps every buff on the given pieces down a round, and names the pieces it touched. */
export function decreaseBuffRound(characters: readonly GameCharacter[]): string {
  return actOnBuffs(characters, (character) => character.buffs.decreaseRound());
}

/** Clears the buffs that have run out on the given pieces, and names the pieces it touched. */
export function deleteZeroRoundBuffs(characters: readonly GameCharacter[]): string {
  return actOnBuffs(characters, (character) => character.buffs.deleteZeroRound());
}

function actOnBuffs(characters: readonly GameCharacter[], act: (character: GameCharacter) => void): string {
  if (characters.length < 1) return '';
  const names: string[] = [];
  for (const character of characters) {
    act(character);
    names.push(`[${character.name}]`);
  }
  return names.join('');
}
