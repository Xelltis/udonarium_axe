import { computed, inject } from '@angular/core';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PiecePartsService } from '@axe/application/tabletop/piece-parts.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { sameEntries, sameFields } from '@axe/core/util/same-fields';
import { BuffBadge, toBuffBadges } from '@axe/domain/character/buff-badge';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PieceGauge, selectPieceGauges, shownGauge } from '@axe/domain/character/piece-gauge';
import { DataElement } from '@axe/domain/data/data-element';
import { RideSeat, seatOf } from '@axe/domain/tabletop/ride/ride-rules';

/** The mark each seat is shown with in the riding label. */
const RIDING_SEAT_ICONS: Readonly<Record<RideSeat, string>> = {
  rider: 'upgrade',
  passenger: 'group',
  cargo: 'backpack',
  part: 'extension',
};

/** One piece in a mount's riding card: one riding it, or the mount itself. */
export interface RidingLabel {
  readonly identifier: string;
  /** Its name, empty where it is not shown to this reader. */
  readonly name: string;
  /** The mark of the seat it rides in, empty for the mount. */
  readonly icon: string;
  /** How many ride it, for the mount; 0 for one riding. */
  readonly aboard: number;
  /** Whether it is a part of the piece, listed under it, which is aimed at by pressing its row. */
  readonly part: boolean;
  /** Whether this seat aims at it. */
  readonly targeted: boolean;
  /** The number it is picked as while an effect is being aimed, for a part; 0 where it is not picked. */
  readonly pick: number;
  readonly gauges: readonly { readonly gauge: PieceGauge; readonly numbers: string; readonly kept: boolean }[];
  readonly badges: readonly BuffBadge[];
}

/** What the riding labels of a piece read of the piece as it is drawn. */
export interface PieceRidingLabelsHost {
  /** The piece the labels are of, read as a signal; nothing before one is bound. */
  character(): GameCharacter | null | undefined;
  /** The data elements under a root, read through their versions so a change to any is followed; null without a root. */
  followedTree(root: DataElement | null): DataElement[] | null;
  /** The piece's own name. */
  name(): string;
  /** Whether the piece's own name goes unshown to this reader. */
  hideName(): boolean;
  /** Whether the piece's own buffs go unshown to this reader. */
  hideBuff(): boolean;
  /** The piece's own bars, as its rows show them. */
  gaugeRows(): RidingLabel['gauges'];
  /** The piece's own buffs, as its icons show them. */
  buffBadges(): readonly BuffBadge[];
  /** Whether the piece's name and bars run round it, where its riding card is not drawn. */
  labelsRunRound(): boolean;
}

/**
 * The labels of the pieces a piece carries, as they are drawn with its own: those riding it over its
 * labels, its parts under them, and the one card that holds them all over a mount ridden.
 *
 * Made where services can be injected, as the piece's component makes its fields.
 */
export class PieceRidingLabels {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly ride = inject(RideService);
  private readonly parts = inject(PiecePartsService);
  private readonly overlay = inject(PieceOverlayPreferenceService);
  private readonly names = inject(PieceNameService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly effectTargeting = inject(EffectTargetingService);
  private readonly uiSignalService = inject(UiSignalService);

  constructor(private readonly host: PieceRidingLabelsHost) {}

  /** How many ride this piece where it is a mount, shown by its name since they stand where it stands. */
  readonly ridersAboard = computed(() => {
    const char = this.host.character();
    if (!char) return 0;
    this.objectChange.versionOf(char.identifier)();
    if (char.mountable !== '1') return 0;
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      this.objectChange.versionOf(piece.identifier)();
    }
    return this.ride.aboard(char).length;
  });

  /**
   * The mount this piece rides, while it rides one. The piece's name, bars and buffs are drawn in the
   * mount's riding label then, stacked over the mount's own, rather than over itself.
   */
  readonly ridingMount = computed(() => {
    const char = this.host.character();
    if (!char) return null;
    this.objectChange.versionOf(char.identifier)();
    if (char.ridingOn === '') return null;
    this.objectChange.versionOf(char.ridingOn)();
    return this.ride.mountOf(char);
  });

  /**
   * The pieces riding this one, as its riding label shows them over its own labels: their names,
   * bars and buffs, the one in front nearest, as each would show over itself.
   */
  readonly ridingLabels = computed<RidingLabel[]>(
    () => {
      const char = this.host.character();
      if (!char || this.ridersAboard() < 1) return [];
      this.objectChange.trackMyCursor();
      const order: Record<RideSeat, number> = { rider: 0, passenger: 1, cargo: 2, part: 3 };
      return this.ride
        .aboard(char)
        .sort((a, b) => order[seatOf(a.rideSeat)] - order[seatOf(b.rideSeat)])
        .map((piece) => this.labelOf(piece));
    },
    { equal: sameRidingLabels }
  );

  /**
   * The parts of this piece, listed under its own labels as those riding it are listed over them:
   * their names, bars and buffs, each as it would show over itself.
   */
  readonly partLabels = computed<RidingLabel[]>(
    () => {
      const char = this.host.character();
      if (!char) return [];
      // Any piece may be made a part of this one: the parts of every body are worked out once for all.
      const parts = this.parts.partsOfFollowed(char);
      if (parts.length < 1) return [];
      for (const part of parts) this.objectChange.versionOf(part.identifier)();
      this.objectChange.trackMyCursor();
      this.uiSignalService.targetChange();
      return parts.map((piece) => this.labelOf(piece));
    },
    { equal: sameRidingLabels }
  );

  /**
   * The riding card over a mount ridden, one label for all on it: those riding it, the one in front
   * lowest, over the mount itself, each with its name, bars and buffs. Empty where nobody rides it.
   */
  readonly ridingCard = computed<RidingLabel[]>(
    () => {
      const riders = this.ridingLabels();
      const parts = this.partLabels();
      const char = this.host.character();
      if ((riders.length < 1 && parts.length < 1) || !char) return [];
      return [
        ...[...riders].reverse(),
        {
          identifier: char.identifier,
          name: this.host.hideName() ? '' : this.host.name(),
          icon: '',
          aboard: this.ridersAboard(),
          part: false,
          targeted: false,
          pick: 0,
          gauges: this.host.gaugeRows(),
          badges: this.host.hideBuff() ? [] : this.host.buffBadges(),
        },
        ...parts,
      ];
    },
    { equal: sameRidingLabels }
  );

  /**
   * The parts of the piece, listed in a card of their own under it while its name and bars run round
   * it, where its riding card is not drawn: each part is still aimed at by pressing its row.
   */
  readonly partCardInOrbit = computed<RidingLabel[]>(() => (this.host.labelsRunRound() ? this.partLabels() : []));

  /** Whether the mount's own labels are drawn in its riding card rather than over it. */
  readonly labelsInRidingCard = computed(() => this.ridingCard().length > 0 && !this.host.labelsRunRound());

  private labelOf(piece: GameCharacter): RidingLabel {
    const showsName = this.overlay.names() && !this.names.isKept(piece);
    const detail = this.overlay.resourceBars() ? (piece.detailDataElement ?? null) : null;
    const readable = this.disclosureService.canView(piece);
    const gauges =
      detail && this.host.followedTree(detail) !== null
        ? selectPieceGauges(detail).map((gauge) => shownGauge(gauge, readable))
        : [];
    const buffs = this.overlay.buffs() && !piece.hideBuff ? (piece.buffDataElement ?? null) : null;
    const badges = buffs && this.host.followedTree(buffs) !== null ? toBuffBadges(buffs) : [];
    return {
      identifier: piece.identifier,
      name: showsName ? piece.name : '',
      icon: RIDING_SEAT_ICONS[seatOf(piece.rideSeat)],
      aboard: 0,
      part: seatOf(piece.rideSeat) === 'part',
      targeted: piece.targeted,
      pick: seatOf(piece.rideSeat) === 'part' ? (this.effectTargeting.pickOrder().get(piece.identifier) ?? 0) : 0,
      gauges,
      badges,
    };
  }
}

/** The same riding label, or one showing the same pieces with the same names, bars and buffs. */
export function sameRidingLabels(a: readonly RidingLabel[], b: readonly RidingLabel[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((label, index) => {
    const other = b[index];
    return (
      label.identifier === other.identifier &&
      label.name === other.name &&
      label.icon === other.icon &&
      label.aboard === other.aboard &&
      label.part === other.part &&
      label.targeted === other.targeted &&
      label.pick === other.pick &&
      label.gauges.length === other.gauges.length &&
      label.gauges.every(
        (row, at) => row.numbers === other.gauges[at].numbers && sameFields(row.gauge, other.gauges[at].gauge)
      ) &&
      sameEntries(label.badges, other.badges)
    );
  });
}
