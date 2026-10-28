import type { ChatLintAnnotation } from '@axe/application/chat/chat-lint.service';
import { chatFontWanted$ } from '@axe/core/event/domain-events';
import { chatColorHalo, type ChatDecoration, chatDecorationClasses } from '@axe/domain/chat/chat-decoration';
import { rubyRunsOf } from '@axe/domain/chat/chat-ruby-notation';
import type { ChatSyntaxScan, SyntaxKind, SyntaxSpan, TextRange } from '@axe/domain/chat-syntax/chat-syntax';
import { type Extension, type Range, StateEffect } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';

/** Asks the preview to be drawn again, for something it shows that changed outside the text. */
export const refreshPreview = StateEffect.define<null>();

/** Past this many letters the text is drawn plainly, as reading it over at every key would lag. */
export const PREVIEW_LIMIT = 8000;

/** What the preview of a text is drawn from. */
export interface PreviewInput {
  readonly scan: ChatSyntaxScan;
  readonly annotations: readonly ChatLintAnnotation[];
  readonly selection: readonly TextRange[];
  readonly focused: boolean;
}

/** Where the editor gets what it draws: the syntax read out of a text, and what is shown beside it. */
export interface PreviewSource {
  scan(text: string): ChatSyntaxScan;
  annotations(text: string): readonly ChatLintAnnotation[];
}

/** The syntaxes whose marks are hidden while the caret is away, the text drawn as it will look. */
const HIDDEN_WHILE_AWAY: ReadonlySet<SyntaxKind> = new Set(['decoration', 'ruby']);

const KIND_CLASSES: Partial<Record<SyntaxKind, string>> = {
  repeat: 'cm-chat-roll',
  roll: 'cm-chat-roll',
  reference: 'cm-chat-reference',
  resource: 'cm-chat-resource',
  buff: 'cm-chat-buff',
  sweep: 'cm-chat-buff',
  portrait: 'cm-chat-portrait',
  cutIn: 'cm-chat-cut-in',
  effect: 'cm-chat-effect',
  diceToken: 'cm-chat-dice-token',
  quote: 'cm-chat-quote',
  vnSuffix: 'cm-chat-staging',
  paletteVariable: 'cm-chat-variable',
  paletteTab: 'cm-chat-tab',
};

const MARKER = Decoration.mark({ class: 'cm-chat-marker' });
const HIDDEN = Decoration.replace({});

/** A word with its reading over it, drawn in place of its notation while the caret is away. */
class RubyWidget extends WidgetType {
  constructor(
    readonly base: string,
    readonly reading: string
  ) {
    super();
  }

  override eq(other: RubyWidget): boolean {
    return other.base === this.base && other.reading === this.reading;
  }

  toDOM(view: EditorView): HTMLElement {
    const document = view.dom.ownerDocument;
    const ruby = document.createElement('ruby');
    ruby.className = 'chat-ruby';
    for (const run of rubyRunsOf(this.base, this.reading)) {
      const base = document.createElement('rb');
      base.textContent = run.base;
      const reading = document.createElement('rt');
      reading.textContent = run.reading;
      ruby.append(base, reading);
    }
    return ruby;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** What a reference is filled in with, shown after it. The value is drawn by CSS, so it is no text of the line. */
class ValueChip extends WidgetType {
  constructor(readonly value: string) {
    super();
  }

  override eq(other: ValueChip): boolean {
    return other.value === this.value;
  }

  toDOM(view: EditorView): HTMLElement {
    const chip = view.dom.ownerDocument.createElement('span');
    chip.className = 'cm-chat-chip';
    chip.setAttribute('data-value', this.value);
    return chip;
  }
}

function styleOf(decoration: ChatDecoration): Record<string, string> | undefined {
  if (!decoration.color) return undefined;
  const halo = chatColorHalo(decoration.color);
  return { style: `color: ${decoration.color}${halo ? `; text-shadow: ${halo}` : ''}` };
}

/** Where the caret reveals a syntax's marks: anywhere in it, and for a paired mark, anywhere between the pair. */
function revealedBy(span: SyntaxSpan): TextRange {
  if (span.kind !== 'decoration' || !span.pairedWith) return span;
  return { from: Math.min(span.from, span.pairedWith.from), to: Math.max(span.to, span.pairedWith.to) };
}

/**
 * How a text is drawn: each syntax in its colour, the marks of decorations and rubies hidden unless
 * the caret is on them, so that the text reads as it will look, decorated runs drawn decorated,
 * and the value a reference is filled in with after it. A cut-in word is coloured only where it
 * names a cut-in. While the editor is not focused, every mark that may hide is hidden.
 */
export function previewDecorations(input: PreviewInput): Range<Decoration>[] {
  const { scan } = input;
  const ranges: Range<Decoration>[] = [];
  const replaced: TextRange[] = [];
  const replace = (from: number, to: number, decoration: Decoration): boolean => {
    if (from >= to || replaced.some((range) => range.from < to && from < range.to)) return false;
    replaced.push({ from, to });
    ranges.push(decoration.range(from, to));
    return true;
  };
  const touched = (span: SyntaxSpan) => {
    if (!input.focused) return false;
    const reveal = revealedBy(span);
    return input.selection.some((range) => range.from <= reveal.to && range.to >= reveal.from);
  };
  const annotated = (kind: ChatLintAnnotation['kind'], span: TextRange) =>
    input.annotations.find((each) => each.kind === kind && each.from === span.from && each.to === span.to);

  for (const span of scan.spans) {
    if (span.kind === 'ruby' && !touched(span)) {
      const base = span.parts.find((part) => part.role === 'name');
      const reading = span.parts.find((part) => part.role === 'reading');
      if (base && reading) {
        const widget = new RubyWidget(scan.text.slice(base.from, base.to), scan.text.slice(reading.from, reading.to));
        if (replace(span.from, span.to, Decoration.replace({ widget }))) continue;
      }
    }
    if (span.kind === 'cutIn' && !annotated('cutIn', span)) continue;
    const kindClass = KIND_CLASSES[span.kind];
    if (kindClass && span.from < span.to) {
      const roll = span.kind === 'roll' ? annotated('roll', span) : undefined;
      ranges.push(
        Decoration.mark({ class: kindClass, attributes: roll ? { title: roll.label } : undefined }).range(
          span.from,
          span.to
        )
      );
    }
    for (const part of span.parts) {
      if (part.role !== 'marker' || part.from >= part.to) continue;
      if (HIDDEN_WHILE_AWAY.has(span.kind) && !touched(span) && replace(part.from, part.to, HIDDEN)) continue;
      ranges.push(MARKER.range(part.from, part.to));
    }
  }
  for (const run of scan.decorations) {
    if (run.from >= run.to) continue;
    const mark = Decoration.mark({ class: chatDecorationClasses(run.decoration), attributes: styleOf(run.decoration) });
    ranges.push(mark.range(run.from, run.to));
  }
  for (const annotation of input.annotations) {
    if (annotation.kind !== 'value') continue;
    ranges.push(Decoration.widget({ widget: new ValueChip(annotation.label), side: 1 }).range(annotation.to));
  }
  return ranges;
}

/** Draws the preview of the text, again on every change to it, to the caret, to the focus, or on being asked. */
export function livePreview(source: PreviewSource): Extension {
  const build = (view: EditorView): DecorationSet => {
    const text = view.state.doc.toString();
    if (text.length > PREVIEW_LIMIT) return Decoration.none;
    const scan = source.scan(text);
    for (const run of scan.decorations) if (run.decoration.font) chatFontWanted$.emit(run.decoration.font);
    const decorations = previewDecorations({
      scan,
      annotations: source.annotations(text),
      selection: view.state.selection.ranges,
      focused: view.hasFocus,
    });
    return Decoration.set(decorations, true);
  };

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view);
      }

      update(update: ViewUpdate): void {
        const asked = update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refreshPreview)));
        if (!update.docChanged && !update.selectionSet && !update.focusChanged && !asked) return;
        this.decorations = update.view.composing ? this.decorations.map(update.changes) : build(update.view);
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventObservers: {
        compositionend: (_event, view) => {
          setTimeout(() => {
            if (view.dom.isConnected && !view.composing) view.dispatch({ effects: refreshPreview.of(null) });
          });
        },
      },
    }
  );
}
