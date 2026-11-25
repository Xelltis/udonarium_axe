/** What a key on the table asks for, done to the pieces picked out on it. */
export type TabletopShortcutCommand =
  'target' | 'clearTargets' | 'nextTarget' | 'previousTarget' | 'toggleDisclosure' | 'toggleRuler';

export interface TabletopKeyContext {
  typing: boolean;
  composing: boolean;
  /** Ctrl, meta or alt is down, so the key belongs to the browser or another shortcut. */
  chord: boolean;
  /** Shift is down, which turns aiming at the picked pieces into taking every aim away. */
  shift: boolean;
}

/**
 * What a key press on the table asks of the picked pieces.
 *
 * T aims at them and Shift+T takes every aim away, as the same keys do in the first-person view.
 * Tab aims at the next piece of the other side, nearest first, and Shift+Tab at the one before.
 * G switches who they are disclosed to, and M takes the ruler up or puts it away. The letters are read
 * without regard to case and in their full-width forms too, for a board left in Japanese input.
 */
export function tabletopKeyDown(key: string, context: TabletopKeyContext): TabletopShortcutCommand | null {
  if (context.typing || context.composing || context.chord) return null;
  if (key === 'Tab') return context.shift ? 'previousTarget' : 'nextTarget';
  const letter = key.normalize('NFKC').toLowerCase();
  if (letter === 't') return context.shift ? 'clearTargets' : 'target';
  if (letter === 'g' && !context.shift) return 'toggleDisclosure';
  if (letter === 'm' && !context.shift) return 'toggleRuler';
  return null;
}
