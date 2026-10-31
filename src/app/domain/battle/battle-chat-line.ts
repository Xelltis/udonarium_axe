import { GameCharacter } from '@axe/domain/character/game-character';
import { hasSecretEditMark, resourceCommandSites } from '@axe/domain/data/resource-command-words';
import { convertCommandToResourceEdit, createDefaultResourceEdit } from '@axe/domain/data/resource-edit-helpers';
import { hasBattleChatToken } from '@axe/domain/effect/effect-chat-token';

/** Who strikes whom on the stage for a chat line. */
export interface ChatLineBout {
  attacker: GameCharacter;
  defenders: GameCharacter[];
}

/**
 * Who strikes whom for a line carrying the battle stage's token: the piece that spoke strikes those
 * the line aims at, else those picked out on the table, never itself. Null where the line plays no
 * bout: without the token, from a speaker who is not a piece, or with nobody else to strike.
 *
 * Whatever else reads the line asks this too, so that a line the stage does not take is read as if
 * the token were not there.
 */
export function chatLineBout(
  text: string,
  speaker: unknown,
  aimed: readonly unknown[],
  picked: () => readonly GameCharacter[]
): ChatLineBout | null {
  if (!hasBattleChatToken(text) || !(speaker instanceof GameCharacter)) return null;
  const targeted = aimed.filter((object): object is GameCharacter => object instanceof GameCharacter);
  const targets = targeted.length > 0 ? targeted : picked();
  const defenders = targets.filter((target) => target.identifier !== speaker.identifier);
  return defenders.length > 0 ? { attacker: speaker, defenders } : null;
}

/**
 * Whether a chat line moves a number on the bout's pieces, so that playing it waits for the number
 * to move: a resource command, `:HP-5` or `t:HP-5` and their secret forms, in either width, that
 * names a resource the piece it is aimed at holds. A colon in passing, a smiley or a time, and a
 * command that only writes text, are not.
 */
export function lineChangesResources(text: string, bout: ChatLineBout): boolean {
  return resourceCommandsOf(text).some(({ command, aimed }) =>
    (aimed ? bout.defenders : [bout.attacker]).some((piece) => {
      const edit = createDefaultResourceEdit();
      return convertCommandToResourceEdit(edit, command, piece, aimed) && edit.operator !== '>';
    })
  );
}

/** The resource commands of a line as the chat carries them out: each with its `t` taken off, and whether it had one. */
function resourceCommandsOf(text: string): { command: string; aimed: boolean }[] {
  return resourceCommandSites(text).resources.map(({ command }) => {
    const aimed = command.startsWith('t');
    return { command: aimed ? command.slice(1) : command, aimed };
  });
}

/**
 * Whether a chat line keeps its resource commands secret, by an `s` before any of them, so that the
 * numbers it moves are kept back on the stage as they are in the chat.
 */
export function lineIsSecret(text: string): boolean {
  return hasSecretEditMark(text);
}
