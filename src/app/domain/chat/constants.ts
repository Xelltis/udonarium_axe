/** The colours a chat starts with. */
export const DEFAULT_CHAT_COLOR_CODES: readonly string[] = ['#000000', '#FF0000', '#0099FF'];

/**
 * The bubbles a chat starts with: none of its own.
 *
 * An empty entry means the bubble is worked out from the colour, which is what anyone who
 * has never opened the colour panel wants. A reader who sets one is taken at their word.
 */
export const DEFAULT_CHAT_BUBBLE_CODES: readonly string[] = ['', '', ''];

/**
 * The identifier of the system tab.
 *
 * Left alone, the arrivals, departures and silences flow into the conversation tabs.
 * It is known by its identifier rather than its name, so a rename and a resaved room still name the same tab.
 */
export const SYSTEM_CHAT_TAB_IDENTIFIER = 'SystemTab';

export const SYSTEM_CHAT_TAB_NAME = 'システム';

/** The room tab whose ordinary public messages are drawn around the screen perimeter. */
export const TICKER_CHAT_TAB_IDENTIFIER = 'TickerTab';
export const TICKER_CHAT_TAB_NAME = 'ティッカー';

/**
 * The tag on a line that belongs to the room's record but not to the story being read.
 *
 * Novel mode reads a tab as a script, one line at a time. Housekeeping a game master does to
 * the stage still belongs in the chat log, so the table can see what happened, but making
 * everyone press through "the portraits were cleared" as though it were a line of the scene
 * defeats the point of clearing them.
 */
export const OUT_OF_STORY_TAG = 'out-of-story';
