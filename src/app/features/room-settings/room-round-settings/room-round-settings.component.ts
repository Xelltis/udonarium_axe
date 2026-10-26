import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { FACTION_PHASE_MODES, TURN_ORDER_MODES } from '@axe/domain/tabletop/turn-order-mode';
import { describeSide, encodeFactionOrder, normalizeFactionOrder } from '@axe/domain/tabletop/turn-side';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The round's part of the room settings: how the round is taken, the order of the sides, whether
 * buffs count down, and the sounds of a turn beginning.
 *
 * The round is the table's to change, and the sounds are the master's.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-round-settings',
  templateUrl: './room-round-settings.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, TextTooltipDirective, TranslocoModule],
})
export class RoomRoundSettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly turnOrder = inject(TurnOrderService);
  private readonly t = inject(TRANSLATE_FN);

  readonly isReadOnly = this.access.isReadOnly;
  readonly isSharedReadOnly = this.access.isSharedReadOnly;

  /** Asks for the part where the room's notices are sent, which the round's notices are among. */
  readonly openNotices = output<void>();

  readonly turnOrderModes = TURN_ORDER_MODES;
  readonly factionPhaseModes = FACTION_PHASE_MODES;

  /** How the round is taken. */
  readonly turnOrderMode = this.access.configField('turnOrderMode');

  /** Whether the round is taken side by side, which is when the faction settings are shown. */
  get takesRoundBySides(): boolean {
    return this.turnOrderMode.value === 'faction';
  }

  /** How pieces take their turns within a side's phase. */
  readonly factionPhaseMode = this.access.configField('factionPhaseMode');

  /** Whether pieces on no party sit the round out when it is taken by sides. */
  readonly factionSkipUnassigned = this.access.configField('factionSkipUnassigned');

  /** The sides in the order the round takes them, named and coloured as the parties are. */
  get factionOrder(): { side: string; name: string; color: string }[] {
    const config = this.access.config();
    this.objectChange.collectionOf(Party.aliasName)();
    const parties = this.objectStore.getObjects<Party>(Party);
    return normalizeFactionOrder(config.factionOrder, parties, {
      skipUnassigned: config.factionSkipUnassigned,
    }).map((side) => ({ side, ...describeSide(side, parties, this.t('feature.turnOrder.unassignedSide')) }));
  }

  /** Moves one side up or down the order, which is the only time the order is written down. */
  moveSide(side: string, by: number): void {
    if (this.isReadOnly()) return;
    const order = this.factionOrder.map((entry) => entry.side);
    const from = order.indexOf(side);
    const to = from + by;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, ...order.splice(from, 1));
    Config.instance.factionOrder = encodeFactionOrder(order);
  }

  /** Whether buffs count down as the round goes; set through the round itself. */
  readonly buffDecay = this.access.field(
    () => this.turnOrder.progress().buffDecay,
    (decays) => {
      if (!this.isReadOnly()) this.turnOrder.setBuffDecay(decays);
    }
  );

  /** Whether the owner of a piece hears a signal when its turn begins. */
  readonly turnSignal = this.access.configField('turnSignalEnabled', 'shared');

  /** Whether everyone else hears a tick when a turn begins. */
  readonly turnTick = this.access.configField('turnTickEnabled', 'shared');
}
