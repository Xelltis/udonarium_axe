import { ChatMessage } from '@axe/domain/chat/chat-message';

/** A line as drawn, for what may be done with it. */
export interface ChatLine {
  /** The line, or null while none is given. */
  readonly message: Pick<ChatMessage, 'isSystemMessage' | 'isSystemToPL' | 'isShownInChat' | 'sentStamp'> | null;
  /** Whether the line is drawn only to be read, as a window following a tab draws it. */
  readonly readOnly: boolean;
}

/**
 * What the reader may do with a line as the room and the reader stand, each asked only when it is
 * needed: a line is asked on every pass it is drawn, and some answers follow the reader's own seat,
 * which changes with every line they say.
 */
export interface ChatLinePermissions {
  /** Whether the reader may edit the line where it stands. */
  edit(): boolean;
  /** Whether the reader may make the line an after-the-fact whisper. */
  makeAfterWhisper(): boolean;
  /** Whether the reader may put an after-the-fact whisper back for everyone. */
  undoAfterWhisper(): boolean;
  /** Whether the reader may delete the line. */
  pseudoDelete(): boolean;
  /** Whether the reader may put stamps on lines, and the room lets them. */
  react(): boolean;
  /** Whether the reader may put things on the table. */
  editTable(): boolean;
}

/** What the reader may do with a line, each worked out when it is read. */
export interface ChatLineAbilities {
  /** Answering, quoting or making a note of it. */
  readonly interact: boolean;
  /** Answering it with stamps at all. */
  readonly answerWithStamps: boolean;
  /** Putting a stamp on it. */
  readonly react: boolean;
  /** Editing it with the pencil. */
  readonly change: boolean;
  /** Making it an after-the-fact whisper. */
  readonly makeAfterWhisper: boolean;
  /** Putting it back for everyone after an after-the-fact whisper. */
  readonly undoAfterWhisper: boolean;
  /** Deleting it. */
  readonly pseudoDelete: boolean;
  /** Laying it on the table as a note. */
  readonly shareAsMemo: boolean;
}

/**
 * What the reader may do with a line.
 *
 * A line drawn only to be read offers nothing. Nothing can answer a line the app posted or a notice
 * addressed to a player, though a dice bot's answer to a roll can be answered, since it answers a
 * player. Stamps go only on a line the reader is shown; a line sent as a stamp has no words to edit;
 * and a note is laid on the table, so it is only for those who may put things there.
 */
export function chatLineAbilities(line: ChatLine, may: ChatLinePermissions): ChatLineAbilities {
  const message = line.message;
  const open = !line.readOnly && !!message;
  const interact = open && !message.isSystemMessage && !message.isSystemToPL;
  return {
    interact,
    get answerWithStamps() {
      return interact && message!.isShownInChat;
    },
    get react() {
      return this.answerWithStamps && may.react();
    },
    get change() {
      return open && may.edit() && !message!.sentStamp;
    },
    get makeAfterWhisper() {
      return open && may.makeAfterWhisper();
    },
    get undoAfterWhisper() {
      return open && may.undoAfterWhisper();
    },
    get pseudoDelete() {
      return open && may.pseudoDelete();
    },
    get shareAsMemo() {
      return interact && may.editTable();
    },
  };
}
