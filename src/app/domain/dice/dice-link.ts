import { DiceRollFace } from '@axe/domain/dice/dice-roll-detail';

/**
 * Putting what a rolled command showed onto the dice standing on the table.
 *
 * A die takes a roll only when the two agree on the number of faces and the die has that
 * face to show. Anything left over changes nothing: a die that cannot show the number is
 * better left as it was than set to a face it does not have.
 */

export interface LinkableDie {
  readonly faces: readonly string[];
}

export interface DiceLink<T extends LinkableDie> {
  die: T;
  face: string;
}

/**
 * Pairs each die with the first unused roll it can show, and the face to turn it to.
 *
 * The dice are taken in order and each roll goes to one die at most; a die that no roll fits is
 * left out.
 */
export function linkRollsToDice<T extends LinkableDie>(
  dice: readonly T[],
  rolls: readonly DiceRollFace[]
): DiceLink<T>[] {
  const unused = [...rolls];
  const linked: DiceLink<T>[] = [];

  for (const die of dice) {
    const index = unused.findIndex((roll) => canShow(die, roll));
    if (index < 0) continue;

    const [roll] = unused.splice(index, 1);
    linked.push({ die, face: String(roll.value) });
  }
  return linked;
}

/**
 * A percentile roll is kept as its tens and its units, so a ten-sided die on the table
 * takes whichever of the two it can show, and the other is left for the next die.
 */
function canShow(die: LinkableDie, roll: DiceRollFace): boolean {
  return die.faces.length === roll.sides && die.faces.includes(String(roll.value));
}
