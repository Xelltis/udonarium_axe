export { isTypingTarget } from '@axe/core/input/typing-target';

/**
 * The keys of the cut-in editor.
 *
 * It decides only what to do from the key pressed; the editor does it. Nothing happens
 * while something is being typed — a layer being renamed would lose its letters otherwise.
 */

export type CutInEditorCommand =
  | 'undo'
  | 'redo'
  | 'deleteSelection'
  | 'togglePlaying'
  | 'stepBack'
  | 'stepForward'
  | 'jumpBack'
  | 'jumpForward'
  | 'toStart'
  | 'toEnd'
  | 'copyPose'
  | 'pastePose'
  | 'nudge';

export interface CutInEditorKeyContext {
  /** The focus is in a field. */
  typing: boolean;
  /** The control or command key is held. */
  chord: boolean;
  shift: boolean;
  /** The alt key is held, which moves a layer further at a time. */
  alt?: boolean;
  /** Whether there is a layer to delete. */
  hasSelection: boolean;
}

export interface CutInEditorKeyAction {
  command: CutInEditorCommand;
  /** Whether to stop what the browser would otherwise do, such as scrolling. */
  preventDefault: boolean;
  /** For a nudge, which way and how far, in the cut-in's own pixels. */
  dx?: number;
  dy?: number;
}

/** How far one press moves a layer, and how far while the alt key is held. */
export const NUDGE_PX = 1;
export const NUDGE_FAR_PX = 10;

/**
 * The command a key press asks of the cut-in editor, or null when it asks for nothing.
 *
 * Ctrl/Cmd+Z undoes, Ctrl/Cmd+Y or Shift+Z redoes, and Ctrl/Cmd+C and V copy and paste the selected
 * layer's pose. Delete or Backspace removes the selection and Space plays or pauses. Up and down nudge
 * the selected layer; left and right step the playhead, jump between keys with Shift, or nudge the
 * layer sideways with Alt. Home and End go to either end of the scene.
 */
export function cutInEditorKeyDown(key: string, context: CutInEditorKeyContext): CutInEditorKeyAction | null {
  if (context.typing) return null;

  const letter = key.toLowerCase();
  if (context.chord && letter === 'z' && !context.shift) return { command: 'undo', preventDefault: true };
  if (context.chord && (letter === 'y' || (context.shift && letter === 'z'))) {
    return { command: 'redo', preventDefault: true };
  }
  // The moment a layer is holding, taken and laid down again.
  if (context.chord && letter === 'c' && context.hasSelection) {
    return { command: 'copyPose', preventDefault: true };
  }
  if (context.chord && letter === 'v' && context.hasSelection) {
    return { command: 'pastePose', preventDefault: true };
  }
  if (context.chord) return null;

  if ((key === 'Delete' || key === 'Backspace') && context.hasSelection) {
    return { command: 'deleteSelection', preventDefault: true };
  }
  if (key === ' ') return { command: 'togglePlaying', preventDefault: true };

  // Up and down move the layer in hand; the alt key moves it further at a time.
  const far = context.alt ? NUDGE_FAR_PX : NUDGE_PX;
  if (context.hasSelection && (key === 'ArrowUp' || key === 'ArrowDown')) {
    return { command: 'nudge', preventDefault: true, dx: 0, dy: key === 'ArrowUp' ? -far : far };
  }
  // Along the scene: a step at a time, or from one key to the next where shift is held.
  // Held with alt, the arrows move the layer sideways rather than the playhead.
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const towards = key === 'ArrowLeft' ? -1 : 1;
    if (context.alt && context.hasSelection) {
      return { command: 'nudge', preventDefault: true, dx: towards * far, dy: 0 };
    }
    if (context.shift) return { command: towards < 0 ? 'jumpBack' : 'jumpForward', preventDefault: true };
    return { command: towards < 0 ? 'stepBack' : 'stepForward', preventDefault: true };
  }
  if (key === 'Home') return { command: 'toStart', preventDefault: true };
  if (key === 'End') return { command: 'toEnd', preventDefault: true };

  return null;
}
