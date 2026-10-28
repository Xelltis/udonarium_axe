import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';

/** The names offered as a line is written, each by what it is written with. */
export interface ChatCompletionWords {
  readonly statuses: readonly string[];
  readonly variables: readonly string[];
  readonly portraits: readonly string[];
  readonly effects: readonly string[];
  /** The buffs the speaker has, to take off or stack onto. */
  readonly buffs: readonly string[];
  readonly diceExamples: readonly string[];
}

/** Every completion stays offered while the word goes on without a space. */
const WORD = /^[^\s]*$/;

function options(names: readonly string[], type: string, close = ''): Completion[] {
  return [...new Set(names)]
    .filter((name) => name.length > 0)
    .map((name) => ({ label: name, type, apply: name + close }));
}

/** Where a word the pattern ends the text before the caret with starts, past the space it may begin with. */
function wordStart(context: CompletionContext, pattern: RegExp): number | null {
  const match = context.matchBefore(pattern);
  if (!match) return null;
  return match.from + (/^\s/.test(match.text) ? 1 : 0);
}

/**
 * Offers names where the syntax being written takes one, and nowhere else: a reference's after
 * `{`, a status after a `:` that starts a word, a buff after a `&` that does, a portrait after
 * `@`, an effect after `《`, and a command of the game system for the first word of a line.
 * Elsewhere it offers nothing, so it never stands between the reader and the keys of the box.
 */
export function chatCompletionSource(words: () => ChatCompletionWords): CompletionSource {
  return (context): CompletionResult | null => {
    const known = words();

    const reference = context.matchBefore(/[tTｔＴ]?[{｛][^{}｛｝\s]*$/);
    if (reference) {
      const from = reference.from + reference.text.search(/[{｛]/) + 1;
      return { from, options: options([...known.statuses, ...known.variables], 'variable', '}'), validFor: WORD };
    }

    const effect = context.matchBefore(/《[^《》\s]*$/);
    if (effect) return { from: effect.from + 1, options: options(known.effects, 'keyword', '》'), validFor: WORD };

    const status = wordStart(context, /(?:^|\s)[sSｓＳ]?[tTｔＴ]?[:：][^\s:：&＆+\-=>＋－＝＞]*$/);
    if (status != null) {
      const from = context.state.doc.sliceString(status, context.pos).search(/[:：]/) + status + 1;
      return { from, options: options(known.statuses, 'property'), validFor: /^[^\s:：&＆+\-=>＋－＝＞]*$/ };
    }

    const buff = wordStart(context, /(?:^|\s)[sSｓＳ]?[tTｔＴ]?[&＆][+＋!！]*[^\s/&＆]*$/);
    if (buff != null) {
      const marks = /^[sSｓＳ]?[tTｔＴ]?[&＆][+＋!！]*/.exec(context.state.doc.sliceString(buff, context.pos))![0];
      return { from: buff + marks.length, options: options(known.buffs, 'class'), validFor: /^[^\s/&＆]*$/ };
    }

    const portrait = wordStart(context, /(?:^|\s)[@＠][^\s]*$/);
    if (portrait != null) {
      return { from: portrait + 1, options: options([...known.portraits, 'hide'], 'constant'), validFor: WORD };
    }

    const line = context.state.doc.lineAt(context.pos);
    const first = context.matchBefore(/^[A-Za-z][^\s]*$/);
    if (first && first.from === line.from) {
      const typed = first.text.toLowerCase();
      const commands = known.diceExamples.filter((command) => command.toLowerCase().startsWith(typed));
      if (commands.length > 0) return { from: first.from, options: options(commands, 'function', ' '), validFor: WORD };
    }
    return null;
  };
}
