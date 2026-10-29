import { signal } from '@angular/core';
import type { ChatLintAnnotation, ChatLintSession } from '@axe/application/chat/chat-lint.service';
import type { TranslateFn } from '@axe/application/i18n/translate.token';
import { chatFontWanted$ } from '@axe/core/event/domain-events';
import { coalesce, debounce } from '@axe/core/util/debounce';
import { type ChatDecoration, chatDecorationLayout, type ChatTagLanguage } from '@axe/domain/chat/chat-decoration';
import { referenceSites } from '@axe/domain/chat/chat-reference';
import { type ChatRichChip, type ChatRichMode, parseChatRichText } from '@axe/domain/chat/chat-rich-text';
import type { ChatSyntaxScan, SyntaxKind } from '@axe/domain/chat-syntax/chat-syntax';
import { isBattleChatTokenName } from '@axe/domain/effect/effect-chat-token';
import { buildChatBubble, type ChatBubble } from '@axe/features/chat/chat-editor/chat-editor-bubble';
import type { ChatCompletionWords } from '@axe/features/chat/chat-editor/chat-editor-complete';
import { ensureChatEditorStyle } from '@axe/features/chat/chat-editor/chat-editor-style';
import { chatSuggestExtension } from '@axe/features/chat/chat-editor/chat-editor-suggest';
import {
  type ChatDocText,
  chipOfNode,
  decorationOfMarks,
  docOfLines,
  marksOfDecoration,
  nodeOfChip,
  textOfDoc,
} from '@axe/features/chat/chat-editor/chat-rich-convert';
import {
  CHAT_MARK,
  CHAT_RICH_EXTENSIONS,
  ChatStamp,
  CHIP_LETTER,
} from '@axe/features/chat/chat-editor/chat-rich-schema';
import {
  CHAT_INPUT_ATTR,
  type ChatChipPlace,
  type ChatFieldSelection,
  type ChatMarkChange,
  type ChatTextField,
} from '@axe/features/chat/chat-input/chat-text-field';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { Editor, Extension, InputRule } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/extension-bubble-menu';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { type Mark, type Node as ProseMirrorNode, Slice } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** What the editor asks of what holds it. */
export interface ChatEditorHost {
  /** Whether it holds one chat message or a palette of them. */
  readonly mode: ChatRichMode;
  /** What the empty editor says. */
  placeholder(): string;
  /** The language decorations are written in. */
  language(): ChatTagLanguage;
  /** The cut-ins that start from chat, whose name ending a message is shown as a chip. */
  cutInNames(): ReadonlySet<string>;
  /** Enter: sends the line. Without it Enter breaks the line, as in a palette being written. */
  submit?(): void;
  /** Escape: puts the line down without keeping it, as editing a line already sent does. */
  cancel?(): void;
  /**
   * The attribute the editable element is found by: the chat input's own where this is not told, so
   * that an editor for a line already sent is not taken for the input.
   */
  readonly marker?: string;
  /** Ctrl+Up and Ctrl+Down: an earlier or later line from the input's history. */
  historyStep?(direction: -1 | 1): void;
  /** Up and Down: steps through the palette's suggestions, answering whether the arrow was taken for that. */
  suggestionStep?(direction: -1 | 1): boolean;
  /** The text as the reader changed it. A change made through the field itself is not told. */
  changed(text: string): void;
  /** What the text is checked as, for its colours, the values beside it and what will not work. */
  session(): ChatLintSession | null;
  /** The names offered as a line is written. */
  completionWords(): ChatCompletionWords;
  /** The picture a portrait command shows, for its chip; null where there is none. */
  portraitImage(raw: string): string | null;
  /** Opens where a reading is put over the words selected, as the bar over a selection asks. */
  openRuby?(): void;
  /** What the bar over a selection must not cover: the toolbar over the box. */
  toolbarElement?(): HTMLElement | null;
  readonly translate: TranslateFn;
  /** A stamp put inside the line, drawn as markup as tall as the letters, as the chat draws it; null where it is not known. */
  stampHtml?(stampId: string): string | null;
  /**
   * Told each time what will not work has been marked, once the reader pauses or as the room
   * changes, for whatever lists it to follow the marks rather than every key.
   */
  linted?(): void;
  /**
   * Whether a portrait or a cut-in that ends a line is carried out from here, so that one put
   * anywhere else is marked as doing nothing; a line already said, rewritten, carries none out.
   */
  readonly readsLineEnd?: boolean;
}

/** The text an editor starts with, where its caret stands, and whether it takes the keys at once. */
export interface ChatEditorStart {
  text: string;
  selection: ChatFieldSelection;
  focused: boolean;
}

/** Marks a change made through the field rather than by the reader, which the holder knows of already. */
const FROM_HOLDER = 'chatFromHolder';

/** How long after the last key the text is checked for what will not work. */
const LINT_DELAY_MS = 300;

/** How long after a word is made with an input method an Enter is still taken for the one that made it. */
const COMPOSITION_ENTER_MS = 50;

/** Past this many letters the text is not coloured or checked, as reading it over at every key would lag. */
const HIGHLIGHT_LIMIT = 8000;

const SYNTAX = new PluginKey<DecorationSet>('chatSyntax');

const KIND_CLASSES: Partial<Record<SyntaxKind, string>> = {
  repeat: 'chat-rich-roll',
  roll: 'chat-rich-roll',
  reference: 'chat-rich-reference',
  resource: 'chat-rich-resource',
  buff: 'chat-rich-buff',
  sweep: 'chat-rich-buff',
  portrait: 'chat-rich-portrait',
  cutIn: 'chat-rich-cut-in',
  effect: 'chat-rich-effect',
  diceToken: 'chat-rich-dice-token',
  quote: 'chat-rich-quiet',
  vnSuffix: 'chat-rich-quiet',
  paletteVariable: 'chat-rich-quiet',
  paletteTab: 'chat-rich-tab',
};

/** The decoration a pair of marks typed round some text stands for. */
function decorationOfPair(open: string, close: string): ChatDecoration | null {
  return chatDecorationLayout(`${open}x${close}`).runs[0]?.decoration ?? null;
}

/**
 * The editor as a field: a document of decorated text and chips, drawn as it will look, which the
 * chat input reads and writes as the syntax string it sends. Its content element carries the chat
 * input's mark and takes the keys.
 */
export class ChatEditorField implements ChatTextField {
  readonly rich = true;
  private readonly marksNow = signal<ChatDecoration | null>(null);
  readonly activeMarks = this.marksNow.asReadonly();
  readonly editor: Editor;
  private written: { doc: ProseMirrorNode; language: ChatTagLanguage; out: ChatDocText } | null = null;
  private composedAt = -Infinity;
  /** Marks what will not work once the reader has stood still a moment. */
  private readonly lintLater = debounce(() => this.paintSyntax(true), LINT_DELAY_MS);
  /** Marks it a moment after the room changes, and at that pace for as long as it keeps changing. */
  private readonly lintForRoom = coalesce(() => this.paintSyntax(true), LINT_DELAY_MS);
  private refreshAfterComposition = false;
  private pendingText: { text: string; select?: ChatFieldSelection } | null = null;
  /** Whether the paste coming is the one Ctrl+Shift+V asks for, to go in as the letters copied. */
  private pastePlain = false;
  private readonly tip: HTMLElement;
  private readonly bubble: ChatBubble;

  constructor(
    readonly parent: HTMLElement,
    start: ChatEditorStart,
    private readonly host: ChatEditorHost
  ) {
    const document = parent.ownerDocument;
    ensureChatEditorStyle(document);
    if (document !== globalThis.document) ensureChatEditorStyle(globalThis.document);
    this.tip = document.createElement('div');
    this.tip.className = 'chat-rich-tip';
    this.tip.hidden = true;
    this.tip.setAttribute('role', 'tooltip');
    document.body.append(this.tip);
    this.bubble = buildChatBubble(document, {
      apply: (change) => this.applyMark(change),
      active: () => this.activeMarks(),
      openRuby: host.openRuby ? () => host.openRuby?.() : undefined,
      translate: host.translate,
    });

    this.editor = new Editor({
      element: parent,
      extensions: [
        ...CHAT_RICH_EXTENSIONS.map((extension) => (extension === ChatStamp ? this.stampChip() : extension)),
        UndoRedo,
        Placeholder.configure({ placeholder: () => host.placeholder() }),
        this.compositionGuard(),
        this.keys(),
        this.rules(),
        this.syntax(),
        chatSuggestExtension({ completionWords: () => host.completionWords() }),
        BubbleMenu.configure({
          element: this.bubble.element,
          appendTo: () => this.parent.ownerDocument.body,
          shouldShow: ({ state, from, to }) => from !== to && !(state.selection instanceof NodeSelection),
          options: {
            strategy: 'fixed',
            placement: 'top',
            offset: ({ rects }) => this.bubbleGap(rects.reference.y, rects.floating.height),
            flip: { fallbackPlacements: ['bottom'] },
            shift: { padding: 8 },
          },
        }),
      ],
      enableCoreExtensions: { clipboardTextSerializer: false },
      editorProps: {
        attributes: {
          class: 'chat-rich',
          [host.marker ?? CHAT_INPUT_ATTR]: '',
          spellcheck: 'false',
          enterkeyhint: host.submit ? 'send' : 'enter',
          'aria-label': host.placeholder(),
          'aria-multiline': 'true',
        },
        clipboardTextSerializer: (slice) => this.textOfSlice(slice),
        handleKeyDown: (_view, event) => {
          this.pastePlain = event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v';
          return false;
        },
        handlePaste: (view, event) => this.paste(view, event),
      },
    });
    this.setText(start.text, start.selection, false);
    this.editor.on('transaction', ({ transaction }) => this.afterTransaction(transaction));
    this.editor.view.dom.addEventListener('mouseover', this.showTip);
    this.editor.view.dom.addEventListener('mouseout', this.hideTip);
    this.editor.view.dom.addEventListener('keydown', this.hideTip);
    Object.defineProperty(this.editor.view.dom, 'chatText', { value: () => this.text() });
    this.updateActiveMarks();
    if (start.focused) this.focus();
  }

  get element(): HTMLElement {
    return this.editor.view.dom;
  }

  private get schema() {
    return this.editor.schema;
  }

  /** The document as the syntax string, worked out once for each state of it. */
  private writtenNow(): ChatDocText {
    const doc = this.editor.state.doc;
    const language = this.host.language();
    if (this.written?.doc !== doc || this.written.language !== language) {
      this.written = { doc, language, out: textOfDoc(doc, language, this.host.mode) };
    }
    return this.written.out;
  }

  text(): string {
    return this.writtenNow().text;
  }

  selection(): ChatFieldSelection {
    const { from, to } = this.editor.state.selection;
    const out = this.writtenNow();
    return { from: out.toOffset(from, from === to ? -1 : 1), to: out.toOffset(to, -1) };
  }

  /**
   * Puts the text in, read into decorated text and chips, changing only what differs from what the
   * editor holds, so its history and the caret's place survive. Text that arrives while a word is
   * being made with an input method waits until the word is made.
   */
  setText(text: string, select?: ChatFieldSelection, undoable = true): void {
    const view = this.editor.view;
    if (view.composing) {
      this.pendingText = { text, select };
      return;
    }
    const state = this.editor.state;
    const lines = parseChatRichText(text, { mode: this.host.mode, cutInNames: this.host.cutInNames() }).lines;
    const next = docOfLines(this.schema, lines);
    const tr = state.tr;
    const start = state.doc.content.findDiffStart(next.content);
    if (start !== null) {
      const end = state.doc.content.findDiffEnd(next.content)!;
      let endA = end.a;
      let endB = end.b;
      const overlap = start - Math.min(endA, endB);
      if (overlap > 0) {
        endA += overlap;
        endB += overlap;
      }
      tr.replace(start, endA, next.slice(start, endB));
    }
    const out = textOfDoc(tr.doc, this.host.language(), this.host.mode);
    const caret = select ?? { from: text.length, to: text.length };
    const from = out.toPos(caret.from, caret.from === caret.to ? -1 : 1);
    const to = out.toPos(caret.to, -1);
    tr.setSelection(TextSelection.create(tr.doc, Math.min(from, to), Math.max(from, to)));
    tr.setMeta(FROM_HOLDER, true);
    if (!undoable) tr.setMeta('addToHistory', false);
    if (view.hasFocus()) tr.scrollIntoView();
    view.dispatch(tr);
  }

  replaceRange(from: number, to: number, insert: string, select?: ChatFieldSelection): void {
    const text = this.text();
    const end = from + insert.length;
    this.setText(text.slice(0, from) + insert + text.slice(to), select ?? { from: end, to: end });
  }

  focus(): void {
    this.editor.view.focus();
  }

  hasFocus(): boolean {
    return this.editor.view.hasFocus();
  }

  refit(): void {
    this.editor.view.updateState(this.editor.state);
  }

  applyMark(change: ChatMarkChange): void {
    const chain = this.editor.chain().focus();
    switch (change.kind) {
      case 'bold':
      case 'italic':
      case 'strike':
        chain.toggleMark(CHAT_MARK[change.kind]).run();
        return;
      default:
        if (change.value === null) chain.unsetMark(CHAT_MARK[change.kind]).run();
        else chain.setMark(CHAT_MARK[change.kind], { value: change.value }).run();
        if (change.kind === 'font' && change.value) chatFontWanted$.emit(change.value);
    }
  }

  insertChip(chip: ChatRichChip, place: ChatChipPlace = 'caret'): void {
    const state = this.editor.state;
    const marks: readonly Mark[] = state.storedMarks ?? state.selection.$from.marks();
    const node = nodeOfChip(this.schema, chip, marks);
    const tr = state.tr;
    if (place === 'end') {
      const end = state.doc.content.size - 1;
      const before = state.doc.textBetween(Math.max(0, end - 1), end, '\n', CHIP_LETTER);
      const space = end > 1 && before.length > 0 && !/\s/.test(before) ? [this.schema.text(' ')] : [];
      tr.insert(end, [...space, node]);
      tr.setSelection(TextSelection.create(tr.doc, end + space.length + 1));
    } else {
      tr.replaceSelectionWith(node, false);
    }
    this.editor.view.dispatch(tr.scrollIntoView());
    this.focus();
  }

  selectedText(): string {
    const { from, to } = this.editor.state.selection;
    return this.editor.state.doc.textBetween(from, to, '\n', (leaf) => chipOfNode(leaf)?.raw ?? '');
  }

  selectedChip(): ChatRichChip | null {
    const selection = this.editor.state.selection;
    return selection instanceof NodeSelection ? chipOfNode(selection.node) : null;
  }

  /** Where it stands, to start the plain box from when the reader goes back to it. */
  snapshot(): ChatEditorStart {
    return { text: this.text(), selection: this.selection(), focused: this.hasFocus() };
  }

  /**
   * Colours the syntax again and checks it again, at once, or for a change to the text, which is
   * coloured at once and checked after the reader pauses.
   */
  refresh(textChanged: boolean): void {
    this.lintLater.cancel();
    this.lintForRoom.cancel();
    if (textChanged) this.lintLater();
    this.paintSyntax(!textChanged);
  }

  /**
   * Colours and checks it again a moment after a change to the room alone, which may come at every
   * step of a piece dragged: once for all that come in that moment, and so on while they keep coming.
   */
  refreshSoon(): void {
    this.lintForRoom();
  }

  /** Says what the empty editor says again, as when the language changes. */
  reconfigure(): void {
    this.editor.view.dispatch(this.editor.state.tr.setMeta('addToHistory', false));
  }

  /** Follows the editor into another window, when the panel it stands in is moved there whole. */
  followRoot(): void {
    const view = this.editor.view;
    if (view.root === this.parent.getRootNode() || view.dom.ownerDocument === view.root) return;
    view.updateRoot();
    ensureChatEditorStyle(view.dom.ownerDocument);
    view.dom.ownerDocument.body.append(this.tip);
  }

  /** Selects a stretch of the text and puts the caret there. */
  select(range: ChatFieldSelection): void {
    const out = this.writtenNow();
    const tr = this.editor.state.tr.setSelection(
      TextSelection.create(this.editor.state.doc, out.toPos(range.from, 1), out.toPos(range.to, -1))
    );
    this.editor.view.dispatch(tr.scrollIntoView());
    this.focus();
  }

  destroy(): void {
    this.lintLater.cancel();
    this.lintForRoom.cancel();
    this.tip.remove();
    this.editor.destroy();
    this.bubble.element.remove();
  }

  /**
   * How far over the selection its bar stands: just over it, or over the toolbar where it would
   * otherwise cover the toolbar's buttons.
   */
  private bubbleGap(selectionTop: number, height: number): number {
    const gap = 8;
    const toolbar = this.host.toolbarElement?.()?.getBoundingClientRect();
    if (!toolbar || toolbar.height < 1) return gap;
    const bottom = selectionTop - gap;
    const covers = bottom > toolbar.top && bottom - height < toolbar.bottom;
    return covers ? selectionTop - toolbar.top + 4 : gap;
  }

  private afterTransaction(transaction: Transaction): void {
    this.updateActiveMarks();
    this.bubble.refresh();
    if (!transaction.docChanged) return;
    for (const font of this.fontsIn(this.editor.state.doc)) chatFontWanted$.emit(font);
    if (!transaction.getMeta(FROM_HOLDER)) this.host.changed(this.text());
  }

  private fontsIn(doc: ProseMirrorNode): Set<string> {
    const fonts = new Set<string>();
    doc.descendants((node) => {
      for (const mark of node.marks) if (mark.type.name === CHAT_MARK.font) fonts.add(String(mark.attrs['value']));
    });
    return fonts;
  }

  /**
   * What is decorated where the caret is, or over the whole of the selection: a decoration counts
   * only where every letter selected has it.
   */
  private updateActiveMarks(): void {
    const state = this.editor.state;
    const { from, to, empty, $from } = state.selection;
    if (empty) {
      this.marksNow.set(decorationOfMarks(state.storedMarks ?? $from.marks()));
      return;
    }
    let common: readonly Mark[] | null = null;
    state.doc.nodesBetween(from, to, (node) => {
      if (!node.isInline) return true;
      common = common === null ? node.marks : common.filter((mark) => mark.isInSet(node.marks));
      return false;
    });
    this.marksNow.set(decorationOfMarks(common ?? []));
  }

  /** The stamp chip, drawn as the host draws the stamp, or as its name where the host cannot. */
  private stampChip() {
    const host = this.host;
    const page = this.parent.ownerDocument;
    return ChatStamp.extend({
      addNodeView() {
        return ({ node }) => {
          const dom = page.createElement('span');
          dom.className = 'chat-chip-stamp';
          dom.setAttribute('data-chip', 'stamp');
          dom.setAttribute('data-stamp-id', String(node.attrs['id']));
          dom.contentEditable = 'false';
          const html = host.stampHtml?.(String(node.attrs['id']));
          if (html) dom.innerHTML = html;
          else dom.textContent = `［${String(node.attrs['label'])}］`;
          return { dom };
        };
      },
    });
  }

  /**
   * The Enter that makes a word with an input method, kept from sending, from breaking the line or
   * from taking a name offered: one while the word is being made, and one right after it is made,
   * which some browsers send once the word is done. It stands before every other key, the list of
   * names offered among them, as an extension's own keys come before its plugins.
   */
  private compositionGuard(): Extension {
    const composedJustNow = () => Date.now() - this.composedAt < COMPOSITION_ENTER_MS;
    const composed = () => {
      this.composedAt = Date.now();
      setTimeout(() => this.afterComposition());
    };
    return Extension.create({
      name: 'chatCompositionGuard',
      priority: 1200,
      addProseMirrorPlugins() {
        return [
          new Plugin({
            props: {
              handleKeyDown: (_view, event) => {
                if (event.key !== 'Enter') return false;
                if (event.isComposing || event.keyCode === 229) return true;
                if (composedJustNow()) {
                  event.preventDefault();
                  return true;
                }
                return false;
              },
              handleDOMEvents: {
                compositionend: () => {
                  composed();
                  return false;
                },
              },
            },
          }),
        ];
      },
    });
  }

  /** The keys of the chat input: Enter sends, Shift+Enter breaks the line, and the host's own. */
  private keys(): Extension {
    const host = this.host;
    const unchip = () => this.unchipBeforeCaret();
    return Extension.create({
      name: 'chatKeys',
      priority: 1000,
      addKeyboardShortcuts() {
        const shortcuts: Record<string, () => boolean> = {
          Backspace: unchip,
        };
        if (host.submit) {
          const submit = host.submit.bind(host);
          shortcuts['Enter'] = () => {
            if (!this.editor.view.composing) submit();
            return true;
          };
          shortcuts['Shift-Enter'] = () => this.editor.commands.splitBlock({ keepMarks: true });
        }
        if (host.cancel) {
          const cancel = host.cancel.bind(host);
          shortcuts['Escape'] = () => (cancel(), true);
        }
        if (host.historyStep) {
          const step = host.historyStep.bind(host);
          shortcuts['Ctrl-ArrowUp'] = () => (step(-1), true);
          shortcuts['Ctrl-ArrowDown'] = () => (step(1), true);
        }
        if (host.suggestionStep) {
          const step = host.suggestionStep.bind(host);
          shortcuts['ArrowUp'] = () => step(-1);
          shortcuts['ArrowDown'] = () => step(1);
        }
        return shortcuts;
      },
    });
  }

  /** Turns a chip right before the caret back into the text it stands for, less its last letter. */
  private unchipBeforeCaret(): boolean {
    const state = this.editor.state;
    const { empty, $from } = state.selection;
    const before = $from.nodeBefore;
    const chip = empty && before ? chipOfNode(before) : null;
    if (!chip || !before) return false;
    const pos = $from.pos;
    const rest = chip.raw.slice(0, -1);
    const tr = state.tr.replaceWith(pos - 1, pos, rest ? this.schema.text(rest, before.marks) : []);
    this.editor.view.dispatch(tr);
    return true;
  }

  private afterComposition(): void {
    const pending = this.pendingText;
    this.pendingText = null;
    if (pending) this.setText(pending.text, pending.select);
    if (this.refreshAfterComposition) {
      this.refreshAfterComposition = false;
      this.refresh(true);
    }
  }

  /**
   * The shortcuts typed as syntax: a pair of decoration marks closed round some text becomes that
   * decoration, and a reference, a ruby or an effect token closed becomes its chip. Backspace right
   * after takes either back.
   */
  private rules(): Extension {
    const rules = () => [this.markRule(), this.referenceRule(), this.rubyOrEffectRule()];
    return Extension.create({
      name: 'chatRules',
      addInputRules() {
        return rules();
      },
    });
  }

  private markRule(): InputRule {
    return new InputRule({
      find: (text) => {
        const layout = chatDecorationLayout(text);
        for (const mark of layout.marks) {
          if (mark.to !== text.length || !mark.paired || mark.partner < 0) continue;
          if (mark.kind !== 'stars' && mark.kind !== 'close') continue;
          const open = layout.marks[mark.partner];
          if (open.from >= mark.from) continue;
          const decoration = decorationOfPair(text.slice(open.from, open.to), text.slice(mark.from, mark.to));
          if (!decoration) continue;
          return {
            index: open.from,
            text: text.slice(open.from),
            data: { open: open.to - open.from, close: mark.to - mark.from, decoration },
          };
        }
        return null;
      },
      handler: ({ state, range, match }) => {
        const data = match.data as { open: number; close: number; decoration: ChatDecoration };
        const innerFrom = range.from + data.open;
        const innerTo = range.to - data.close;
        if (innerTo <= innerFrom) return null;
        const tr = state.tr;
        const marks = marksOfDecoration(this.schema, data.decoration);
        for (const mark of marks) tr.addMark(innerFrom, innerTo, mark);
        tr.delete(innerTo, range.to);
        tr.delete(range.from, innerFrom);
        for (const mark of marks) tr.removeStoredMark(mark.type);
        return undefined;
      },
    });
  }

  private referenceRule(): InputRule {
    return new InputRule({
      find: /[tTｔＴ]?[{｛][^{}｛｝\ufffc\n]+[}｝]$/,
      handler: ({ state, range, match }) => {
        const raw = match[0];
        const site = referenceSites(raw)[0];
        if (!site || site.from !== 0 || site.to !== raw.length) return null;
        this.replaceWithChip(
          state.tr,
          range,
          { kind: 'reference', raw, name: site.name, targeted: site.targeted, useMax: site.useMax },
          state.doc.resolve(range.from + 1).marks()
        );
        return undefined;
      },
    });
  }

  private rubyOrEffectRule(): InputRule {
    return new InputRule({
      find: (text) => {
        const ruby = /[|｜]([^|｜\s\ufffc]+?)《([^《》\ufffc]+?)》$/.exec(text);
        if (ruby) return { index: ruby.index, text: ruby[0], data: { ruby: true, base: ruby[1], reading: ruby[2] } };
        const effect = /《([^《》\ufffc\n]+)》$/.exec(text);
        if (effect && effect[1].trim().length > 0) {
          return { index: effect.index, text: effect[0], data: { ruby: false, name: effect[1].trim() } };
        }
        return null;
      },
      handler: ({ state, range, match }) => {
        const data = match.data as { ruby: boolean; base?: string; reading?: string; name?: string };
        const raw = match[0];
        const marks = state.doc.resolve(range.from + 1).marks();
        const chip: ChatRichChip = data.ruby
          ? { kind: 'ruby', raw, base: data.base ?? '', reading: data.reading ?? '' }
          : { kind: 'effect', raw, name: data.name ?? '', battle: isBattleChatTokenName(data.name ?? '') };
        this.replaceWithChip(state.tr, range, chip, marks);
        return undefined;
      },
    });
  }

  private replaceWithChip(
    tr: Transaction,
    range: { from: number; to: number },
    chip: ChatRichChip,
    marks: readonly Mark[]
  ) {
    tr.replaceWith(range.from, range.to, nodeOfChip(this.schema, chip, marks));
  }

  /** The syntax string a piece of the document is copied as. */
  private textOfSlice(slice: Slice): string {
    const first = slice.content.firstChild;
    const paragraphs =
      first?.type.name === 'paragraph' ? slice.content : this.schema.nodes['paragraph'].create(null, slice.content);
    const doc = this.schema.nodes['doc'].create(null, paragraphs);
    return textOfDoc(doc, this.host.language(), this.host.mode).text;
  }

  /**
   * Pastes text as the syntax it is written in, its decorations and chips shown as they look. A paste
   * with Ctrl+Shift+V is left to the editor, which puts the letters in as they are.
   */
  private paste(view: EditorView, event: ClipboardEvent): boolean {
    if (this.pastePlain) {
      this.pastePlain = false;
      return false;
    }
    const text = event.clipboardData?.getData('text/plain');
    if (text === undefined || text.length < 1) return false;
    const lines = parseChatRichText(text.replace(/\r\n?/g, '\n'), {
      mode: this.host.mode,
      cutInNames: this.host.cutInNames(),
    }).lines.map((line) => ({ segments: line.segments }));
    const doc = docOfLines(this.schema, lines);
    view.dispatch(view.state.tr.replaceSelection(new Slice(doc.content, 1, 1)).scrollIntoView());
    return true;
  }

  /** The plugin that holds the colours of the syntax and the marks of what will not work. */
  private syntax(): Extension {
    return Extension.create({
      name: 'chatSyntax',
      addProseMirrorPlugins() {
        return [
          new Plugin<DecorationSet>({
            key: SYNTAX,
            state: {
              init: () => DecorationSet.empty,
              apply: (tr, set) => tr.getMeta(SYNTAX) ?? set.map(tr.mapping, tr.doc),
            },
            props: {
              decorations: (state) => SYNTAX.getState(state),
            },
          }),
        ];
      },
    });
  }

  /** Colours the syntax of the text as the chat reads it, and marks what will not work where asked. */
  private paintSyntax(withLint: boolean): void {
    const view = this.editor.view;
    if (view.isDestroyed) return;
    if (view.composing) {
      this.refreshAfterComposition = true;
      return;
    }
    const session = this.host.session();
    const out = this.writtenNow();
    if (!session || out.text.length > HIGHLIGHT_LIMIT) {
      view.dispatch(view.state.tr.setMeta(SYNTAX, DecorationSet.empty).setMeta('addToHistory', false));
      return;
    }
    const scan = session.scan();
    if (scan.text !== out.text) return;
    const doc = view.state.doc;
    const decorations: Decoration[] = [];
    const annotations = withLint ? [...session.annotations(), ...session.rolls()] : session.annotations();
    const chipAt = (from: number, to: number): number | null => {
      const pos = out.toPos(from, 1);
      const node = doc.nodeAt(pos);
      return node && chipOfNode(node) && out.toOffset(pos + 1, -1) === to ? pos : null;
    };
    const chipsSeen = new Set<number>();
    this.paintSpans(scan, annotations, out, chipAt, chipsSeen, decorations);
    doc.descendants((node, pos) => {
      const chip = chipOfNode(node);
      if (!chip || (chip.kind !== 'portrait' && chip.kind !== 'cutIn')) return;
      const attrs: Record<string, string> = {};
      if (this.host.readsLineEnd !== false && !chipsSeen.has(pos)) {
        attrs['class'] = 'chat-chip-idle';
        attrs['data-tip'] = this.host.translate('feature.chat.lint.chipNotAtEnd');
        attrs['data-severity'] = 'info';
      }
      const image = chip.kind === 'portrait' ? this.host.portraitImage(chip.raw) : null;
      if (image) attrs['style'] = `--chip-image: url("${image.replace(/["\\\\]/g, '')}")`;
      if (Object.keys(attrs).length > 0) decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    });
    if (withLint) {
      for (const found of session.diagnostics()) {
        const tip = this.host.translate(
          `feature.chat.lint.${found.code}`,
          found.params ? { ...found.params } : undefined
        );
        const attrs = { class: `chat-lint-${found.severity}`, 'data-tip': tip, 'data-severity': found.severity };
        const chip = chipAt(found.from, found.to);
        if (chip !== null) {
          decorations.push(Decoration.node(chip, chip + 1, attrs));
          continue;
        }
        const from = out.toPos(found.from, 1);
        const to = out.toPos(found.to, -1);
        if (from < to) decorations.push(Decoration.inline(from, to, attrs));
      }
    }
    view.dispatch(view.state.tr.setMeta(SYNTAX, DecorationSet.create(doc, decorations)).setMeta('addToHistory', false));
    if (withLint) this.host.linted?.();
  }

  private paintSpans(
    scan: ChatSyntaxScan,
    annotations: readonly ChatLintAnnotation[],
    out: ChatDocText,
    chipAt: (from: number, to: number) => number | null,
    chipsSeen: Set<number>,
    decorations: Decoration[]
  ): void {
    const annotated = (kind: ChatLintAnnotation['kind'], from: number, to: number) =>
      annotations.find((each) => each.kind === kind && each.from === from && each.to === to);
    for (const span of scan.spans) {
      if (span.kind === 'decoration' || span.kind === 'ruby') continue;
      const chip = chipAt(span.from, span.to);
      if (chip !== null) {
        chipsSeen.add(chip);
        const value = span.kind === 'reference' ? annotated('value', span.from, span.to) : undefined;
        if (value) decorations.push(Decoration.node(chip, chip + 1, { 'data-value': value.label }));
        continue;
      }
      if (span.kind === 'cutIn' && !annotated('cutIn', span.from, span.to)) continue;
      const className = KIND_CLASSES[span.kind];
      if (!className) continue;
      const from = out.toPos(span.from, 1);
      const to = out.toPos(span.to, -1);
      if (from >= to) continue;
      const roll = span.kind === 'roll' ? annotated('roll', span.from, span.to) : undefined;
      decorations.push(
        Decoration.inline(from, to, roll ? { class: className, 'data-tip': roll.label } : { class: className })
      );
    }
  }

  private readonly showTip = (event: MouseEvent): void => {
    const target = (event.target as Element | null)?.closest?.('[data-tip]');
    const text = target?.getAttribute('data-tip');
    if (!target || !text) {
      this.tip.hidden = true;
      return;
    }
    const severity = target.getAttribute('data-severity');
    const words = this.tip.ownerDocument.createElement('span');
    words.textContent = text;
    if (severity) {
      const icon = this.tip.ownerDocument.createElement('i');
      icon.className = 'material-icons';
      icon.textContent = severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info';
      this.tip.replaceChildren(icon, words);
      this.tip.setAttribute('data-severity', severity);
    } else {
      this.tip.replaceChildren(words);
      this.tip.removeAttribute('data-severity');
    }
    this.tip.hidden = false;
    void computePosition(target, this.tip, {
      strategy: 'fixed',
      placement: 'top-start',
      middleware: [offset(6), flip({ fallbackPlacements: ['bottom'] }), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      this.tip.style.left = `${x}px`;
      this.tip.style.top = `${y}px`;
    });
  };

  private readonly hideTip = (): void => {
    this.tip.hidden = true;
  };
}

/** Puts the editor into the element, starting from where the plain box stood. */
export function mountChatEditor(parent: HTMLElement, start: ChatEditorStart, host: ChatEditorHost): ChatEditorField {
  return new ChatEditorField(parent, start, host);
}
