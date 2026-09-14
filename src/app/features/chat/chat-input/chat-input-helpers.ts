import { Network } from '@axe/core/index';
import { GameCharacter } from '@axe/domain/character/game-character';

/**
 * Whether a character may be picked as the speaker in this seat's chat input.
 *
 * Characters in the graveyard never speak, and neither do those in the private inventory of another
 * connected peer. Anywhere else a character marked as non-talking is left out too, unless
 * `ignoreNonTalk` is set, as it is for inputs that offer only characters.
 */
export function allowsChat(gameCharacter: GameCharacter, myPeerId: string, ignoreNonTalk = false): boolean {
  switch (gameCharacter.location.name) {
    case 'table':
      return ignoreNonTalk || !gameCharacter.nonTalkFlag;
    case myPeerId:
      if (!ignoreNonTalk && gameCharacter.nonTalkFlag) return false;
      return true;
    case 'graveyard':
      return false;
    default:
      if (!ignoreNonTalk && gameCharacter.nonTalkFlag) return false;
      for (const conn of Network.peerContexts) {
        if (conn.isOpen && gameCharacter.location.name === conn.peerId) {
          return false;
        }
      }
      return true;
  }
}

/**
 * Whether the keys belong to the field the caret sits in rather than to the window around it.
 *
 * The tab shortcut is bound to the window rather than to the chat input, so it also reaches the
 * fields beside it — a tab name, a sheet value — where Ctrl+arrow is how you step over a word.
 * The chat input itself is the one place the shortcut is meant to work from.
 */
export function editsTextInPlace(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return !target.classList.contains('chat-input');
  if (!(target instanceof HTMLInputElement)) return false;
  return !NON_TEXT_INPUT_TYPES.has(target.type);
}

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);
