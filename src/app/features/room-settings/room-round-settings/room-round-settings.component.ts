import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LanguageService } from '@axe/application/i18n/language.service';
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
  private readonly language = inject(LanguageService);

  readonly isReadOnly = this.access.isReadOnly;
  readonly isSharedReadOnly = this.access.isSharedReadOnly;

  /** Asks for the part where the room's notices are sent, which the round's notices are among. */
  readonly openNotices = output<void>();

  readonly turnOrderModes = TURN_ORDER_MODES;
  readonly factionPhaseModes = FACTION_PHASE_MODES;

  /** How the round is taken. */
  readonly turnOrderMode = this.access.setting('turnOrderMode');

  /** Whether the round is taken side by side, which is when the faction settings are shown. */
  get takesRoundBySides(): boolean {
    return this.turnOrderMode.value === 'faction';
  }

  /** How pieces take their turns within a side's phase. */
  readonly factionPhaseMode = this.access.setting('factionPhaseMode');

  /** Whether pieces on no party sit the round out when it is taken by sides. */
  readonly factionSkipUnassigned = this.access.setting('factionSkipUnassigned');

  /**
   * The sides in the order the round takes them, named and coloured as the parties are. Worked out
   * again when the room's settings, the parties or any one party changes, and when the language does,
   * which names the side of the pieces on no party.
   */
  readonly factionOrder = computed<{ side: string; name: string; color: string }[]>(() => {
    const config = this.access.config();
    this.language.currentLang();
    this.objectChange.collectionOf(Party.aliasName)();
    const parties = this.objectStore.getObjects<Party>(Party);
    for (const party of parties) this.objectChange.versionOf(party.identifier)();
    const unassigned = this.t('feature.turnOrder.unassignedSide');
    return this.sidesInOrder(config, parties).map((side) => ({ side, ...describeSide(side, parties, unassigned) }));
  });

  /** The sides in the order the round takes them as the room's settings stand this instant. */
  private sidesInOrder(config: Config, parties: Party[]): string[] {
    return normalizeFactionOrder(config.factionOrder, parties, { skipUnassigned: config.factionSkipUnassigned });
  }

  /** The order of the sides as the room writes it down, which only moving a side does. */
  private readonly writtenFactionOrder = this.access.setting('factionOrder');

  /** Moves one side up or down the order, which is the only time the order is written down. */
  moveSide(side: string, by: number): void {
    if (!this.access.mayChange('factionOrder')) return;
    const order = this.sidesInOrder(Config.instance, this.objectStore.getObjects<Party>(Party));
    const from = order.indexOf(side);
    const to = from + by;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, ...order.splice(from, 1));
    this.writtenFactionOrder.value = encodeFactionOrder(order);
  }

  /** Whether buffs count down as the round goes; set through the round itself. */
  readonly buffDecay = this.access.field(
    () => this.turnOrder.progress().buffDecay,
    (decays) => {
      if (!this.isReadOnly()) this.turnOrder.setBuffDecay(decays);
    }
  );

  /** Whether the owner of a piece hears a signal when its turn begins. */
  readonly turnSignal = this.access.setting('turnSignalEnabled');

  /** Whether everyone else hears a tick when a turn begins. */
  readonly turnTick = this.access.setting('turnTickEnabled');
}
