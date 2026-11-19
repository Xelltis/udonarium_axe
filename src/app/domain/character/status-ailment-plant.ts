import { emitStatusAilmentPlanted } from '@axe/core/event/domain-events';
import type { BuffAppearance } from '@axe/domain/character/buff-appearance';
import { parseBuffModifierRequest } from '@axe/domain/character/buff-modifier';
import type { GameCharacter } from '@axe/domain/character/game-character';
import { type StatusAilment, withRounds } from '@axe/domain/character/status-ailment';

/**
 * Puts a state on a character as it is described, starting it over where it is already worn.
 *
 * A state that names a status moves it as it goes on, the way the `&!` command does, and how far
 * it moved is written on the buff so that taking the state off gives back exactly that much. A
 * state naming a status the sheet has not got goes on as a plain note: better a mark the master
 * can see than nothing at all, and a state read from an older room may name no status. A caster
 * to count its rounds from goes on with it where one is given, and so does a moment for its effect
 * to move at; without one the state moves as it is counted down, whatever one worn before did.
 *
 * The buff is marked a debuff as it goes on, so it stays one whatever becomes of the room's list of
 * states, unless the one putting it on marks it otherwise.
 *
 * The device that puts it on is told that it did, so that what goes with the putting on, such as an
 * effect played over the piece, is set off once and from there.
 */
export function plantStatusAilment(
  character: GameCharacter,
  ailment: StatusAilment,
  look: Pick<BuffAppearance, 'trigger' | 'effectTiming' | 'kind'> = {}
): void {
  character.addBuffDataElement();
  character.buffs.alter(() => {
    character.buffs.addRound(ailment.name, ailment.effect, ailment.rounds, {
      color: ailment.color,
      icon: ailment.icon,
      timing: ailment.timing,
      effectTiming: '',
      kind: 'debuff',
      ...look,
    });
    moveStatusOf(character, ailment);
  });
  emitStatusAilmentPlanted({ characterIdentifier: character.identifier, name: ailment.name });
}

/** Moves the status a state names, where it names one the sheet has. */
function moveStatusOf(character: GameCharacter, ailment: StatusAilment): void {
  if ((ailment.stat ?? '').trim().length < 1) return;
  const request = parseBuffModifierRequest(ailment.stat, ailment.op, ailment.amount);
  if (!request) return;
  const data = character.buffs.find(ailment.name);
  if (data) character.buffs.applyModifier(data, request);
}

/**
 * A state as a plain buff command puts it on: the note, the rounds and the look the command writes
 * stand in for the state's own, and whatever it leaves out is the state's. Rounds that change
 * carry the moment the state ends with them, where the state has not chosen one of its own.
 */
export function statusAilmentAsCommanded(
  ailment: StatusAilment,
  written: { note: string; rounds: number | null; look: BuffAppearance }
): StatusAilment {
  const counted = written.rounds === null ? ailment : withRounds(ailment, written.rounds);
  return {
    ...counted,
    effect: written.note.length > 0 ? written.note : counted.effect,
    color: written.look.color ?? counted.color,
    icon: written.look.icon ?? counted.icon,
    timing: written.look.timing ?? counted.timing,
  };
}
