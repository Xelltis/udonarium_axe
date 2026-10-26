import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { asBreakOutMode, BREAK_OUT_MODES } from '@axe/domain/tabletop/move/engagement';
import { asZocMode, HOSTILITY_BY, ZOC_MODES } from '@axe/domain/tabletop/move/zone-of-control';
import { isGroupAnswered, RoomRuleGroup } from '@axe/domain/tabletop/room-rules';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { wholeCells } from '@axe/features/room-settings/whole-cells';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The part of the room settings on the ground enemies hold: whether and how they hold it, how far it
 * reaches, and how a fight that forms in it is left.
 *
 * Each rule reads as the rules in force have it, and setting it hands it to the room; only a reader
 * who may edit the table can. Counts that are not whole numbers above zero are stored as 0, and an
 * unknown mode is corrected on the way in.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-zoc-settings',
  templateUrl: './room-zoc-settings.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, TranslocoModule],
})
export class RoomZocSettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);

  /** Whether the room has taken the group over from the table. */
  answersFor(group: RoomRuleGroup): boolean {
    return isGroupAnswered(this.access.config().roomRuleAnswers, group);
  }

  readonly zocModes = ZOC_MODES;
  readonly hostilityWays = HOSTILITY_BY;
  readonly breakOutModes = BREAK_OUT_MODES;

  /** Whether and how enemy pieces hold the ground around them. */
  readonly zocMode = this.access.ruleField('zocMode', asZocMode);

  /** A table where an enemy holds no ground is asked nothing about how much of it. */
  get showsZocOptions(): boolean {
    return this.zocMode.value !== 'none';
  }

  /** What it costs on top is a question only for a room that charges for the ground. */
  get showsZocExtraCost(): boolean {
    return this.zocMode.value === 'cost';
  }

  /** How the table tells its two sides apart, which decides who holds ground against whom. */
  readonly hostilityBy = this.access.ruleField('hostilityBy');

  /** How many cells the ground an enemy piece holds reaches. */
  readonly zocRange = this.access.ruleField('zocRange', wholeCells);

  /** Whether the ground held against the picked piece stays shown. */
  readonly zocAlways = this.access.ruleField('zocAlways');

  /** What a step into held ground costs on top, in cells. */
  readonly zocExtraCost = this.access.ruleField('zocExtraCost', wholeCells);

  /** Whether pieces meeting in held ground are held as one fight that charges for the step leaving it. */
  readonly zocEngages = this.access.ruleField('zocEngages');

  /** How a piece leaves a fight. */
  readonly breakOutMode = this.access.ruleField('breakOutMode', asBreakOutMode);

  /** What leaving a fight costs, in cells. */
  readonly breakOutCost = this.access.ruleField('breakOutCost', wholeCells);

  /** Whether a piece is weighed in a fight by the ground it covers rather than one apiece. */
  readonly engagementCountsSize = this.access.ruleField('engagementCountsSize');
}
