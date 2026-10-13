/** How a reader has ruby shown: over its word, after it in brackets, or not at all. */
export type RubyShow = 'over' | 'brackets' | 'hidden';

/** Where a reading stands over its word: over its middle, or from its first letter on. */
export type RubyAlign = 'center' | 'start';

/**
 * How the shorter of a word and its reading is laid out under or over the longer: spread with the
 * gaps between its letters twice those at its ends (1:2:1), or kept together in the middle.
 */
export type RubySpacing = 'even' | 'tight';

/** How large a reading is drawn beside its word: half its size, a little more, or larger still. */
export type RubySize = 'half' | 'normal' | 'large';

/** How a reader has ruby drawn, in the chat, the novel mode and the logs they save. */
export interface RubyDisplay {
  readonly show: RubyShow;
  readonly align: RubyAlign;
  readonly spacing: RubySpacing;
  readonly size: RubySize;
}

export const RUBY_SHOWS: readonly RubyShow[] = ['over', 'brackets', 'hidden'];
export const RUBY_ALIGNS: readonly RubyAlign[] = ['center', 'start'];
export const RUBY_SPACINGS: readonly RubySpacing[] = ['even', 'tight'];
export const RUBY_SIZES: readonly RubySize[] = ['half', 'normal', 'large'];

/** Ruby as it is drawn until a reader says otherwise: over the middle of its word, spread 1:2:1. */
export const DEFAULT_RUBY_DISPLAY: RubyDisplay = { show: 'over', align: 'center', spacing: 'even', size: 'normal' };

/** The size of a reading against its word, for each size a reader may choose. */
export const RUBY_SIZE_EM: Readonly<Record<RubySize, number>> = { half: 0.5, normal: 0.65, large: 0.8 };

/** Reads a stored choice, any part of it missing or not understood taken as the default. */
export function readRubyDisplay(stored: unknown): RubyDisplay {
  const value = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
  const pick = <T extends string>(choices: readonly T[], held: unknown, fallback: T): T =>
    choices.includes(held as T) ? (held as T) : fallback;
  return {
    show: pick(RUBY_SHOWS, value['show'], DEFAULT_RUBY_DISPLAY.show),
    align: pick(RUBY_ALIGNS, value['align'], DEFAULT_RUBY_DISPLAY.align),
    spacing: pick(RUBY_SPACINGS, value['spacing'], DEFAULT_RUBY_DISPLAY.spacing),
    size: pick(RUBY_SIZES, value['size'], DEFAULT_RUBY_DISPLAY.size),
  };
}

/**
 * How the ruby markup the chat writes, `<ruby class="chat-ruby">`, is laid out as a reader has it,
 * as a style sheet of its own: for a saved log, which carries the reader's choice with it.
 *
 * A reading over its first letter keeps to it whatever the spacing; the spacing lays out the rest.
 */
export function rubyDisplayCss(display: RubyDisplay): string {
  const rt = 'ruby.chat-ruby rt';
  if (display.show === 'hidden') return `${rt}{display:none}`;
  if (display.show === 'brackets') {
    return (
      'ruby.chat-ruby,ruby.chat-ruby rb{display:inline}' +
      `${rt}{display:inline;font-size:0.85em;font-weight:inherit}` +
      `${rt}::before{content:"（"}${rt}::after{content:"）"}` +
      `${rt}:empty::before,${rt}:empty::after{content:none}`
    );
  }
  const align = display.align === 'start' ? 'start' : display.spacing === 'tight' ? 'center' : 'space-around';
  return (
    `ruby.chat-ruby{ruby-align:${align};ruby-position:over}` +
    `${rt}{font-size:${RUBY_SIZE_EM[display.size]}em;font-weight:700;line-height:1.15}`
  );
}
