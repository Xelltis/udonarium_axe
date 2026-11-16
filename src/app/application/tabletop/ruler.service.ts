import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PlacedRulerService } from '@axe/application/tabletop/placed-ruler.service';
import { MeasuredRuler, RulerReadingService } from '@axe/application/tabletop/ruler-reading.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ALTITUDE_STEP_CELLS } from '@axe/domain/tabletop/altitude-step';
import {
  decodeRulerLine,
  encodeRulerLine,
  RulerEnd,
  RulerLine,
  squareMiddleOf,
} from '@axe/domain/tabletop/ruler/ruler-line';
import type { TableWorldGuide } from '@axe/domain/tabletop/world/table-solids';

export type { MeasuredRuler } from '@axe/application/tabletop/ruler-reading.service';

/** The pick layer a character is pressed by, which a ruler's end holds to. */
const CHARACTER_LAYER = 'character';

/** The colour this seat's ruler is drawn in, and the colour another seat's is drawn in here. */
export const OWN_RULER_COLOUR = '#ffec8c';
export const OTHER_RULER_COLOUR = '#9fe0ff';
/** How often at most this seat tells the room where its ruler is laid while it draws it out, in milliseconds. */
const TELL_EVERY_MS = 80;

/** A ruler another seat is laying, as this seat sees it, and whose it is. */
export interface OthersRuler extends MeasuredRuler {
  /** The cursor of the seat laying it. */
  readonly id: string;
  readonly name: string;
}

/**
 * The ruler this seat measures the table with: whether it is in hand, the line it is laid along, and
 * what that line measures, and the rulers the other seats are laying, as this seat sees them. An end
 * laid on a piece is held to it, at the middle of its feet, and moves with it; an end laid on the
 * table keeps to the middle of a square where the table snaps, unless it is laid freely. The far end
 * may be lifted off what it was laid on. A line laid on one table is taken away as another is viewed.
 */
@Injectable({ providedIn: 'root' })
export class RulerService {
  private readonly tabletop = inject(TabletopService);
  private readonly pick = inject(TablePickService);
  private readonly standing = inject(StandingGroundService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly readings = inject(RulerReadingService);
  private readonly placed = inject(PlacedRulerService);

  /** Whether this seat has the ruler in hand: a press on the table lays it rather than doing anything else. */
  readonly inHand = signal(false);
  /** The ruler as this seat laid it, or null before it lays one. */
  readonly laid = signal<RulerLine | null>(null);
  /** Whether this seat is drawing the ruler out now, its far end following the pointer. */
  readonly drawing = signal(false);
  /** How far the far end is lifted off what it is laid on, in table pixels, which it keeps as it is drawn about. */
  private farLift = 0;

  /** The ruler as this seat sees it now, its ends held to pieces where they stand now. */
  readonly measured = computed<MeasuredRuler | null>(() => {
    const line = this.laid();
    return line ? this.readings.measure(line) : null;
  });

  /**
   * The rulers the other seats are laying on the table in view, each as this seat sees it, and none of
   * whose ends this seat may not see: an end held to a piece hidden from it, or laid on ground it has
   * not found under the fog.
   */
  readonly others = computed<readonly OthersRuler[]>(() => {
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    const table = this.tabletop.currentTableVersion();
    const mine = PeerCursor.myCursor?.identifier;
    const rulers: OthersRuler[] = [];
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      if (cursor.identifier === mine) continue;
      this.objectChange.versionOf(cursor.identifier)();
      if (!cursor.measuring || cursor.measuringTable !== table.identifier) continue;
      const line = decodeRulerLine(cursor.measuring);
      if (!line || !this.readings.maySee(line.from) || !this.readings.maySee(line.to)) continue;
      const measured = this.readings.measure(line);
      if (measured) rulers.push({ id: cursor.identifier, name: cursor.name, ...measured });
    }
    return rulers;
  });

  /**
   * The lines the rulers being laid are drawn with in the scene: this seat's own, and those the other
   * seats are laying that it may see, each from end to end, and down from an end off the ground.
   */
  readonly guides = computed<readonly TableWorldGuide[]>(() => {
    const measured = this.measured();
    const others = this.others().map((other) => this.readings.guideOf(`ruler#${other.id}`, other, OTHER_RULER_COLOUR));
    return measured ? [this.readings.guideOf('ruler#own', measured, OWN_RULER_COLOUR), ...others] : others;
  });

  constructor() {
    let told = '';
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastTold = 0;
    const tell = () => {
      timer = null;
      const cursor = PeerCursor.myCursor;
      const line = untracked(() => (this.inHand() ? this.laid() : null));
      const text = encodeRulerLine(line);
      const table = text ? untracked(() => this.tabletop.currentTable.identifier) : '';
      if (!cursor || `${text}|${table}` === told) return;
      told = `${text}|${table}`;
      lastTold = Date.now();
      GameObject.batch(() => {
        cursor.measuring = text;
        cursor.measuringTable = table;
      });
    };
    let table = untracked(() => this.tabletop.currentTable.identifier);
    effect(() => {
      const now = this.tabletop.currentTableVersion().identifier;
      if (now === table) return;
      table = now;
      untracked(() => this.clear());
    });
    effect(() => {
      this.laid();
      this.inHand();
      untracked(() => {
        if (timer !== null) return;
        const wait = Math.max(0, TELL_EVERY_MS - (Date.now() - lastTold));
        timer = setTimeout(tell, wait);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      if (timer !== null) clearTimeout(timer);
    });
  }

  /** Takes the ruler up, or puts it away, as it was. */
  toggle(): void {
    if (this.inHand()) this.putAway();
    else this.inHand.set(true);
  }

  /** Puts the ruler away, and the line it was laid along with it. */
  putAway(): void {
    this.inHand.set(false);
    this.drawing.set(false);
    this.laid.set(null);
  }

  /** Takes the line away and keeps the ruler in hand, to lay it afresh. */
  clear(): void {
    this.drawing.set(false);
    this.laid.set(null);
  }

  /**
   * Leaves the ruler as it is laid lying on the table for everyone, and takes it out of this seat's
   * hand, to lay another. Nothing while it is not laid.
   */
  leaveOnTable(): void {
    const line = this.laid();
    if (!line) return;
    this.placed.place(line);
    this.clear();
  }

  /** Starts drawing the ruler out from a point of the page, its far end following the pointer from there. */
  startAt(pageX: number, pageY: number, free: boolean): void {
    const from = this.endAt(pageX, pageY, free);
    if (!from) return;
    this.farLift = 0;
    this.inHand.set(true);
    this.laid.set({ from, to: from });
    this.drawing.set(true);
  }

  /** Starts drawing the ruler out from a piece, its far end following the pointer until it is let go. */
  startFrom(piece: GameCharacter): void {
    const from = this.readings.endOnPiece(piece, 0);
    this.farLift = 0;
    this.inHand.set(true);
    this.laid.set({ from, to: from });
    this.drawing.set(true);
  }

  /** Moves the far end of the ruler being drawn out to a point of the page, keeping how far it was lifted. */
  reachTo(pageX: number, pageY: number, free: boolean): void {
    const line = this.laid();
    if (!line || !this.drawing()) return;
    const to = this.endAt(pageX, pageY, free);
    if (!to) return;
    this.laid.set({ from: line.from, to: liftedBy(to, this.farLift) });
  }

  /** Stops drawing the ruler out, leaving it laid where it was let go until it is cleared or laid again. */
  letGo(): void {
    this.drawing.set(false);
  }

  /** Lifts the far end of the ruler by steps of altitude, or lowers it for fewer than none. */
  liftEnd(steps: number): void {
    const line = this.laid();
    if (!line || steps === 0) return;
    const step = steps * ALTITUDE_STEP_CELLS * this.readings.gridSize();
    this.farLift += step;
    this.laid.set({ from: line.from, to: liftedBy(line.to, step) });
  }

  /**
   * Where an end laid at a point of the page stands: on the piece the point lands on, held to it, or
   * on the face the point lands on there, kept to the middle of its square on a table that snaps unless
   * laid freely. Null before the table has a camera.
   */
  endAt(pageX: number, pageY: number, free: boolean): RulerEnd | null {
    const hit = this.pick.pressedAt(pageX, pageY);
    if (hit?.target.layer === CHARACTER_LAYER) {
      const piece = this.objectStore.get<GameCharacter>(hit.target.id);
      if (piece instanceof GameCharacter) return this.readings.endOnPiece(piece, 0);
    }
    if (!this.pick.rayAt(pageX, pageY)) return null;
    const landed = this.pick.landingAt(pageX, pageY);
    const table = this.tabletop.currentTable;
    if (free || !table.gridSnap) return { x: landed.x, y: landed.y, z: landed.z };
    const middle = squareMiddleOf(landed, this.tabletop.squarePx(), table.gridType);
    const onFloor = landed.z <= this.standing.heightPxAt(landed.x, landed.y) + 0.5;
    return { ...middle, z: onFloor ? this.standing.heightPxAt(middle.x, middle.y) : landed.z };
  }
}

/** An end lifted so far: over the feet of its piece, or off the point it was laid on. */
export function liftedBy(end: RulerEnd, lift: number): RulerEnd {
  if (lift === 0) return end;
  return end.piece ? { ...end, lift: (end.lift ?? 0) + lift } : { ...end, z: end.z + lift };
}
