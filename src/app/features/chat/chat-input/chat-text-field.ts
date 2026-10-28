import { wrapChatSelection } from '@axe/domain/chat/chat-decoration';
import type { ChatDecorationMarks } from '@axe/features/chat/chat-input/chat-decoration-context-menu';

/** The attribute on whatever a chat line is typed into, the element that takes the keys. */
export const CHAT_INPUT_ATTR = 'data-chat-input';

/** A stretch of the text by where it starts and ends; one that starts where it ends is a caret. */
export interface ChatFieldSelection {
  from: number;
  to: number;
}

/**
 * What a chat line is typed into, a plain box or the editor that draws the line as it will look,
 * through one way of reading and writing it whichever it is.
 */
export interface ChatTextField {
  /** The element that takes the keys and the focus. */
  readonly element: HTMLElement;
  text(): string;
  selection(): ChatFieldSelection;
  /** Puts the text in whole, the caret at its end or the selection where given. */
  setText(text: string, select?: ChatFieldSelection): void;
  /** Writes over a stretch of the text, the caret after what was written or the selection where given. */
  replaceRange(from: number, to: number, insert: string, select?: ChatFieldSelection): void;
  focus(): void;
  hasFocus(): boolean;
  /** Fits the field to what it holds, unless the reader has sized it by hand. */
  refit(): void;
}

/** A plain `<textarea>` as a field. It grows with what it holds until the reader sizes it by hand. */
export class TextareaChatField implements ChatTextField {
  private sizedByHand = false;

  constructor(readonly element: HTMLTextAreaElement) {}

  text(): string {
    return this.element.value;
  }

  selection(): ChatFieldSelection {
    return { from: this.element.selectionStart, to: this.element.selectionEnd };
  }

  setText(text: string, select?: ChatFieldSelection): void {
    this.element.value = text;
    const caret = select ?? { from: text.length, to: text.length };
    this.element.setSelectionRange(caret.from, caret.to);
  }

  replaceRange(from: number, to: number, insert: string, select?: ChatFieldSelection): void {
    const text = this.element.value;
    const end = from + insert.length;
    this.setText(text.slice(0, from) + insert + text.slice(to), select ?? { from: end, to: end });
  }

  focus(): void {
    this.element.focus();
  }

  hasFocus(): boolean {
    return this.element.ownerDocument.activeElement === this.element;
  }

  refit(): void {
    if (this.sizedByHand) return;
    this.element.style.height = '';
    if (this.element.scrollHeight >= this.element.offsetHeight) {
      this.element.style.height = this.element.scrollHeight + 'px';
    }
  }

  /** Notes a press on the box's resize corner, its bottom-right 16 pixels, after which its height is the reader's. */
  notePointerDown(event: PointerEvent): void {
    const rect = this.element.getBoundingClientRect();
    if (event.offsetX > rect.width - 16 && event.offsetY > rect.height - 16) this.sizedByHand = true;
  }
}

/**
 * Wraps what is selected in the marks, or puts them at the caret with nothing selected, and leaves
 * the same words selected, or the caret between the marks. Answers the text it leaves.
 */
export function wrapFieldSelection(field: ChatTextField, marks: ChatDecorationMarks): string {
  const { from, to } = field.selection();
  const wrapped = wrapChatSelection(field.text(), from, to, marks);
  field.setText(wrapped.text, { from: wrapped.selectionStart, to: wrapped.selectionEnd });
  return wrapped.text;
}

/**
 * Writes text over what is selected, or at the caret, with the caret `caret` letters into it, or
 * after it. Answers the text it leaves.
 */
export function insertAtCaret(field: ChatTextField, insert: string, caret = insert.length): string {
  const { from, to } = field.selection();
  field.replaceRange(from, to, insert, { from: from + caret, to: from + caret });
  return field.text();
}
