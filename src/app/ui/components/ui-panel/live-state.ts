/** Somewhere the reader had scrolled to, and what they were typing in. */
interface LiveState {
  scrolls: { element: Element; top: number; left: number }[];
  focused: HTMLElement | null;
  selection: { start: number; end: number } | null;
}

function isTextField(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

/**
 * Only a box that overflows can be scrolled, and one is made so where it is written.
 *
 * Reading every node under a panel means reading a whole session of chat a line at a time,
 * none of which was ever scrollable.
 */
const SCROLLERS = '[class*="overflow-"],[style*="overflow"]';

function read(root: HTMLElement): LiveState {
  const scrolls: LiveState['scrolls'] = [];
  for (const element of [root, ...root.querySelectorAll(SCROLLERS)]) {
    if (element.scrollTop > 0 || element.scrollLeft > 0) {
      scrolls.push({ element, top: element.scrollTop, left: element.scrollLeft });
    }
  }
  const active = root.ownerDocument.activeElement;
  const focused = active instanceof HTMLElement && root.contains(active) ? active : null;
  return { scrolls, focused, selection: caretIn(focused) };
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
 * Where the caret sat, in a box that has one.
 *
 * A checkbox, a number and a colour are all inputs and none of them keeps a caret: asked for
 * one they answer nothing, and handed that nothing back they throw. Thrown mid-handover, the
 * panels a frame was passing on are dropped where they stand.
 */
function caretIn(focused: HTMLElement | null): LiveState['selection'] {
  if (!isTextField(focused)) return null;
  const start = focused.selectionStart;
  const end = focused.selectionEnd;
  return start === null || end === null ? null : { start, end };
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
