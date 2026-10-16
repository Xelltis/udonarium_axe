import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BattlePlacementService } from '@axe/application/tabletop/battle-placement.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { TranslocoModule } from '@jsverse/transloco';

/** The directions offered for where the other side starts, in degrees clockwise from the right. */
export const PLACEMENT_BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/**
 * Sets two sides out at the start of a fight, for the game master: the piece leading the other side,
 * how far away and in which direction it starts, the distance the two leaders stand at now and what
 * the room's table says it does, which of the situations the table names apply, and which pieces are
 * out of the fight.
 */
@Component({
  selector: 'battle-placement-panel',
  templateUrl: './battle-placement-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  imports: [TranslocoModule],
})
export class BattlePlacementPanelComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly placement = inject(BattlePlacementService);

  constructor() {
    closeWhenOffTheTable();
  }
  private readonly zones = inject(EngagementZoneService);

  /** The piece leading the first side, by its identifier. */
  readonly leaderIdentifier = signal('');
  protected readonly otherIdentifier = signal('');
  protected readonly bearing = signal(0);
  protected readonly distanceM = signal<number | null>(null);
  /** The situations from the room's table ticked as applying, by name. */
  protected readonly ticked = signal<readonly string[]>([]);
  protected readonly bearings = PLACEMENT_BEARINGS;

  private readonly everyone = computed(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.versionOf('Config')();
    this.zones.state();
    const entries = this.placement.pieces();
    for (const entry of entries) this.objectChange.versionOf(entry.piece.identifier)();
    return entries;
  });

  protected readonly leader = computed(() => {
    const piece = this.objectStore.get<GameCharacter>(this.leaderIdentifier());
    return piece instanceof GameCharacter ? piece : null;
  });

  /** The pieces that may lead the other side: those on a side other than the leader's. */
  protected readonly others = computed(() => {
    const leader = this.leader();
    const side = this.everyone().find((entry) => entry.piece === leader)?.side ?? null;
    return this.everyone()
      .filter((entry) => entry.side !== null && entry.side !== side)
      .map((entry) => entry.piece);
  });

  protected readonly other = computed(() => {
    const chosen = this.others().find((piece) => piece.identifier === this.otherIdentifier());
    return chosen ?? this.others()[0] ?? null;
  });

  protected readonly distances = computed(() => {
    this.objectChange.versionOf('Config')();
    return this.placement.distances();
  });

  protected readonly distance = computed(() => this.distanceM() ?? this.distances()[0]?.metres ?? 10);

  /** How far apart the two leaders stand now, and what the room's table says that does. */
  protected readonly readout = computed(() => {
    this.everyone();
    const leader = this.leader();
    const other = this.other();
    if (!leader || !other) return null;
    const metres = this.placement.distanceM(leader, other);
    if (metres === null) return null;
    return { metres: metres.toFixed(1), note: this.placement.modifierBetween(leader, other)?.note ?? null };
  });

  /** The rows of the room's table that name a situation, each with whether it is ticked as applying. */
  protected readonly situations = computed(() => {
    this.objectChange.versionOf('Config')();
    const ticked = this.ticked();
    return this.placement.situations().map((row) => ({ ...row, ticked: ticked.includes(row.name) }));
  });

  protected readonly pieces = computed(() =>
    this.everyone().map((entry) => ({ piece: entry.piece, out: entry.piece.offField === '1' }))
  );

  protected chooseOther(event: Event): void {
    this.otherIdentifier.set((event.target as HTMLSelectElement).value);
  }

  protected chooseDistance(event: Event): void {
    const metres = Number((event.target as HTMLInputElement | HTMLSelectElement).value);
    if (Number.isFinite(metres) && metres >= 0) this.distanceM.set(metres);
  }

  protected chooseBearing(event: Event): void {
    this.bearing.set(Number((event.target as HTMLSelectElement).value));
  }

  protected place(): void {
    const leader = this.leader();
    const other = this.other();
    if (!leader || !other) return;
    this.placement.place(leader, other, this.bearing(), this.distance());
  }

  protected toggleSituation(name: string): void {
    this.ticked.update((ticked) => (ticked.includes(name) ? ticked.filter((one) => one !== name) : [...ticked, name]));
  }

  protected announce(): void {
    const leader = this.leader();
    const other = this.other();
    if (leader && other) this.placement.announce(leader, other, this.ticked());
  }

  protected toggleOut(piece: GameCharacter): void {
    this.zones.toggleOffField(piece);
  }
}
