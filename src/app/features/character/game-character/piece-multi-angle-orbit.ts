import { computed } from '@angular/core';
import type { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { clamp } from '@axe/core/util/clamp';
import { BuffBadge } from '@axe/domain/character/buff-badge';
import { PieceGauge } from '@axe/domain/character/piece-gauge';
import {
  DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS,
  multiAngleNameMotionMode,
  multiAngleOrbitAnimation,
  multiAngleRotationPhase,
} from '@axe/domain/tabletop/multi-angle';
import { makeMultiAngleCurvedName } from '@axe/ui/tabletop/multi-angle-curved-name';
import { makeMultiAngleBuffOrbit, makeMultiAngleResourceGauge } from '@axe/ui/tabletop/multi-angle-orbit-decoration';

const MULTI_ANGLE_RESOURCE_BUFF_DURATION_FACTOR = 1.25;

/** What the labels going round a piece read of the piece and of the table. Each is read as a signal. */
export interface PieceMultiAngleOrbitHost {
  /** Whether the piece stands on a table seen flat, and is no poster, so labels may go round it. */
  standsFlat(): boolean;
  /** The table's display settings. */
  display(): ReturnType<TabletopService['display']>;
  /** The piece's identifier, or nothing before a piece is bound. */
  identifier(): string | undefined;
  /** The piece's name as this reader is shown it. */
  name(): string;
  /** The names of those riding the piece, in the order their labels stand. */
  riderNames(): readonly string[];
  /** Whether the name is kept from this reader. */
  hideName(): boolean;
  /** Whether the buffs are kept from this reader. */
  hideBuff(): boolean;
  /** Whether the piece is riding another, which draws its labels for it. */
  riding(): boolean;
  /** How wide the piece stands, in px. */
  footprint(): number;
  /** The bars drawn round the piece, as the reader is shown them. */
  gauges(): readonly PieceGauge[];
  /** The buffs on the piece. */
  buffs(): readonly BuffBadge[];
  /** How large the buff icons are drawn, as a ratio. */
  buffIconScale(): number;
}

/**
 * The name, the bars and the buffs that go round a piece on a table seen flat, so that seats on
 * every side can read them: what is laid on each ring, how large, and how it turns.
 */
export class PieceMultiAngleOrbit {
  constructor(private readonly host: PieceMultiAngleOrbitHost) {}

  /** Whether the name goes round the piece. */
  readonly nameEnabled = computed(() => this.host.standsFlat() && this.host.display().multiAngleEnabled);

  /** Whether the bars and the buffs go round the piece as well. */
  readonly resourceBuffEnabled = computed(
    () => this.nameEnabled() && this.host.display().multiAngleResourceBuffEnabled
  );

  /**
   * What the ring of the name reads: the riders before the piece, or the piece's name followed by
   * the start of its buffs' names where the buffs have no ring of their own.
   */
  readonly labelText = computed(() => {
    const riders = this.host.riderNames();
    if (riders.length > 0) return [...riders, this.host.name()].join('／');
    if (this.host.hideBuff() || this.resourceBuffEnabled()) return this.host.name();
    const buffNames = this.host
      .buffs()
      .map((buff) => buff.name.trim())
      .filter((name) => name.length > 0)
      .join('・');
    if (buffNames.length < 1) return this.host.name();
    const leadingBuff = Array.from(buffNames).slice(0, 5).join('');
    return `${this.host.name()}/${leadingBuff}`;
  });

  /** How the name is laid on its ring. */
  readonly curvedName = computed(() => makeMultiAngleCurvedName(this.labelText(), this.host.footprint()));

  /** How the bars are laid on their ring. */
  readonly resourceGauge = computed(() => makeMultiAngleResourceGauge(this.host.gauges(), this.host.footprint()));

  /** How the buffs are laid on their ring, outside the name and the bars. */
  readonly buffOrbit = computed(() => {
    const name = this.curvedName();
    const gauge = this.resourceGauge();
    const innerExtent = Math.max(name.radius + name.fontSize / 2 + name.strokeWidth / 2, gauge.outerExtent);
    return makeMultiAngleBuffOrbit(
      this.host.buffs().length,
      this.host.footprint(),
      innerExtent,
      this.host.buffIconScale()
    );
  });

  /** Whether any ring has something to show. */
  readonly visible = computed(
    () =>
      this.nameEnabled() &&
      !this.host.riding() &&
      ((this.host.name().length > 0 && !this.host.hideName()) ||
        (this.resourceBuffEnabled() &&
          (this.host.gauges().length > 0 || (!this.host.hideBuff() && this.host.buffs().length > 0))))
  );

  /** The name of the path the name is written along, the piece's own. */
  readonly curvedNamePathId = computed(() => `multi-angle-curved-name-${this.host.identifier() ?? 'unknown'}`);

  /** How the ring of the name turns. */
  readonly nameAnimation = computed(() => {
    const display = this.host.display();
    return multiAngleOrbitAnimation(
      multiAngleNameMotionMode(display.multiAngleMotionMode),
      display.multiAngleRevolutionSeconds,
      display.multiAnglePauseSeconds
    );
  });

  /** How the ring of the bars and the buffs turns: as the name's does, but slower. */
  readonly resourceBuffAnimation = computed(() => {
    const nameAnimation = this.nameAnimation();
    return {
      durationSeconds: nameAnimation.durationSeconds * MULTI_ANGLE_RESOURCE_BUFF_DURATION_FACTOR,
      timingFunction: nameAnimation.timingFunction,
    };
  });

  private readonly namePhase = computed(() => multiAngleRotationPhase(`${this.host.identifier() ?? 'unknown'}:name`));

  private readonly resourceBuffPhase = computed(() =>
    multiAngleRotationPhase(`${this.host.identifier() ?? 'unknown'}:resource-buff`)
  );

  /** Where in its turn the piece itself starts, so pieces do not all turn in step. */
  readonly piecePhase = computed(() => multiAngleRotationPhase(`${this.host.identifier() ?? 'unknown'}:piece`));

  /** How far into its turn the ring of the name starts, as a negative delay in seconds. */
  readonly nameDelaySeconds = computed(() => -this.namePhase() * this.nameAnimation().durationSeconds);

  /** How far into its turn the ring of the bars and the buffs starts, as a negative delay in seconds. */
  readonly resourceBuffDelaySeconds = computed(
    () => -this.resourceBuffPhase() * this.resourceBuffAnimation().durationSeconds
  );

  /** How long the piece itself takes to turn once, held between 5 and 300 seconds. */
  readonly pieceRevolutionSeconds = computed(() => {
    const seconds = this.host.display().multiAnglePieceRevolutionSeconds;
    return Number.isFinite(seconds) ? clamp(seconds, 5, 300) : DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS;
  });
}
