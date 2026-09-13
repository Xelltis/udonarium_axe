import { GameCharacter } from '@axe/domain/character/game-character';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';

/**
 * The dice a character keeps.
 *
 * They live on the sheet rather than beside it, so they travel with the character: saved
 * with the room, carried out with the character and read back with either. A die kept
 * this way is data — how many there are and what is on each face — and becomes a die on
 * the table only when it is laid out.
 *
 * The shape follows the sheet's own: a section holds one group per die, whose name is the
 * die's, and the fields of that group are the count and one picture per face. Nothing new
 * has to be taught to the sheet editor, so the pictures can be changed there by hand.
 */

export const HELD_DICE_SECTION = '所持ダイス';
export const HELD_DICE_COUNT = '個数';
export const HELD_DICE_SHOWN = '出目';
export const HELD_DICE_ROW_HEADER = 'ダイス';
const SHOWN_SEPARATOR = ', ';

export interface HeldDieFace {
  /** What the face shows, which is also what the field is called. */
  label: string;
  imageIdentifier: string;
}

export interface HeldDie {
  name: string;
  count: number;
  faces: HeldDieFace[];
  /**
   * What each of them was showing when it was put away, in that order.
   *
   * A die keeps the face it came to rest on, so a set put away mid-scene comes back out as
   * it was left. Left off where a die was written onto the sheet by hand, and where the die
   * was kept to its owner: the sheet is read by whoever may read the sheet.
   */
  shown?: string[];
}

/** The dice on a character's sheet, in the order they were put there. */
export function heldDiceOf(character: GameCharacter): HeldDie[] {
  const section = heldDiceSection(character);
  if (!section) return [];

  const dice: HeldDie[] = [];
  for (const group of section.children) {
    if (!(group instanceof DataElement)) continue;
    const die = heldDieFromGroup(group);
    if (die) dice.push(die);
  }
  return dice;
}

/** A die standing on the table, read as one to keep. */
export function heldDieOfSymbol(symbol: DiceSymbol, count = 1): HeldDie {
  const faces = (symbol.imageDataElement?.children ?? [])
    .filter((face): face is DataElement => face instanceof DataElement)
    .map<HeldDieFace>((face) => ({ label: face.name, imageIdentifier: String(face.value ?? '') }));

  const shown: string[] = symbol.hasOwner ? [] : Array(count).fill(symbol.face);
  return { name: symbol.name, count, faces, shown };
}

/**
 * Puts a die onto the sheet, and says whether it was kept.
 *
 * A die of the same name is the same die, so it is counted rather than written again;
 * a table of six identical dice is a count of six, not six groups to read past.
 */
export function storeHeldDie(character: GameCharacter, die: HeldDie): boolean {
  if (die.faces.length < 1) return false;

  const section = heldDiceSection(character) ?? createHeldDiceSection(character);
  if (!section) return false;

  const existing = section.children.find(
    (group): group is DataElement => group instanceof DataElement && group.name === die.name
  );
  if (existing) {
    const count = existing.getFirstElementByName(HELD_DICE_COUNT);
    if (count) count.value = countOf(existing) + die.count;
    const shown = existing.getFirstElementByName(HELD_DICE_SHOWN);
    if (shown) shown.value = [...shownOf(existing), ...(die.shown ?? [])].join(SHOWN_SEPARATOR);
    return true;
  }

  return section.appendChild(createGroup(die)) != null;
}

/**
 * Takes every die off the sheet and hands them over.
 *
 * A die is either standing on the table or kept on the sheet, never both. Laying them out
 * without taking them off would make a fresh set on every press, and the sheet would go on
 * claiming to keep dice that are already in play.
 */
export function takeHeldDice(character: GameCharacter): HeldDie[] {
  const dice = heldDiceOf(character);
  heldDiceSection(character)?.destroy();
  return dice;
}

/** Takes a die off the sheet, or lowers its count when there are several. */
export function removeHeldDie(character: GameCharacter, name: string, count = 1): void {
  const section = heldDiceSection(character);
  const group = section?.children.find(
    (child): child is DataElement => child instanceof DataElement && child.name === name
  );
  if (!group) return;

  const left = countOf(group) - count;
  if (left > 0) {
    const field = group.getFirstElementByName(HELD_DICE_COUNT);
    if (field) field.value = left;
    // The last put away is the first taken back, so the rest keep the faces they were left on.
    const shown = group.getFirstElementByName(HELD_DICE_SHOWN);
    if (shown) shown.value = shownOf(group).slice(0, left).join(SHOWN_SEPARATOR);
    return;
  }
  group.destroy();
}

function heldDiceSection(character: GameCharacter): DataElement | null {
  return character.detailDataElement?.getFirstElementByName(HELD_DICE_SECTION) ?? null;
}

/**
 * A section of its own each time, under an identifier nothing has carried before.
 *
 * The section comes and goes with the dice, and one under the same identifier as the last
 * is one the rest of the table has already been told to delete: it is refused there, and
 * the deletion comes back to take the new one away with it.
 */
function createHeldDiceSection(character: GameCharacter): DataElement | null {
  const detail = character.detailDataElement;
  if (!detail) return null;

  // Shown as a table, so a die reads as one row of faces rather than a field for each.
  const section = DataElement.create(HELD_DICE_SECTION, '', {
    [DataElementAttribute.ROLE]: DataElementRole.SECTION,
    [DataElementAttribute.VIEW_MODE]: DataElementViewMode.TABLE,
    [DataElementAttribute.ROW_HEADER_LABEL]: HELD_DICE_ROW_HEADER,
  });
  detail.appendChild(section);
  return section;
}

function createGroup(die: HeldDie): DataElement {
  const group = DataElement.create(die.name, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  group.appendChild(
    DataElement.create(HELD_DICE_COUNT, die.count, {
      [DataElementAttribute.ROLE]: DataElementRole.FIELD,
      [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
    })
  );
  group.appendChild(
    DataElement.create(HELD_DICE_SHOWN, (die.shown ?? []).join(SHOWN_SEPARATOR), {
      [DataElementAttribute.ROLE]: DataElementRole.FIELD,
      [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.TEXT,
    })
  );
  for (const face of die.faces) {
    group.appendChild(
      DataElement.create(face.label, face.imageIdentifier, {
        [DataElementAttribute.ROLE]: DataElementRole.FIELD,
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.IMAGE,
        type: DataElementType.IMAGE,
      })
    );
  }
  return group;
}

function heldDieFromGroup(group: DataElement): HeldDie | null {
  const faces: HeldDieFace[] = [];
  for (const field of group.children) {
    if (!(field instanceof DataElement)) continue;
    if (field.name === HELD_DICE_COUNT || field.name === HELD_DICE_SHOWN) continue;
    faces.push({ label: field.name, imageIdentifier: String(field.value ?? '') });
  }
  if (faces.length < 1) return null;

  return { name: group.name, count: countOf(group), faces, shown: shownOf(group) };
}

/** What each of them is showing. Empty where the die was written onto the sheet by hand. */
function shownOf(group: DataElement): string[] {
  const raw = String(group.getFirstElementByName(HELD_DICE_SHOWN)?.value ?? '').trim();
  if (raw.length < 1) return [];
  return raw
    .split(',')
    .map((face) => face.trim())
    .filter((face) => face.length > 0);
}

/** A count that cannot be read is one die: the group is there, so something is being kept. */
function countOf(group: DataElement): number {
  const value = Number(group.getFirstElementByName(HELD_DICE_COUNT)?.value ?? 1);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}
