import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { parseMoveKinds } from '@axe/domain/tabletop/move/move-kind';
import { DEFAULT_FALL_MIN_M } from '@axe/domain/tabletop/ride/ride-rules';
import { DEFAULT_ZONE_SIZES } from '@axe/domain/tabletop/zone/zone-rules';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The part of the room settings on engagement zones and on pieces riding mounts: whether zones are
 * played and how they grow and hold, how far apart sides start, and what steering, falling and
 * riding two up come to.
 *
 * These are the room's own answers, written only by a reader who may edit the table; an empty box
 * or a number the rule does not take hands the answer back to the default.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-zone-ride-settings',
  templateUrl: './room-zone-ride-settings.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, TranslocoModule],
})
export class RoomZoneRideSettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);

  /** Whether the room plays engagement zones. */
  readonly zoneEnabled = this.access.answerYes('zoneEnabled');

  /** Whether a piece in stealth counts as one nobody can see under the zone rules. */
  readonly zoneStealthUnseen = this.access.answerYes('zoneStealthUnseen');

  /** The size table as the room wrote it, empty where it uses the default. */
  readonly zoneSizes = this.access.answerText('zoneSizes');

  /** The default size table, shown where the room has written none of its own. */
  protected readonly zoneSizesPlaceholder = DEFAULT_ZONE_SIZES;

  /** The sheet field a piece gives its count in, empty to count each piece once. */
  readonly zoneCountField = this.access.answerText('zoneCountField');

  /** How close two pieces stand, in metres, to be at the same point. */
  readonly zoneSamePointM = this.access.answerNumber(
    'zoneSamePointM',
    () => this.access.zoneRules().samePointM,
    (metres) => metres >= 0
  );

  /** How many times the other side's number one side has to be to walk past a zone, or out of it, unheld. */
  readonly zoneOutnumber = this.access.answerNumber(
    'zoneOutnumber',
    () => this.access.zoneRules().outnumber,
    (times) => times > 0
  );

  /** The kind of move a piece may leave an overflowing zone by at once, empty for any kind. */
  readonly zoneLeaveKind = this.access.answerText('zoneLeaveKind');

  /** Whether an enemy may step into a move under way and stop it there. */
  readonly interruptEnabled = this.access.configField('interruptEnabled');

  /** The kind of move a piece steps into a move by, empty for the room's first. */
  readonly interruptKind = this.access.answerText('interruptKind');

  /** How close to a line of fire, in metres, a piece out of every zone stands to be in its way. */
  readonly zoneBlockRadiusM = this.access.answerNumber(
    'zoneBlockRadiusM',
    () => this.access.zoneRules().blockRadiusM,
    (metres) => metres >= 0
  );

  /** The sheet field or buff by which a shooter fires past what stands in the way, empty for none. */
  readonly zoneClearName = this.access.answerText('zoneClearName');

  /** The starting distances the room writes, as `name:metres` rows. */
  readonly placementDistances = this.access.answerText('placementDistances');

  /** What a distance between the sides does, as `metres:note` rows. */
  readonly distanceModifiers = this.access.answerText('distanceModifiers');

  /** The names of the kinds of move the room has written, for choosing one of them. */
  get moveKindNames(): string[] {
    return parseMoveKinds(this.access.config().moveKinds ?? '')
      .map((kind) => kind.name)
      .filter((name) => name.length > 0);
  }

  /** Whether the move range's own fights are on beside engagement zones, which judge the same thing twice. */
  get zoneMeetsEngagement(): boolean {
    const rules = this.access.rules();
    return this.zoneEnabled.value && rules.zocEngages && rules.zocMode !== 'none';
  }

  /** The sheet field holding the skill of steering a mount, empty where everybody riding in front steers. */
  readonly rideSkillField = this.access.answerText('rideSkillField');

  /** The field on a mount's sheet saying what it asks of that skill, empty where nothing is asked. */
  readonly rideRequireField = this.access.answerText('rideRequireField');

  /** The shortest fall from a mount, in metres. */
  readonly fallMinM = this.access.answerNumber(
    'fallMinM',
    () => this.access.config().fallMinM ?? DEFAULT_FALL_MIN_M,
    (metres) => metres >= 0
  );

  /** The line rolled for a piece that falls off a mount, empty where a fall only says how far. */
  readonly fallDamage = this.access.answerText('fallDamage');

  /** The buff, as a chat buff command, given the two riding a mount two up, empty where none is. */
  readonly twoUpBuff = this.access.answerText('twoUpBuff');
}
