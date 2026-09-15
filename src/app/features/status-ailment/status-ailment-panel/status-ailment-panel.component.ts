import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { BUFF_COLORS, resolveBuffColor } from '@axe/domain/character/buff-appearance';
import { buffIconUrlOf } from '@axe/domain/character/buff-badge';
import { BUFF_TIMINGS, BuffTiming } from '@axe/domain/character/buff-timing';
import { StatusAilment, withRounds } from '@axe/domain/character/status-ailment';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** Only one list, so a second press of whatever opened it puts it away. */

/**
 * The states this room keeps on hand.
 *
 * Registering one here does not put it on anybody. It is the list the inventory offers as
 * columns to tick, and what to write down when one is ticked.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'status-ailment-panel',
  templateUrl: './status-ailment-panel.component.html',
  host: { class: 'block h-full' },
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class StatusAilmentPanelComponent {
  private readonly ailmentService = inject(StatusAilmentService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly modalService = inject(ModalService);

  readonly ailments = this.ailmentService.ailments;
  readonly timings = BUFF_TIMINGS;
  readonly colors = BUFF_COLORS;

  readonly newName = signal('');

  readonly canEdit = computed<boolean>(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  });

  /** The CSS colour of a state's swatch, transparent for a state left at the default colour. */
  swatchOf(color: string): string {
    return resolveBuffColor(color) || 'transparent';
  }

  /** Where the picture is, for a state whose mark is one that was brought in. */
  iconUrlOf(ailment: StatusAilment): string {
    this.objectChange.fileVersion();
    return buffIconUrlOf(ailment.icon);
  }

  /** Puts a picture from the room's images in place of the mark. */
  chooseIconImage(ailment: StatusAilment): void {
    if (!this.canEdit()) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((identifier) => {
      if (identifier == null) return;
      this.replace(ailment, { ...ailment, icon: identifier });
    });
  }

  /**
   * Registers the state typed in the name box, from its add button or Enter.
   *
   * Only the first word is used. The box is cleared once it is added, and left as it is when the name
   * is empty or already registered.
   */
  add(): void {
    if (!this.canEdit()) return;
    if (this.ailmentService.add(this.newName())) this.newName.set('');
  }

  /** Takes a state off the room's list. Characters already carrying it keep it. */
  remove(name: string): void {
    if (!this.canEdit()) return;
    this.ailmentService.remove(name);
  }

  /** Moves a state up or down the list by `delta`, which changes its column's place in the inventory. */
  move(name: string, delta: number): void {
    if (!this.canEdit()) return;
    this.ailmentService.move(name, delta);
  }

  /** Sets the badge colour a state is given when it is ticked. */
  setColor(ailment: StatusAilment, color: string): void {
    this.replace(ailment, { ...ailment, color });
  }

  /** Sets the mark a state is given when it is ticked, trimmed of surrounding space. */
  setIcon(ailment: StatusAilment, icon: string): void {
    this.replace(ailment, { ...ailment, icon: icon.trim() });
  }

  /**
   * Sets how many rounds a state lasts, from the rounds field.
   *
   * Unless a timing was chosen by hand, the timing follows the new count.
   */
  setRounds(ailment: StatusAilment, rounds: string): void {
    this.replace(ailment, withRounds(ailment, Number(rounds)));
  }

  /** Sets when a state counts down; a value that is not one of the buff timings is ignored. */
  setTiming(ailment: StatusAilment, timing: string): void {
    if (!(BUFF_TIMINGS as readonly string[]).includes(timing)) return;
    this.replace(ailment, { ...ailment, timing: timing as BuffTiming });
  }

  /** Sets the effect text written onto a character when the state is ticked. */
  setEffect(ailment: StatusAilment, effect: string): void {
    this.replace(ailment, { ...ailment, effect });
  }

  private replace(ailment: StatusAilment, next: StatusAilment): void {
    if (!this.canEdit()) return;
    this.ailmentService.save(this.ailments().map((entry) => (entry.name === ailment.name ? next : entry)));
  }
}
