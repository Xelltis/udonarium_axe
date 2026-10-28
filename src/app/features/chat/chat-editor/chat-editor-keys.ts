import { history, historyKeymap, insertNewline, standardKeymap } from '@codemirror/commands';
import { type Extension, Prec } from '@codemirror/state';
import { EditorView, type KeyBinding, keymap } from '@codemirror/view';

/** What the keys of a chat input ask of what holds it. Each is left out where the input has no such key. */
export interface ChatEditorKeys {
  /** Enter: sends the line. Without it Enter breaks the line, as in a palette being written. */
  submit?(): void;
  /** Ctrl+Up and Ctrl+Down: an earlier or later line from the input's history. */
  historyStep?(direction: -1 | 1): void;
  /** Up and Down: steps through the palette's suggestions, answering whether the arrow was taken for that. */
  suggestionStep?(direction: -1 | 1): boolean;
}

/** How long after a word is made with an input method an Enter is still taken for the one that made it. */
const COMPOSITION_ENTER_MS = 50;

/**
 * The keys of the chat input: Enter sends and Shift+Enter breaks the line, Ctrl+Up and Ctrl+Down
 * go through the history, Up and Down step through suggestions, and Ctrl+Left and Ctrl+Right are
 * left to the window, which switches tabs with them. Undo and the usual movement keys work as in
 * any box; Tab and Ctrl+F are left to the page.
 *
 * An Enter that makes a word with an input method never sends: neither one while the word is being
 * made, nor the one some browsers send just after.
 */
export function chatEditorKeys(keys: ChatEditorKeys): Extension[] {
  let composedAt = -Infinity;
  const guard = Prec.highest(
    EditorView.domEventHandlers({
      compositionend: () => {
        composedAt = Date.now();
        return false;
      },
      keydown: (event, view) => {
        if (event.key !== 'Enter') return false;
        if (event.isComposing || event.keyCode === 229 || view.composing) return true;
        if (Date.now() - composedAt < COMPOSITION_ENTER_MS) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    })
  );

  const bindings: KeyBinding[] = [
    { key: 'Ctrl-ArrowLeft', run: () => true },
    { key: 'Ctrl-ArrowRight', run: () => true },
  ];
  if (keys.submit) {
    const submit = keys.submit;
    bindings.push(
      {
        key: 'Enter',
        run: (view) => {
          if (!view.composing) submit();
          return true;
        },
      },
      { key: 'Shift-Enter', run: insertNewline }
    );
  }
  if (keys.historyStep) {
    const step = keys.historyStep;
    bindings.push(
      {
        key: 'Ctrl-ArrowUp',
        run: () => {
          step(-1);
          return true;
        },
      },
      {
        key: 'Ctrl-ArrowDown',
        run: () => {
          step(1);
          return true;
        },
      }
    );
  }
  if (keys.suggestionStep) {
    const step = keys.suggestionStep;
    bindings.push({ key: 'ArrowUp', run: () => step(-1) }, { key: 'ArrowDown', run: () => step(1) });
  }

  return [guard, history(), Prec.high(keymap.of(bindings)), keymap.of([...historyKeymap, ...standardKeymap])];
}
