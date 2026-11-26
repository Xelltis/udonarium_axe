import { inject, Injectable } from '@angular/core';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import type { GameCharacter } from '@axe/domain/character/game-character';
import type { AimBody } from '@axe/domain/tabletop/aim-order';
import { pieceCentreOf, pieceCentreOffsetPx } from '@axe/domain/tabletop/move/piece-on-grid';
import type { RangeArea } from '@axe/domain/tabletop/range';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';

/**
 * Where a piece stands in the room, read in one place for everything that measures from a piece or
 * takes a piece in: the order a key aims in, the ranges a piece casts and the ranges that take it in,
 * and an effect's area. A piece on the floor is read where it stands across the table, as each of
 * those has always read it; a piece on a wall or a board, where it stands out from that face in the
 * room, worked out from the face as it is drawn, rather than at its place on the face read as a place
 * on the floor.
 */
@Injectable({ providedIn: 'root' })
export class PiecePlaceService {
  private readonly pieces = inject(TablePiecesService);
  private readonly surfaces = inject(TableSurfaceService);
  private readonly tabletop = inject(TabletopService);

  /**
   * The body of a piece in the room: the line through its middle from its feet, at the height it
   * stands at, its altitude included, as far as it is wide; upright on the floor, standing at
   * `onFloor` (the middle of the piece, or the centre of an engagement zone it is in, as the caller
   * reads it), and out from the face on a wall or a board.
   */
  bodyAt(piece: GameCharacter, onFloor: { x: number; y: number }): AimBody {
    const grid = this.grid();
    const foot = this.pieces.footOf(piece);
    const lift = foot.height + piece.altitude * grid;
    const frame = foot.surface === 'floor' ? null : this.surfaces.frameOf(foot.surface);
    const half = pieceCentreOffsetPx(piece, grid);
    if (!frame) {
      return {
        feet: { x: onFloor.x, y: onFloor.y, z: lift },
        head: { x: onFloor.x, y: onFloor.y, z: lift + half * 2 },
      };
    }
    const across = foot.x + half;
    const down = foot.y + half;
    const outAt = (out: number): Vec3 => ({
      x: frame.origin.x + frame.u.x * across + frame.v.x * down + frame.normal.x * out,
      y: frame.origin.y + frame.u.y * across + frame.v.y * down + frame.normal.y * out,
      z: frame.origin.z + frame.u.z * across + frame.v.z * down + frame.normal.z * out,
    });
    return { feet: outAt(lift), head: outAt(lift + half * 2) };
  }

  /**
   * Where something laid on the table for a piece is put, as a range following a piece, of any kind,
   * or the circle of an effect's area: across the table at `onFloor` (the middle of the piece unless
   * given), at the height the piece is put at, for a piece on the floor; on the floor under its feet,
   * for a piece on a wall or a board.
   */
  floorPlaceOf(piece: GameCharacter, onFloor?: { x: number; y: number }): Vec3 {
    const at = onFloor ?? pieceCentreOf(piece, this.grid());
    if (this.pieces.footOf(piece).surface === 'floor') return { x: at.x, y: at.y, z: piece.posZ };
    const { feet } = this.bodyAt(piece, at);
    return { x: feet.x, y: feet.y, z: 0 };
  }

  /** The middle of a piece's body in the room (see `bodyAt`), at the middle of the piece on the floor. */
  bodyMiddleOf(piece: GameCharacter): Vec3 {
    const { feet, head } = this.bodyAt(piece, pieceCentreOf(piece, this.grid()));
    return { x: (feet.x + head.x) / 2, y: (feet.y + head.y) / 2, z: (feet.z + head.z) / 2 };
  }

  /**
   * Puts a range on the piece it follows where the piece lays it (see `floorPlaceOf`), whatever kind it
   * is, so that a range changed from one kind to another stands where it stood; a sphere or a column
   * keeps its offset from there. Every way a range comes to follow a piece or is put back on it does
   * this.
   */
  follow(range: RangeArea): void {
    range.following(this.grid(), (piece) => this.floorPlaceOf(piece));
  }

  private grid(): number {
    const size = this.tabletop.currentTable.gridSize;
    return size > 0 ? size : 50;
  }
}
