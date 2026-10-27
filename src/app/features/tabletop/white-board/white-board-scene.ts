export * from '@axe/features/tabletop/white-board/white-board-edits';
export * from '@axe/features/tabletop/white-board/white-board-geometry';
export * from '@axe/features/tabletop/white-board/white-board-guides';
export * from '@axe/features/tabletop/white-board/white-board-marks';
export * from '@axe/features/tabletop/white-board/white-board-sheets';

import { ShapeGeneratorKind } from '@axe/domain/map-editor/editor-tool';

/**
 * What a board can be marked with.
 *
 * A board is not a map: nothing is painted cell by cell on one, and it has no grid to paint
 * on. What it has is a pen, a straight edge, a few shapes, words, and whatever is stuck to
 * it, which is why it has an editor of its own rather than the one that draws maps.
 */
export type BoardTool =
  'select' | 'hand' | 'pen' | 'marker' | 'eraser' | 'line' | 'arrow' | 'shape' | 'path' | 'text' | 'note' | 'sticker';

export const BOARD_TOOLS: readonly BoardTool[] = [
  'select',
  'hand',
  'pen',
  'marker',
  'eraser',
  'line',
  'arrow',
  'shape',
  'path',
  'text',
  'note',
  'sticker',
];

/** The shapes a board can be marked with, which are the ones a map can be marked with. */
export const BOARD_SHAPES: readonly ShapeGeneratorKind[] = [
  'rect',
  'ellipse',
  'triangle',
  'pentagon',
  'hexagon',
  'star5',
  'star6',
  'balloon',
];

/** The spacings a board can be ruled at, in the board's own pixels. */
export const GRAPH_SPACINGS: readonly number[] = [50, 25, 10];

/** What the sheet wears over the marks while it is being worked on. */
export interface Overlays {
  /** The ruling, which is the one thing the reader chooses to see or not. */
  grid: boolean;
  /** The guides, the hold and its grips, the band, and whatever is still under the pointer. */
  helpers: boolean;
}

/**
 * Whether to draw over the marks, and what.
 *
 * These are all for whoever is drawing rather than part of what is drawn, so they come off
 * together when the picture the board wears is taken. Ruling the paper is a separate question,
 * asked of the reader: turning it off must not take the guides, the hold or the line still
 * being laid down away with it.
 */
export function overlaysWanted(bare: boolean, gridVisible: boolean): Overlays {
  return { grid: !bare && gridVisible, helpers: !bare };
}

/**
 * Whether a key press belongs to whatever is being typed into rather than to the board.
 *
 * A key pressed into a box belongs to the box: backspace rubs out a letter there, not the
 * picture that happens to be held. An input method is stricter still. Writing Japanese
 * borrows the space bar to choose between candidates and escape to throw a candidate away,
 * and neither key has reached the board yet — the reader is still deciding what the letters
 * are. Nothing may be acted on until the composing is over.
 */
export function isTypingKey(target: EventTarget | null, composing: boolean): boolean {
  if (composing) return true;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

/**
 * The chequer that stands for nothing at all.
 *
 * Two greys in squares is what every drawing tool puts behind an empty picture, so a reader
 * who has seen one anywhere else already knows what it means here: there is nothing under the
 * marks. It belongs to the editor and not to the board — a board on the table that has been
 * turned down is meant to be seen through, not to be seen as squares.
 */
export const CHEQUER_CLASS = '[background-image:repeating-conic-gradient(#c4c4c4_0%_25%,#f2f2f2_0%_50%)]';
