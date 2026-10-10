/**
 * What a second helping of a buff asks for.
 *
 * `stack` adds the notes' numbers and leaves whichever count of rounds is longer; `extend` adds
 * the rounds as well, so casting the same strengthening again both doubles it and carries it
 * further. `none` writes over the buff standing, which is what a command with no mark on it does.
 */
export type BuffPileOn = 'none' | 'stack' | 'extend';

/**
 * The number written in an effect note, with the words standing either side of it.
 *
 * `攻撃+2` is `攻撃`, `+2` and nothing; `2d6` is nothing, `2` and `d6`. Keeping the words apart
 * from the number is what lets two notes be checked for saying the same thing before they are
 * added up.
 */
interface BuffEffectParts {
  head: string;
  amount: number;
  /** Whether the number was written with a sign of its own, which decides how the sum is written. */
  signed: boolean;
  tail: string;
}

const NUMBER_PATTERN = /[+\-−＋－]?\d+(?:\.\d+)?/;

function readParts(text: string): BuffEffectParts | null {
  const note = text ?? '';
  const matched = NUMBER_PATTERN.exec(note);
  if (!matched) return null;

  const amount = Number(matched[0].replace(/[−－]/, '-').replace('＋', '+'));
  if (!Number.isFinite(amount)) return null;

  return {
    head: note.slice(0, matched.index),
    amount,
    signed: /^[+\-−＋－]/.test(matched[0]),
    tail: note.slice(matched.index + matched[0].length),
  };
}

/** Writes a sum back the way the note it came from was written, so `+2` and `+2` read as `+4`. */
function writeAmount(amount: number, signed: boolean): string {
  // A tenth added to two tenths is three tenths, not 0.30000000000000004; no table writes a
  // strength to more places than this.
  const rounded = Number(amount.toFixed(6));
  return signed && rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

/**
 * Adds a second helping of a buff to the note the standing one carries.
 *
 * Null where there is nothing to add up: either note without a number in it, or two notes whose
 * words differ, since `攻撃+2` and `防御+1` are two different things and folding them into one
 * number would say something neither of them says.
 */
export function stackBuffEffect(standing: string, added: string): string | null {
  const left = readParts(standing);
  const right = readParts(added);
  if (!left || !right) return null;
  if (left.head.trim() !== right.head.trim() || left.tail.trim() !== right.tail.trim()) return null;

  return `${left.head}${writeAmount(left.amount + right.amount, left.signed || right.signed)}${left.tail}`;
}
