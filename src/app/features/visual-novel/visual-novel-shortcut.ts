export { isTypingTarget } from '@axe/core/input/typing-target';

/**
 * The keys of the novel mode.
 *
 * It decides only what to do from the key pressed; the screen does it.
 * Nothing happens while something is being typed — text advancing under a name being entered leaves it unwritable.
 */

export type VisualNovelCommand =
  | 'advance'
  | 'back'
  | 'toStart'
  | 'toLatest'
  | 'startSkip'
  | 'stopSkip'
  | 'toggleBacklog'
  | 'toggleAutoPlay'
  | 'toggleSlotGuide'
  | 'toggleShortcutHelp'
  | 'closePopovers'
  | 'exit';

export interface VisualNovelKeyContext {
  /** Mid-composition, where the key that confirms is not a forward. */
  composing: boolean;
  /** The focus is in a field. */
  typing: boolean;
  /** Something is open, which changes where the escape goes. */
  popoverOpen: boolean;
  /** A modifier is held, and the combinations of the browser and the system are left alone. */
  chord: boolean;
}

export interface VisualNovelKeyAction {
  command: VisualNovelCommand;
  /** Whether to stop what the screen would otherwise do, such as scrolling or selecting. */
  preventDefault: boolean;
}

const ADVANCE_KEYS = new Set(['Enter', ' ', 'ArrowRight', 'ArrowDown']);
const BACK_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * The command a key press asks of novel mode, or null when it asks for nothing.
 *
 * Enter, Space, Right and Down move on; Left and Up go back; Home and End go to the first and latest
 * lines. Holding Control fast-forwards. `?`, L, A and S toggle the shortcut help, backlog, auto play
 * and slot guide. Escape closes what is open, or leaves novel mode when nothing is.
 */
export function visualNovelKeyDown(key: string, context: VisualNovelKeyContext): VisualNovelKeyAction | null {
  if (context.composing || context.typing) return null;
  // A key held with a modifier selects everything rather than playing, and such combinations are left alone.
  // The modifier alone is a fast-forward, so it passes.
  if (context.chord && key !== 'Control') return null;

  if (ADVANCE_KEYS.has(key)) return { command: 'advance', preventDefault: true };
  if (BACK_KEYS.has(key)) return { command: 'back', preventDefault: true };
  if (key === 'Home') return { command: 'toStart', preventDefault: true };
  if (key === 'End') return { command: 'toLatest', preventDefault: true };
  // Held down it fast-forwards, and since it runs until the release nothing else is stopped here.
  if (key === 'Control') return { command: 'startSkip', preventDefault: false };
  if (key === '?') return { command: 'toggleShortcutHelp', preventDefault: true };
  if (key === 'l' || key === 'L') return { command: 'toggleBacklog', preventDefault: true };
  if (key === 'a' || key === 'A') return { command: 'toggleAutoPlay', preventDefault: true };
  if (key === 's' || key === 'S') return { command: 'toggleSlotGuide', preventDefault: true };
  // Whatever is open closes first; one press does not return to the table.
  if (key === 'Escape') return { command: context.popoverOpen ? 'closePopovers' : 'exit', preventDefault: false };
  return null;
}

/** The command a key release asks of novel mode: letting go of Control stops fast-forwarding. */
export function visualNovelKeyUp(key: string): VisualNovelKeyAction | null {
  return key === 'Control' ? { command: 'stopSkip', preventDefault: false } : null;
}
