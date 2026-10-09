import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';

/**
 * The stamps one participant has put on one line of chat.
 *
 * Each participant keeps a record of their own for each line they answer, and writes only to that,
 * so two people answering the same line at the same moment never write over each other. It points
 * at the line by the line's identifier, which a line keeps through a save, and is kept with the
 * room rather than under the line: a line with anything under it would be read back without its
 * words.
 */
@SyncObject('chat-reaction')
export class ChatReaction extends GameObject {
  @SyncVar() messageIdentifier: string = '';
  @SyncVar() userId: string = '';
  /** The name they went by when they last answered, for the room to see whose it is once they leave. */
  @SyncVar() userName: string = '';
  /** The stamps, by identifier, in the order they were put on, a space between each. */
  @SyncVar() stamps: string = '';

  /** The stamps put on, once each, in the order they were put on. Empty for none. */
  get stampIds(): string[] {
    return [...new Set(`${this.stamps ?? ''}`.split(/\s+/).filter((id) => id.length > 0))];
  }

  /** Whether the stamp is among those put on. */
  has(stampId: string): boolean {
    return this.stampIds.includes(stampId);
  }

  /** Puts the stamp on, or takes it off where it is on already. Whether it is now on. */
  toggle(stampId: string): boolean {
    const ids = this.stampIds;
    const on = !ids.includes(stampId);
    this.stamps = (on ? [...ids, stampId] : ids.filter((id) => id !== stampId)).join(' ');
    return on;
  }

  /** Makes a record of one participant's answer to a line and adds it to the room. */
  static create(messageIdentifier: string, userId: string, userName: string): ChatReaction {
    const reaction = new ChatReaction();
    reaction.messageIdentifier = messageIdentifier;
    reaction.userId = userId;
    reaction.userName = userName;
    reaction.initialize();
    return reaction;
  }
}
