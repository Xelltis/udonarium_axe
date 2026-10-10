import { inject, Injectable } from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { ConcealmentService } from '@axe/application/tabletop/concealment.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { dieRadiusOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { Tray } from '@axe/domain/dice/dice-3d/throw-validation';
import { trayFor } from '@axe/domain/dice/dice-3d/tray-size';

/** Where on the table a throw lands, and how its tray lies there. */
export interface TablePlacement {
  /**
   * From the tray's own space to the table's, as sixteen numbers column after column: the tray's
   * width runs across the reader's screen, its depth up it, and its height off the table.
   */
  readonly model: readonly number[];
  readonly tray: Tray;
}

/** How large a d6 stands on the table, as a share of a cell. */
export const DIE_CELLS = 0.55;
/** The cells a tray for a couple of dice covers, across the screen and up it. */
const TRAY_CELLS_ACROSS = 4;
const TRAY_CELLS_UP = 3;
/** How far in front of the piece that rolled, toward the reader, the dice come down, in cells. */
export const IN_FRONT_CELLS = 1.5;
/** The gap between trays laid side by side, in cells. */
const TRAY_GAP_CELLS = 0.5;
/** How far up the screen the way up the screen is measured, in CSS pixels. */
const UP_PROBE_PX = 40;

const D6_EDGE = (2 * dieRadiusOf('d6')) / Math.sqrt(3);

/**
 * Finds where on the table a roll's dice are thrown for this reader.
 *
 * In front of the piece that rolled, when it is on the table and in this reader's sight, so the
 * dice come down before it; otherwise in the middle of the screen. The tray lies square to the
 * reader's screen wherever the table is turned, so the dice come in from the left as in a frame
 * and their numbers read upright, and it stands on the floor the piece stands on.
 */
@Injectable({ providedIn: 'root' })
export class DiceTrayPlacementService {
  private readonly coordinates = inject(CoordinateService);
  private readonly tabletop = inject(TabletopService);
  private readonly vision = inject(VisionService);
  private readonly concealment = inject(ConcealmentService);
  private readonly objectStore = inject(ObjectStore);

  /**
   * Where a roll's trays, each with so many dice, said by a piece, are thrown: side by side across
   * the screen, the row kept whole on the board. Null when no table is on show.
   */
  placementsFor(speakerIdentifier: string, counts: readonly number[]): TablePlacement[] | null {
    const origin = this.coordinates.tabletopOriginElement;
    if (!origin || origin === document.body || !origin.isConnected) return null;
    const table = this.tabletop.currentTable;
    const grid = table.gridSize;
    if (!(grid > 0)) return null;

    const scale = (grid * DIE_CELLS) / D6_EDGE;
    const cell = grid / scale;
    const area = TRAY_CELLS_ACROSS * TRAY_CELLS_UP * cell * cell;
    const trays = counts.map((count) => trayFor(count, TRAY_CELLS_ACROSS / TRAY_CELLS_UP, area));
    const gap = TRAY_GAP_CELLS * cell;
    const across = trays.reduce((sum, tray) => sum + tray.halfWidth * 2, 0) + gap * Math.max(0, trays.length - 1);
    const deep = Math.max(0, ...trays.map((tray) => tray.halfDepth));

    const speaker = this.speakerOf(speakerIdentifier);
    const ground = speaker ? this.footOf(speaker, grid) : this.middleOfScreen();
    const [ax, ay] = this.upTheScreenAt(ground);
    // Across the screen is up the screen turned a quarter clockwise on the table.
    const [rx, ry] = [-ay, ax];
    const wanted: [number, number] = speaker
      ? [ground[0] - ax * IN_FRONT_CELLS * grid, ground[1] - ay * IN_FRONT_CELLS * grid]
      : [ground[0], ground[1]];
    const reach: [number, number] = [
      (Math.abs(rx) * (across / 2) + Math.abs(ax) * deep) * scale,
      (Math.abs(ry) * (across / 2) + Math.abs(ay) * deep) * scale,
    ];
    const [x, y] = onTheBoard(wanted, reach, [table.width * grid, table.height * grid]);

    let from = -across / 2;
    return trays.map((tray) => {
      const along = (from + tray.halfWidth) * scale;
      from += tray.halfWidth * 2 + gap;
      return {
        tray,
        model: [
          rx * scale,
          ry * scale,
          0,
          0,
          ax * scale,
          ay * scale,
          0,
          0,
          0,
          0,
          scale,
          0,
          x + rx * along,
          y + ry * along,
          ground[2],
          1,
        ],
      };
    });
  }

  /** The piece that said the line, when it is on the table for this reader to see. */
  private speakerOf(identifier: string): GameCharacter | null {
    if (identifier.length < 1) return null;
    const piece = this.objectStore.get<GameCharacter>(identifier);
    if (!(piece instanceof GameCharacter) || piece.location.name !== 'table') return null;
    if (this.concealment.isConcealed(piece) || !this.vision.isTokenVisible(piece)) return null;
    return piece;
  }

  /** The middle of a piece's footprint, on the floor it stands on. */
  private footOf(piece: GameCharacter, grid: number): [number, number, number] {
    const half = ((piece.size || 1) * grid) / 2;
    return [piece.location.x + half, piece.location.y + half, piece.posZ];
  }

  /** The point of the table under the middle of the screen. */
  private middleOfScreen(): [number, number, number] {
    const local = this.coordinates.convertToLocal(
      { x: window.innerWidth / 2, y: window.innerHeight / 2, z: 0 },
      this.coordinates.tabletopOriginElement
    );
    return [local.x, local.y, 0];
  }

  /** Which way across the table runs up the reader's screen at a point, as a unit length. */
  private upTheScreenAt([x, y]: readonly number[]): [number, number] {
    const origin = this.coordinates.tabletopOriginElement;
    const page = this.coordinates.convertToGlobal({ x, y, z: 0 }, origin);
    const above = this.coordinates.convertToLocal({ x: page.x, y: page.y - UP_PROBE_PX, z: 0 }, origin);
    const [dx, dy] = [above.x - x, above.y - y];
    const length = Math.hypot(dx, dy);
    return length > 1e-6 && Number.isFinite(length) ? [dx / length, dy / length] : [0, -1];
  }
}

/**
 * Where a tray reaching so far each way from its middle lies when it is moved no more than it must
 * be to stay on the board; one larger than the board is set in its middle.
 */
function onTheBoard(
  [x, y]: readonly [number, number],
  reach: readonly [number, number],
  size: readonly [number, number]
): [number, number] {
  const fit = (at: number, half: number, length: number) => {
    if (!(length > 0)) return at;
    if (half * 2 >= length) return length / 2;
    return Math.min(length - half, Math.max(half, at));
  };
  return [fit(x, reach[0], size[0]), fit(y, reach[1], size[1])];
}
