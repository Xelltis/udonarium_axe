/** The colour a line is written in when nobody has chosen one. */
export const DEFAULT_CHAT_COLOR = '#000000';

/**
 * Anything that can speak in the chat: a character, or the reader's own cursor.
 *
 * Each keeps three colours to speak in and, for each of those, the bubble it wants on a
 * light and on a dark page. What is asked of them is the same either way, so the lookup is
 * written once rather than in every panel that offers the three swatches.
 */
export interface ChatColorSource {
  readonly chatColorCode: readonly string[];
  readonly chatBubbleLight?: readonly string[];
  readonly chatBubbleDark?: readonly string[];
}

export interface ChatBubbleColors {
  light: string;
  dark: string;
}

/** The colour a speaker writes in with one of its swatches, or black when it has none there. */
export function chatColorOf(source: ChatColorSource | null | undefined, index: number): string {
  return source?.chatColorCode?.[index] ?? DEFAULT_CHAT_COLOR;
}

/** No bubble asked for is an empty string, which is how a line says to use the page's own. */
export function chatBubbleOf(source: ChatColorSource | null | undefined, index: number): ChatBubbleColors {
  return { light: source?.chatBubbleLight?.[index] ?? '', dark: source?.chatBubbleDark?.[index] ?? '' };
}

/** The colours a line wears: the text it is written in and the bubble it sits in. */
export interface ChatLineColors {
  messColor?: string;
  messBubbleLight?: string;
  messBubbleDark?: string;
}

/**
 * The colours a line takes from the one it answers.
 *
 * A dice result is the system speaking, but the roll was somebody's, and the answer stands
 * under their name. Wearing their colours - the bubble as well as the text - is what says
 * whose roll it was without reading a word of it.
 */
export function answerColorsOf(asked: ChatLineColors): ChatLineColors {
  return {
    messColor: asked.messColor,
    messBubbleLight: asked.messBubbleLight,
    messBubbleDark: asked.messBubbleDark,
  };
}
