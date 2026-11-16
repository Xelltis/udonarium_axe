import type { CutInTextAlign } from '@axe/domain/media/cut-in-layer';
import { lettersOf } from '@axe/domain/media/cut-in-letter-motion';

/** The box a text layer's words are set in, in the layer's own pixels. */
export interface CutInTextBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** How a text layer sets its words. */
export interface CutInTextSetting {
  readonly fontSizePx: number;
  /** How far apart the lines are, as a multiple of the font size, held to no less than 0.4. */
  readonly lineHeight: number;
  readonly letterSpacingPx: number;
  /** Whether the words run downwards, a character at a time down columns going right to left. */
  readonly vertical: boolean;
  readonly textAlign: CutInTextAlign;
}

/** A run of text to draw at a point, with the rank of its first letter among the layer's. */
export interface CutInTextRun {
  readonly text: string;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
}

/** Where the words of a text layer are drawn: the runs, and the alignment each is drawn at its point with. */
export interface CutInTextLayout {
  readonly align: CutInTextAlign;
  readonly runs: readonly CutInTextRun[];
}

/** The lowest the lines are ever set, as a multiple of the font size. */
const LINE_HEIGHT_MIN = 0.4;

/**
 * Where the words of a text layer are drawn, the way the browser lays them out, with every point
 * at the middle of its line.
 *
 * Lines are broken where they were written. A layer that runs downwards is set a character at a
 * time down columns going right to left, which is how vertical Japanese is set, the first line the
 * rightmost column. A layer whose letters come on one at a time is set a letter at a time, each
 * centred where it would stand in its line, measured with `measure` as the font set. Any other is
 * set a line at a time, at the alignment it asks for.
 */
export function layoutCutInText(
  words: string,
  box: CutInTextBox,
  setting: CutInTextSetting,
  byLetter: boolean,
  measure: (text: string) => number
): CutInTextLayout {
  const lines = lettersOf(words);
  const step = setting.fontSizePx * Math.max(LINE_HEIGHT_MIN, setting.lineHeight);

  if (setting.vertical) {
    const blockWidth = step * lines.length;
    const rightmost = box.left + (box.width - blockWidth) / 2 + blockWidth - step / 2;
    const down = setting.fontSizePx + setting.letterSpacingPx;
    const runs = lines.flatMap((letters, column) => {
      const x = rightmost - column * step;
      const startY = box.top + (box.height - letters.length * down) / 2 + down / 2;
      return letters.map((letter, at) => ({ text: letter.text, rank: letter.rank, x, y: startY + at * down }));
    });
    return { align: 'center', runs };
  }

  const startY = box.top + (box.height - lines.length * step) / 2 + step / 2;
  if (byLetter) {
    const runs = lines.flatMap((letters, at) => {
      const y = startY + at * step;
      const lineWidth = measure(letters.map((letter) => letter.text).join(''));
      const lineLeft =
        setting.textAlign === 'left'
          ? box.left
          : setting.textAlign === 'right'
            ? box.left + box.width - lineWidth
            : box.left + (box.width - lineWidth) / 2;
      let before = '';
      return letters.map((letter) => {
        const x = lineLeft + measure(before) + measure(letter.text) / 2;
        before += letter.text;
        return { text: letter.text, rank: letter.rank, x, y };
      });
    });
    return { align: 'center', runs };
  }

  const align = setting.textAlign === 'left' ? 'left' : setting.textAlign === 'right' ? 'right' : 'center';
  const x = align === 'left' ? box.left : align === 'right' ? box.left + box.width : box.left + box.width / 2;
  const runs = lines.map((letters, at) => ({
    text: letters.map((letter) => letter.text).join(''),
    rank: letters[0]?.rank ?? 0,
    x,
    y: startY + at * step,
  }));
  return { align, runs };
}
