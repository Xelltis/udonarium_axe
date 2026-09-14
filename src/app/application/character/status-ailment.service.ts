import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment, StatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';

/**
 * The states a room keeps, and the putting of them on a piece.
 *
 * A state put on a piece is an ordinary buff. Nothing here invents a second kind of mark: the
 * badge over the piece, the buff manager and the counting of rounds already know what a buff
 * is, and a state that they could not see would be a state nobody notices.
 */
@Injectable({ providedIn: 'root' })
export class StatusAilmentService {
  private readonly catalog = inject(StatusAilmentCatalog);
  private readonly objectChange = inject(ObjectChangeService);

  readonly ailments = computed<StatusAilment[]>(() => {
    this.objectChange.versionOf(this.catalog.identifier)();
    return this.catalog.ailments;
  });

  /** Replaces the room's list of states with this one. */
  save(list: readonly StatusAilment[]): void {
    this.catalog.ailments = list;
    this.objectChange.notifyChanged(this.catalog.identifier);
  }

  /** Puts a new state at the end of the list, under a name nothing else there answers to. */
  add(name: string): StatusAilment | null {
    const wanted = name.trim().split(/\s+/)[0] ?? '';
    if (wanted.length < 1) return null;

    const list = this.ailments();
    if (list.some((entry) => entry.name === wanted)) return null;

    const added = newStatusAilment(wanted);
    this.save([...list, added]);
    return added;
  }

  /** Takes a state out of the room's list. A piece already wearing it keeps the buff. */
  remove(name: string): void {
    this.save(this.ailments().filter((entry) => entry.name !== name));
  }

  /** Moves one along the list, which is the order the columns stand in. */
  move(name: string, delta: number): void {
    const list = [...this.ailments()];
    const at = list.findIndex((entry) => entry.name === name);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= list.length) return;

    const [moved] = list.splice(at, 1);
    list.splice(to, 0, moved);
    this.save(list);
  }

  /** Whether a character is wearing a buff by this name. */
  isOn(character: GameCharacter, name: string): boolean {
    return character.buffs.find(name) != null;
  }

  /** Puts the state on, as the catalogue describes it. Putting it on again starts it over. */
  plant(character: GameCharacter, ailment: StatusAilment): void {
    character.addBuffDataElement();
    character.buffs.addRound(ailment.name, ailment.effect, ailment.rounds, {
      color: ailment.color,
      icon: ailment.icon,
      timing: ailment.timing,
    });
    this.objectChange.notifyChanged(character.identifier);
  }

  /** Takes a state's buff off a character. Nothing happens when it is not wearing one. */
  pull(character: GameCharacter, name: string): void {
    if (!character.buffs.delete(name)) return;
    this.objectChange.notifyChanged(character.identifier);
  }

  /** Puts a state on a character or takes it off, as `on` says. */
  toggle(character: GameCharacter, ailment: StatusAilment, on: boolean): void {
    if (on) this.plant(character, ailment);
    else this.pull(character, ailment.name);
  }
}
