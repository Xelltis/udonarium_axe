export type ButtonGuideCommand = 'toggle' | 'hide';

export interface ButtonGuideKeyContext {
  typing: boolean;
  composing: boolean;
  /** Ctrl, meta or alt is down, so the key belongs to the browser or another shortcut. */
  chord: boolean;
  /** Whether the guide is out, which is the only time escape has anything to put away. */
  shown: boolean;
}

export interface ButtonGuideKeyAction {
  command: ButtonGuideCommand;
  preventDefault: boolean;
}

/**
 * What a key press asks of the guide to the buttons.
 *
 * The question mark brings it out and puts it away again, as it opens the list of keys in novel
 * mode; the full-width one is read the same, for a board left in Japanese input. Shift is not a
 * chord here, since it is how the mark is typed on every board. Escape only puts it away, and is
 * left to go on to whatever else answers it.
 */
export function buttonGuideKeyDown(key: string, context: ButtonGuideKeyContext): ButtonGuideKeyAction | null {
  if (context.typing || context.composing || context.chord) return null;
  if (key === '?' || key === '？') return { command: 'toggle', preventDefault: true };
  if (key === 'Escape' && context.shown) return { command: 'hide', preventDefault: false };
  return null;
}
