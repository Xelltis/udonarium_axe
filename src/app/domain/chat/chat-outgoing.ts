import GameSystemClass from 'bcdice/lib/game_system';

export interface ChatOutgoing {
  text: string;
  /** The dice system the line is read under; none for a stamp, which is not read for dice. */
  gameSystem: GameSystemClass | null;
  sendFrom: string;
  sendTo: string;
  portraitIndex: number;
  messColor: string;
  messBubbleLight?: string;
  messBubbleDark?: string;
  replyTo: string;
  quoteOf: string;
  /** Whether the line is also sent round the edge of everyone's screen. */
  toTicker: boolean;
  /** The stamp the line is sent as, with `text` standing in for it; absent for a line of words. */
  stamp?: string;
}

export interface ChatOutgoingDraft {
  text: string;
  gameSystem: GameSystemClass | null;
  sendFrom: string;
  sendTo: string;
  portraitIndex: number;
  color: string;
  bubbles: { light: string; dark: string };
  replyTo: string;
  quoteOf: string;
  toTicker: boolean;
}

/**
 * The line as it goes out, from what the box was holding when it was sent.
 *
 * The dice system is looked up while the line waits, so what is sent is put together from
 * what was read before the wait rather than from the box as it stands afterwards: a reader
 * who starts the next line during that moment does not have it swept into this one.
 */
export function composeChatOutgoing(draft: ChatOutgoingDraft): ChatOutgoing {
  return {
    text: draft.text,
    gameSystem: draft.gameSystem,
    sendFrom: draft.sendFrom,
    sendTo: draft.sendTo,
    portraitIndex: draft.portraitIndex,
    messColor: draft.color,
    messBubbleLight: draft.bubbles.light,
    messBubbleDark: draft.bubbles.dark,
    replyTo: draft.replyTo,
    quoteOf: draft.quoteOf,
    toTicker: draft.toTicker,
  };
}

/**
 * A stamp as it goes out, from what the box was holding, with `words` standing in for it.
 *
 * Nothing is read out of a stamp, so no dice system is looked up for it, and it is not sent as an
 * answer to a line or round the ticker.
 */
export function composeStampOutgoing(
  draft: Omit<ChatOutgoingDraft, 'text' | 'gameSystem' | 'replyTo' | 'quoteOf' | 'toTicker'>,
  stamp: string,
  words: string
): ChatOutgoing {
  return {
    ...composeChatOutgoing({ ...draft, text: words, gameSystem: null, replyTo: '', quoteOf: '', toTicker: false }),
    stamp,
  };
}
