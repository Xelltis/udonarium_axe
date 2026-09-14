/**
 * What a throw of the dice on the table reads as.
 *
 * A die on the table is a die like any other, so a throw of one belongs in the chat as
 * much as a rolled command does. The wording is left to the caller; this only gathers
 * the parts of the line.
 */

export interface RolledDie {
  /** What the die is called on the table. */
  name: string;
  /** The face it came to rest on. */
  face: string;
  /** How many faces it has, which names it when it has no name of its own. */
  sides: number;
}

export interface DiceRollLog {
  count: number;
  /** The dice thrown, each named. */
  dice: string;
  /** What each of them showed, in the order they were thrown. */
  results: string;
  /** The faces added up, or null where one of them is not a number. */
  total: number | null;
}

/**
 * Gathers the parts of the chat line for a throw of dice on the table: how many, their names, their
 * faces and the total. Null when nothing was thrown.
 */
export function diceRollLog(rolled: readonly RolledDie[]): DiceRollLog | null {
  if (rolled.length < 1) return null;

  return {
    count: rolled.length,
    dice: rolled.map((die) => nameOf(die)).join(', '),
    results: rolled.map((die) => die.face).join(', '),
    total: totalOf(rolled),
  };
}

/** A die with no name of its own is known by the number of faces it has. */
function nameOf(die: RolledDie): string {
  const name = die.name.trim();
  return name.length > 0 ? name : `D${die.sides}`;
}

/**
 * The faces added up.
 *
 * Null as soon as one of them is not a number: a die with words on its faces has no total,
 * and adding what can be added would read as the whole throw.
 */
function totalOf(rolled: readonly RolledDie[]): number | null {
  let total = 0;
  for (const die of rolled) {
    const value = Number(die.face);
    if (!Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}
