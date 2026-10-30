import { type Signal, signal } from '@angular/core';
import {
  CHAT_COLORS,
  type ChatColorKey,
  type ChatDecoration,
  chatDecorationMarks,
  type ChatFontKey,
  type ChatSizeKey,
  type ChatTagKey,
  type ChatTagLanguage,
  wrapChatSelection,
} from '@axe/domain/chat/chat-decoration';
import { portraitCommandSite } from '@axe/domain/chat/chat-portrait-command';
import type { ChatRichChip } from '@axe/domain/chat/chat-rich-text';

/** The attribute on whatever a chat line is typed into, the element that takes the keys. */
export const CHAT_INPUT_ATTR = 'data-chat-input';

/** A stretch of the text by where it starts and ends; one that starts where it ends is a caret. */
export interface ChatFieldSelection {
  from: number;
  to: number;
}

/**
 * A decoration to put on what is selected, or on what is typed next: bold, italic and a line
 * through switch on and off; a size, a font and a colour are set, or taken off with null.
 */
export type ChatMarkChange =
  | { kind: 'bold' | 'italic' | 'strike' }
  | { kind: 'size'; value: ChatSizeKey | null }
  | { kind: 'font'; value: ChatFontKey | null }
  | { kind: 'color'; value: string | null };

/** Where a chip goes: at the caret, or at the end of the message, where a portrait or a cut-in is read. */
export type ChatChipPlace = 'caret' | 'end';

/** The marks written round what is selected in the box to decorate it. */
export interface ChatDecorationMarks {
  open: string;
  close: string;
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
  /**
   * Puts the text in whole, the caret at its end or the selection where given; as no step to undo
   * where `undoable` is false, as the box cleared once its line is sent.
   */
  setText(text: string, select?: ChatFieldSelection, undoable?: boolean): void;
  /**
   * Writes over a stretch of the text, the caret after what was written or the selection where
   * given; outside any decoration round it where asked to go in `plain`, as a command is.
   */
  replaceRange(from: number, to: number, insert: string, select?: ChatFieldSelection, plain?: boolean): void;
  focus(): void;
  hasFocus(): boolean;
  /** Fits the field to what it holds, unless the reader has sized it by hand. */
  refit(): void;
  /** Whether it draws decorations as they look, and so can tell what is decorated and take it off. */
  readonly rich: boolean;
  /** The decoration where the caret or the selection is; null where there is none, and always in a plain box. */
  readonly activeMarks: Signal<ChatDecoration | null>;
  /** Puts a decoration on what is selected, or on what is typed next, or takes it off. */
  applyMark(change: ChatMarkChange): void;
  /**
   * Puts in a piece of syntax shown whole: over what is selected at the caret, in the decoration
   * there, or at the end of the message, plain, as a command read off the end of a line is written,
   * a portrait or a cut-in in place of the one the message already ends with.
   */
  insertChip(chip: ChatRichChip, place?: ChatChipPlace): void;
  /** What is selected, as it is shown. */
  selectedText(): string;
  /** The chip selected as a whole, as a ruby is to have its reading changed; null where none is, and always in a plain box. */
  selectedChip(): ChatRichChip | null;
}

/** The marks a decoration is written with in a plain box, in the reader's language; null where there are none to write. */
export function marksOfChange(change: ChatMarkChange, language: ChatTagLanguage): ChatDecorationMarks | null {
  switch (change.kind) {
    case 'bold':
    case 'italic':
    case 'strike':
      return chatDecorationMarks(change.kind, language);
    case 'size':
      return change.value ? chatDecorationMarks(change.value, language) : null;
    case 'font':
      return change.value ? chatDecorationMarks(`font:${change.value}`, language) : null;
    case 'color': {
      const color = change.value;
      if (!color) return null;
      const named = (Object.keys(CHAT_COLORS) as ChatColorKey[]).find((key) => CHAT_COLORS[key] === color);
      return named
        ? chatDecorationMarks(`color:${named}` as ChatTagKey, language)
        : { open: `[${color}]`, close: `[/${color}]` };
    }
  }
}

/** Writes text at the end of a message, after a space where it would run on from a word. */
export function appendedText(text: string, insert: string): string {
  return text + (text.length > 0 && !/\s$/.test(text) ? ' ' : '') + insert;
}

/** A plain `<textarea>` as a field. It grows with what it holds until the reader sizes it by hand. */
export class TextareaChatField implements ChatTextField {
  private sizedByHand = false;
  readonly rich = false;
  readonly activeMarks = signal<ChatDecoration | null>(null).asReadonly();

  constructor(
    readonly element: HTMLTextAreaElement,
    private readonly language: () => ChatTagLanguage = () => 'ja'
  ) {}

  applyMark(change: ChatMarkChange): void {
    const marks = marksOfChange(change, this.language());
    if (marks) wrapFieldSelection(this, marks);
  }

  insertChip(chip: ChatRichChip, place: ChatChipPlace = 'caret'): void {
    if (place === 'end') {
      const text = this.text();
      const ending = chip.kind === 'portrait' || chip.kind === 'cutIn' ? portraitCommandSite(text) : null;
      if (ending) {
        const end = ending.from + chip.raw.length;
        this.setText(text.slice(0, ending.from) + chip.raw + text.slice(ending.to), { from: end, to: end });
      } else {
        this.setText(appendedText(text, chip.raw));
      }
      return;
    }
    const { from, to } = this.selection();
    this.replaceRange(from, to, chip.raw);
  }

  selectedText(): string {
    const { from, to } = this.selection();
    return this.text().slice(from, to);
  }

  selectedChip(): ChatRichChip | null {
    return null;
  }

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
