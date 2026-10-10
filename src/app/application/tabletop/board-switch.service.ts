import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableTriggerService } from '@axe/application/tabletop/table-trigger.service';
import { ObjectNode } from '@axe/core/sync/object-node';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BoardSwitch, resetSwitch, switchOf, switchWasPressed } from '@axe/domain/tabletop/board-switch/board-switch';
import { SwitchDefinition } from '@axe/domain/tabletop/board-switch/switch-definition';
import { TableTrigger } from '@axe/domain/tabletop/table-trigger';

/**
 * Makes things on the table into switches and takes them back out, for the master.
 *
 * What a switch does is the master's to write and the master's to read: a switch that answers a
 * search would give the answer away to anyone who could open it. The switch is synced like the
 * rest of the table, since whoever presses it has to know what it does, so what is kept from the
 * players is kept by the screens they would read it on rather than by the data.
 */
@Injectable({ providedIn: 'root' })
export class BoardSwitchService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly triggers = inject(TableTriggerService);

  /** Whether this seat writes and reads switches, which only the master does. */
  readonly canEdit = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.myRole === PeerRole.GameMaster;
  });

  /** The switch on something, making one first where it has none. Only the master makes one. */
  ensure(host: ObjectNode): BoardSwitch | null {
    const held = switchOf(host);
    if (held || !this.canEdit()) return held;
    const made = new BoardSwitch();
    made.initialize();
    host.appendChild(made);
    return made;
  }

  /** Writes what a switch does, where this seat may. */
  write(target: BoardSwitch, definition: SwitchDefinition): void {
    if (!this.canEdit()) return;
    target.write(definition);
  }

  /**
   * Forgets that the switch on something was ever pressed, so it can be pressed again.
   *
   * Painted ground goes back to how it was painted: set back out where a press put it away, and
   * hidden again where a press gave it away.
   */
  reset(host: ObjectNode): void {
    if (!this.canEdit()) return;
    const held = switchOf(host);
    if (!held) return;
    resetSwitch(held);
    if (host instanceof TableTrigger && host.found) host.found = false;
  }

  /**
   * The painted ground on the table being looked at whose switch has been pressed, for the master
   * to set again. Ground has no menu of its own to do it from, the way a block does.
   */
  pressedGround(): TableTrigger[] {
    if (!this.canEdit()) return [];
    return this.triggers.all().filter((trigger) => {
      const held = trigger.pressSwitch;
      return held !== null && switchWasPressed(held);
    });
  }

  /** Takes the switch off something, leaving it the plain thing it was. */
  remove(host: ObjectNode): void {
    if (!this.canEdit()) return;
    switchOf(host)?.destroy();
  }
}
