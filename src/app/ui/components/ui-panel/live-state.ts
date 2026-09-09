/** Somewhere the reader had scrolled to, and what they were typing in. */
interface LiveState {
  scrolls: { element: Element; top: number; left: number }[];
  focused: HTMLElement | null;
  selection: { start: number | null; end: number | null } | null;
}

function isTextField(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function read(root: HTMLElement): LiveState {
  const scrolls: LiveState['scrolls'] = [];
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element.scrollTop > 0 || element.scrollLeft > 0) {
      scrolls.push({ element, top: element.scrollTop, left: element.scrollLeft });
    }
  }
  const active = root.ownerDocument.activeElement;
  const focused = active instanceof HTMLElement && root.contains(active) ? active : null;
  const selection = isTextField(focused) ? { start: focused.selectionStart, end: focused.selectionEnd } : null;
  return { scrolls, focused, selection };
}

function write(state: LiveState): void {
  for (const { element, top, left } of state.scrolls) {
    element.scrollTop = top;
    element.scrollLeft = left;
  }
  const focused = state.focused;
  if (!focused || !focused.isConnected) return;
  focused.focus({ preventScroll: true });
  if (state.selection && isTextField(focused)) {
    focused.setSelectionRange(state.selection.start, state.selection.end);
  }
}

/**
 * Holds on to what a panel is in the middle of, across a move from one frame to another.
 *
 * Moving a view takes its nodes out of the page and puts them back, and a box out of the page
 * has no scroll and holds no cursor. What the reader had scrolled to, what they had typed and
 * where the caret sat in it are read off first and written back after.
 */
export function holdLiveState(root: HTMLElement): () => void {
  const state = read(root);
  return () => write(state);
}
