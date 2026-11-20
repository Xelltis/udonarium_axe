import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  isStatusAilmentName,
  isStatusAilmentWritable,
  newStatusAilment,
  StatusAilment,
} from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { plantStatusAilment } from '@axe/domain/character/status-ailment-plant';

/** Why a state may not be added under a name: none given, not one word without a colon, or one already listed. */
export type StatusAilmentNameRefusal = 'empty' | 'notOneWord' | 'taken';

/**
 * The states a room keeps, and the putting of them on a piece.
 *
 * A state put on a piece is an ordinary buff. Nothing here invents a second kind of mark: the
 * badge over the piece, the buff manager and the counting of rounds already know what a buff
 * is, and a state that they could not see would be a state nobody notices.
 */
@Injectable({ providedIn: 'root' })
export class StatusAilmentService {
  private get catalog(): StatusAilmentCatalog {
    return StatusAilmentCatalog.instance;
  }
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  readonly ailments = computed<StatusAilment[]>(() => {
    this.objectChange.versionOf(this.catalog.identifier)();
    return this.catalog.ailments;
  });

  /** Whether putting a state on a piece plays the effect of the same name over it; off unless the room asked. */
  readonly playsEffectOnPlant = computed<boolean>(() => {
    this.objectChange.versionOf(this.catalog.identifier)();
    return this.catalog.playsEffectOnPlant;
  });

  /** Asks the room to play the effect of the same name as a state is put on, or not to; nothing for a seat that may not edit the table. */
  setPlaysEffectOnPlant(plays: boolean): void {
    if (!this.rolePermission.canEditTabletop()) return;
    this.catalog.playsEffectOnPlant = plays;
    this.objectChange.notifyChanged(this.catalog.identifier);
  }

  /** Whether this seat may change the room's list of states, which every role but a guest may. */
  mayEdit(): boolean {
    return this.rolePermission.canEditTabletop();
  }

  /** Replaces the room's list of states with this one; nothing for a seat that may not edit the table. */
  save(list: readonly StatusAilment[]): void {
    if (!this.mayEdit()) return;
    this.catalog.ailments = list;
    this.objectChange.notifyChanged(this.catalog.identifier);
  }

  /**
   * Why a state may not be added under the name typed, or null where it may: the name, trimmed, is
   * one word with no colon, as {@link isStatusAilmentName} has it, and no state is listed under it.
   */
  nameRefusal(name: string): StatusAilmentNameRefusal | null {
    const wanted = name.trim();
    if (wanted.length < 1) return 'empty';
    if (!isStatusAilmentName(wanted)) return 'notOneWord';
    if (this.ailments().some((entry) => entry.name === wanted)) return 'taken';
    return null;
  }

  /**
   * Puts a new state at the end of the list under the name typed, trimmed; null, with nothing added,
   * where {@link nameRefusal} refuses the name or the seat may not edit the table.
   */
  add(name: string): StatusAilment | null {
    if (!this.mayEdit() || this.nameRefusal(name) !== null) return null;
    const added = newStatusAilment(name.trim());
    this.save([...this.ailments(), added]);
    return added;
  }

  /**
   * Writes a listed state anew as given, under its own name. Refused, with nothing written, where a
   * field but the effect holds a space, which would not be read back as written, and for a seat that
   * may not edit the table. Whether it was written.
   */
  change(name: string, next: StatusAilment): boolean {
    const list = this.ailments();
    if (!this.mayEdit() || !isStatusAilmentWritable(next) || !list.some((entry) => entry.name === name)) return false;
    this.save(list.map((entry) => (entry.name === name ? { ...next, name } : entry)));
    return true;
  }

  /** Takes a state out of the room's list. A piece already wearing it keeps the buff. */
  remove(name: string): void {
    if (!this.mayEdit()) return;
    this.save(this.ailments().filter((entry) => entry.name !== name));
  }

  /** Moves one along the list, which is the order the columns stand in. */
  move(name: string, delta: number): void {
    if (!this.mayEdit()) return;
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

  /** Puts the state on, as the catalogue describes it; see {@link plantStatusAilment}. */
  plant(character: GameCharacter, ailment: StatusAilment): void {
    plantStatusAilment(character, ailment);
    this.objectChange.notifyChanged(character.identifier);
  }

  /** Takes a state's buff off a character. Nothing happens when it is not wearing one. */
  pull(character: GameCharacter, name: string): void {
    if (!character.buffs.delete(name)) return;
    this.objectChange.notifyChanged(character.identifier);
  }

  /** Puts a state on a character or takes it off, as `on` says; nothing for a seat that may not edit the table. */
  toggle(character: GameCharacter, ailment: StatusAilment, on: boolean): void {
    if (!this.rolePermission.canEditTabletop()) return;
    if (on) this.plant(character, ailment);
    else this.pull(character, ailment.name);
  }
}
