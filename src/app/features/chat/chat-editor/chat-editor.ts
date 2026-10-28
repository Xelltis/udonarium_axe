import type { ChatLintSession } from '@axe/application/chat/chat-lint.service';
import type { TranslateFn } from '@axe/application/i18n/translate.token';
import { type ChatSyntaxMode, scanChatSyntax } from '@axe/domain/chat-syntax/chat-syntax';
import { type ChatEditorKeys, chatEditorKeys } from '@axe/features/chat/chat-editor/chat-editor-keys';
import { toEditorDiagnostic } from '@axe/features/chat/chat-editor/chat-editor-lint';
import { chatEditorTheme } from '@axe/features/chat/chat-editor/chat-editor-theme';
import { livePreview, PREVIEW_LIMIT, refreshPreview } from '@axe/features/chat/chat-editor/chat-live-preview';
import { minimalEdit } from '@axe/features/chat/chat-editor/minimal-edit';
import {
  CHAT_INPUT_ATTR,
  type ChatFieldSelection,
  type ChatTextField,
} from '@axe/features/chat/chat-input/chat-text-field';
import { forceLinting, linter } from '@codemirror/lint';
import { Annotation, Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, placeholder, tooltips } from '@codemirror/view';

/** What the editor asks of what holds it, beside its keys. */
export interface ChatEditorHost extends ChatEditorKeys {
  /** Whether it holds one chat line or a palette of them. */
  readonly mode: ChatSyntaxMode;
  /** What the empty editor says. */
  placeholder(): string;
  /** The text as the reader changed it. A change made through the field itself is not told. */
  changed(text: string): void;
  /** What the text is checked as, for its colours, the values beside it and what will not work. */
  session(): ChatLintSession | null;
  readonly translate: TranslateFn;
}

/** The text an editor starts with, where its caret stands, and whether it takes the keys at once. */
export interface ChatEditorStart {
  text: string;
  selection: ChatFieldSelection;
  focused: boolean;
}

/** A change made through the field rather than by the reader, which the holder knows of already. */
const fromHolder = Annotation.define<boolean>();

/** How long after the last key the text is checked. */
const LINT_DELAY_MS = 300;

/**
 * The editor as a field: the chat input reads and writes it, and moves the focus to it, as it does
 * the plain box. Its content element carries the chat input's mark and takes the keys.
 */
export class ChatEditorField implements ChatTextField {
  private readonly placeholderSlot = new Compartment();
  private readonly tooltipSlot = new Compartment();
  readonly view: EditorView;

  constructor(
    readonly parent: HTMLElement,
    start: ChatEditorStart,
    private readonly host: ChatEditorHost
  ) {
    const root = rootOf(parent);
    this.view = new EditorView({
      parent,
      root,
      state: EditorState.create({
        doc: start.text,
        selection: EditorSelection.single(start.selection.from, start.selection.to),
        extensions: [
          chatEditorKeys(host),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            [CHAT_INPUT_ATTR]: '',
            spellcheck: 'false',
            enterkeyhint: host.submit ? 'send' : 'enter',
            'aria-label': host.placeholder(),
          }),
          this.placeholderSlot.of(placeholder(host.placeholder())),
          this.tooltipSlot.of(tooltips({ parent: bodyOf(root) })),
          chatEditorTheme,
          livePreview({
            scan: (text) => {
              const scan = host.session()?.scan();
              return scan && scan.text === text ? scan : scanChatSyntax(text, host.mode);
            },
            annotations: (text) => {
              const session = host.session();
              return session && session.scan().text === text ? session.annotations() : [];
            },
          }),
          linter(
            (view) => {
              const session = host.session();
              const text = view.state.doc.toString();
              if (!session || text.length > PREVIEW_LIMIT || session.scan().text !== text) return [];
              return session.diagnostics().map((found) => toEditorDiagnostic(found, host.translate));
            },
            { delay: LINT_DELAY_MS }
          ),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (update.transactions.every((tr) => tr.annotation(fromHolder))) return;
            host.changed(update.state.doc.toString());
          }),
        ],
      }),
    });
    Object.defineProperty(this.view.contentDOM, 'chatText', { value: () => this.text() });
    if (start.focused) this.focus();
  }

  get element(): HTMLElement {
    return this.view.contentDOM;
  }

  text(): string {
    return this.view.state.doc.toString();
  }

  selection(): ChatFieldSelection {
    const main = this.view.state.selection.main;
    return { from: main.from, to: main.to };
  }

  setText(text: string, select?: ChatFieldSelection): void {
    const edit = minimalEdit(this.text(), text);
    const caret = select ?? { from: text.length, to: text.length };
    this.view.dispatch({
      changes: edit ?? undefined,
      selection: EditorSelection.single(caret.from, caret.to),
      annotations: fromHolder.of(true),
      scrollIntoView: this.hasFocus(),
    });
  }

  replaceRange(from: number, to: number, insert: string, select?: ChatFieldSelection): void {
    const end = from + insert.length;
    const caret = select ?? { from: end, to: end };
    this.view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.single(caret.from, caret.to),
      annotations: fromHolder.of(true),
      scrollIntoView: true,
    });
  }

  focus(): void {
    this.view.focus();
  }

  hasFocus(): boolean {
    return this.view.hasFocus;
  }

  refit(): void {
    this.view.requestMeasure();
  }

  /** Where it stands, to start the plain box from when the reader goes back to it. */
  snapshot(): ChatEditorStart {
    return { text: this.text(), selection: this.selection(), focused: this.hasFocus() };
  }

  /** Draws the text again and checks it again, for something that changed outside it. */
  refresh(): void {
    this.view.dispatch({ effects: refreshPreview.of(null) });
    forceLinting(this.view);
  }

  /** Says what the empty editor says again, as when the language changes. */
  reconfigure(): void {
    this.view.dispatch({ effects: this.placeholderSlot.reconfigure(placeholder(this.host.placeholder())) });
  }

  /**
   * Follows the editor into another window, when the panel it stands in is moved there whole, so
   * that it reads the caret and the keys there and its hints open there.
   */
  followRoot(): void {
    const root = rootOf(this.parent);
    if (root === this.view.root) return;
    this.view.setRoot(root);
    this.view.dispatch({ effects: this.tooltipSlot.reconfigure(tooltips({ parent: bodyOf(root) })) });
  }

  /** Selects a stretch of the text and puts the caret there. */
  select(range: ChatFieldSelection): void {
    this.view.dispatch({ selection: EditorSelection.single(range.from, range.to), scrollIntoView: true });
    this.focus();
  }

  destroy(): void {
    this.view.destroy();
  }
}

function rootOf(element: HTMLElement): Document | ShadowRoot {
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root : element.ownerDocument;
}

function bodyOf(root: Document | ShadowRoot): HTMLElement {
  return (root instanceof ShadowRoot ? root.ownerDocument : root).body;
}

/** Puts the editor into the element, starting from where the plain box stood. */
export function mountChatEditor(parent: HTMLElement, start: ChatEditorStart, host: ChatEditorHost): ChatEditorField {
  return new ChatEditorField(parent, start, host);
}
