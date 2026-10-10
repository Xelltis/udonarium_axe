import GameSystemClass from 'bcdice/lib/game_system';

/** A stamp going out with a line, with the words that stand in for it wherever it cannot be drawn. */
export interface OutgoingStamp {
  readonly id: string;
  readonly words: string;
}

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
  /**
   * The stamp the line is sent with, under what `text` says, or on its own where `text` is empty;
   * absent for a line of words.
   */
  stamp?: OutgoingStamp;
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
  stamp?: OutgoingStamp;
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
    ...(draft.stamp ? { stamp: draft.stamp } : {}),
  };
}

/**
 * A stamp going out on its own, from what the box was holding, with `words` standing in for it.
 *
 * Nothing is said with it, so no dice system is looked up for it, and it is not sent as an answer to
 * a line or round the ticker.
 */
export function composeStampOutgoing(
  draft: Omit<ChatOutgoingDraft, 'text' | 'gameSystem' | 'replyTo' | 'quoteOf' | 'toTicker'>,
  stamp: string,
  words: string
): ChatOutgoing {
  return {
    ...composeChatOutgoing({ ...draft, text: '', gameSystem: null, replyTo: '', quoteOf: '', toTicker: false }),
    stamp: { id: stamp, words },
  };
}
