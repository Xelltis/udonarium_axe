/** What a key on the table asks for, done to the pieces picked out on it. */
export type TabletopShortcutCommand =
  'target' | 'clearTargets' | 'nextTarget' | 'previousTarget' | 'toggleDisclosure' | 'toggleRuler';

/**
 * Where the focus is as a key is pressed: on nothing; on a control pressed with the pointer, which
 * keeps the focus though the reader went back to the table; or on one moved to from the keyboard.
 */
export type TabletopKeyFocus = 'none' | 'pressed' | 'keyboard';

export interface TabletopKeyContext {
  /** Where the focus is; a key on the table is read where it is on nothing (see {@link tabletopKeyDown}). */
  focus: TabletopKeyFocus;
  /** A dialog stands over the table, which takes the keys. */
  modal: boolean;
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
 *
 * Nothing is read while text is typed, under a dialog, or with Ctrl, meta or alt down. The letters
 * are read with the focus on nothing alone. Tab is read too with the focus left on a control the
 * pointer pressed, as the reader went back to the table; with the focus moved from the keyboard, it
 * moves the focus on, as it does everywhere else.
 */
export function tabletopKeyDown(key: string, context: TabletopKeyContext): TabletopShortcutCommand | null {
  if (context.typing || context.composing || context.chord || context.modal) return null;
  if (key === 'Tab') {
    if (context.focus === 'keyboard') return null;
    return context.shift ? 'previousTarget' : 'nextTarget';
  }
  if (context.focus !== 'none') return null;
  const letter = key.normalize('NFKC').toLowerCase();
  if (letter === 't') return context.shift ? 'clearTargets' : 'target';
  if (letter === 'g' && !context.shift) return 'toggleDisclosure';
  if (letter === 'm' && !context.shift) return 'toggleRuler';
  return null;
}
