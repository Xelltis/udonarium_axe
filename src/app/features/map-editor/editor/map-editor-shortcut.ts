export { isTypingTarget } from '@axe/core/input/typing-target';

/**
 * The keys of the map editor.
 *
 * It decides only what to do from the key pressed; the panel does it. Nothing happens
 * while something is being typed — a layer being renamed would lose its letters to the
 * tools otherwise.
 */

export type MapEditorCommand =
  'panStart' | 'panEnd' | 'undo' | 'redo' | 'deleteSelection' | 'cancelDraft' | 'commitDraft' | 'pickTool';

export interface MapEditorKeyContext {
  /** The focus is in a field. */
  typing: boolean;
  /** The control or command key is held. */
  chord: boolean;
  shift: boolean;
  alt: boolean;
  /** Whether there is anything to delete. */
  hasSelection: boolean;
  /** The letters that pick a tool, in upper case. */
  toolKeys: ReadonlySet<string>;
}

export interface MapEditorKeyAction {
  command: MapEditorCommand;
  /** The letter of the tool to pick, for a shortcut that chooses one. */
  shortcut?: string;
  /** Whether to stop what the browser would otherwise do, such as scrolling or going back. */
  preventDefault: boolean;
}

/**
 * The editor command for a key going down, or null to leave the key to the browser.
 *
 * Space starts panning, Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes, Delete and Backspace remove
 * the selection when there is one, Escape and Enter cancel or finish a draft, and a bare letter
 * picks its tool.
 */
export function mapEditorKeyDown(key: string, code: string, context: MapEditorKeyContext): MapEditorKeyAction | null {
  if (context.typing) return null;
  // Held down it drags the view, and it is read by its place on the keyboard rather than its letter.
  if (code === 'Space') return { command: 'panStart', preventDefault: true };

  const letter = key.toLowerCase();
  if (context.chord && letter === 'z' && !context.shift) return { command: 'undo', preventDefault: true };
  if (context.chord && (letter === 'y' || (context.shift && letter === 'z'))) {
    return { command: 'redo', preventDefault: true };
  }

  // With nothing selected the key belongs to the browser, which walks back through the history.
  if (key === 'Delete' || key === 'Backspace') {
    return context.hasSelection ? { command: 'deleteSelection', preventDefault: true } : null;
  }
  if (key === 'Escape') return { command: 'cancelDraft', preventDefault: false };
  if (key === 'Enter') return { command: 'commitDraft', preventDefault: false };

  const shortcut = key.toUpperCase();
  if (!context.chord && !context.alt && context.toolKeys.has(shortcut)) {
    return { command: 'pickTool', shortcut, preventDefault: true };
  }
  return null;
}

/** Ends panning when Space comes up; every other key does nothing on release. */
export function mapEditorKeyUp(code: string): MapEditorKeyAction | null {
  return code === 'Space' ? { command: 'panEnd', preventDefault: false } : null;
}
