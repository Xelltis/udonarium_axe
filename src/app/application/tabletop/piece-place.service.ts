import { inject, Injectable } from '@angular/core';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import type { AimBody } from '@axe/domain/tabletop/aim-order';
import { pieceCentreOf, pieceCentreOffsetPx } from '@axe/domain/tabletop/move/piece-on-grid';
import type { RangeArea } from '@axe/domain/tabletop/range';
import { faceHeightOver, type Vec3 } from '@axe/domain/tabletop/surface-space';
import type { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/** Something on the table that stands as a piece does, by a corner and a size in cells: a piece, or a card. */
export type StandingThing = TabletopObject & { readonly size: number };

/**
 * Where a piece, or anything else on the table, stands in the room, read in one place for everything
 * that measures from it, takes it in or is laid or drawn for it: the order a key aims in, the ranges a
 * piece casts and the ranges that take it in, an effect's area, what is cast at it, the marks over it,
 * a ruler held to it and an arrow pointing at it. Every point is read where the table draws the thing,
 * following it while this seat moves it, on the raised ground or the block under it; only the height
 * a range is kept at is read over the ground under it, as a range keeps it. A piece on a wall or a
 * board is read where it stands out from that face in the room, rather than at its place on the face
 * read as a place on the floor, over the ground under it read one way (see `groundUnder`).
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
  bodyAt(piece: StandingThing, onFloor: { x: number; y: number }): AimBody {
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
   * Where a range is laid for a piece, as one following it or named for it, at the height a range is
   * kept at, over the ground under it: across the table at `onFloor` (the middle of the piece unless
   * given), at the height the piece is put at, for a piece on the floor; on the ground under its feet,
   * draped over it, for a piece on a wall or a board.
   */
  floorPlaceOf(piece: GameCharacter, onFloor?: { x: number; y: number }): Vec3 {
    const at = onFloor ?? pieceCentreOf(piece, this.grid());
    if (this.pieces.surfaceOf(piece) === 'floor') return { x: at.x, y: at.y, z: piece.posZ };
    const { feet } = this.bodyAt(piece, at);
    return { x: feet.x, y: feet.y, z: 0 };
  }

  /**
   * The floor under a piece, at its height in the room, as an effect's area and the floor a range
   * standing up keeps over are kept at: the middle of a piece on the floor, as it is drawn, on its
   * ground or the block under it; for a piece on a wall or a board, the ground under its feet (see
   * `groundUnder`) where `floorPlaceOf` lays a range for it.
   */
  floorPointOf(piece: GameCharacter): Vec3 {
    const foot = this.pieces.footOf(piece);
    if (foot.surface === 'floor') {
      const half = pieceCentreOffsetPx(piece, this.grid());
      return { x: foot.x + half, y: foot.y + half, z: foot.height };
    }
    const { feet } = this.bodyAt(piece, pieceCentreOf(piece, this.grid()));
    return { x: feet.x, y: feet.y, z: this.groundUnder(piece, feet.x, feet.y) };
  }

  /**
   * An upright body standing in for a piece on a wall or a board, for what reads a piece as standing
   * up on its feet, as what is cast at it, the marks over it and a ruler held to it: centred where the
   * middle of its body stands out from the face in the room, its feet half its height below, over the
   * ground under it there (see `groundUnder`). Null for a piece on the floor, which stands up as it is.
   */
  standInOf(
    piece: StandingThing
  ): { readonly x: number; readonly y: number; readonly footZ: number; readonly groundZ: number } | null {
    if (this.pieces.surfaceOf(piece) === 'floor') return null;
    const middle = this.bodyMiddleOf(piece);
    const footZ = middle.z - pieceCentreOffsetPx(piece, this.grid());
    return { x: middle.x, y: middle.y, footZ, groundZ: this.groundBelow(piece, middle.x, middle.y, footZ) };
  }

  /**
   * Where something stands for what is cast at it, marked on it, held to it or pointed at it: the
   * middle of a piece on the floor as it is drawn, read as one cell across where it has no size, on
   * its ground or the block under it; the feet of the body standing in for a piece on a wall or a
   * board (see `standInOf`); anything else, a card or a stack of cards, at its middle on the face it
   * lies on (see `faceCentreOf`).
   */
  standingCentreOf(thing: TabletopObject): Vec3 {
    if (!(thing instanceof GameCharacter)) return this.faceCentreOf(thing);
    const standIn = this.standInOf(thing);
    if (standIn) return { x: standIn.x, y: standIn.y, z: standIn.footZ };
    const foot = this.pieces.footOf(thing);
    const half = (this.grid() * cellsAcross(thing)) / 2;
    return { x: foot.x + half, y: foot.y + half, z: foot.height };
  }

  /**
   * Where something lying on the face it is on meets what points at it, in the room: the middle of the
   * first picture the table lays of it on that face, as tall as the picture is drawn (see
   * `TablePiecesService.lyingMiddleOf`); else half a cell across its size in from its corner, read as
   * one cell where it has no size, on the face it is drawn on.
   */
  faceCentreOf(thing: TabletopObject): Vec3 {
    const drawn = this.pieces.lyingMiddleOf(thing);
    if (drawn) return drawn;
    const foot = this.pieces.footOf(thing);
    const half = (this.grid() * cellsAcross(thing)) / 2;
    return (
      this.surfaces.boardPointOf(foot.surface, foot.x + half, foot.y + half, foot.height) ?? {
        x: foot.x + half,
        y: foot.y + half,
        z: foot.height,
      }
    );
  }

  /**
   * The corner a range named for a piece is laid at, at the height a range is kept at (see
   * `floorPlaceOf`): the piece's own corner and height on the floor; draped over the ground under its
   * feet, as a box of the piece's size round them, for a piece on a wall or a board.
   */
  floorCornerOf(piece: GameCharacter): Vec3 {
    if (this.pieces.surfaceOf(piece) === 'floor') {
      return { x: piece.location.x, y: piece.location.y, z: piece.posZ };
    }
    return this.cornerRound(piece, this.floorPlaceOf(piece));
  }

  /**
   * The corner an effect is left standing at for a piece, at its height in the room (see
   * `floorPointOf`): the piece's own corner as it is drawn, on its ground or the block under it, on
   * the floor; round the floor under its feet for a piece on a wall or a board.
   */
  fieldCornerOf(piece: GameCharacter): Vec3 {
    return this.cornerRound(piece, this.floorPointOf(piece));
  }

  private cornerRound(piece: GameCharacter, middle: Vec3): Vec3 {
    const half = pieceCentreOffsetPx(piece, this.grid());
    return { x: middle.x - half, y: middle.y - half, z: middle.z };
  }

  /** The middle of a piece's body in the room (see `bodyAt`), at the middle of the piece on the floor. */
  bodyMiddleOf(piece: StandingThing): Vec3 {
    const { feet, head } = this.bodyAt(piece, pieceCentreOf(piece, this.grid()));
    return { x: (feet.x + head.x) / 2, y: (feet.y + head.y) / 2, z: (feet.z + head.z) / 2 };
  }

  /**
   * Puts a range on the piece it follows where the piece lays it (see `floorPlaceOf`), whatever kind it
   * is, so that a range changed from one kind to another stands where it stood; a sphere or a column
   * keeps its offset from there. Every way a range comes to follow a piece or is put back on it does
   * this. As the piece moves, the seat that moved it alone puts it on again (see `RangeComponent`),
   * so that seats drawing the piece differently, one yet to get the picture of a wall, write nothing
   * over each other.
   */
  follow(range: RangeArea): void {
    range.following(this.grid(), (piece) => this.floorPlaceOf(piece));
  }

  /**
   * Puts a range following a piece back on it, its offset and altitude let go, as putting a sphere
   * back on its caster does.
   */
  putBack(range: RangeArea): void {
    range.casterOffset = { x: 0, y: 0 };
    range.altitude = 0;
    this.follow(range);
  }

  /**
   * Changes what a range stands up as or its shape, by `change`, as the seat changing it: a range
   * following a piece that comes to keep an offset from it or stops keeping one, as a sphere made
   * flat or a cone made a column, is put back on the piece (see `putBack`), since the offset of the
   * one is no offset of the other; a range following no piece lets its offset go then too, so that
   * it keeps none into a piece it follows later. Between a sphere and a column the offset is kept.
   * Every way a range's kind or shape is changed comes here; a range only received or restored is left
   * as it came.
   */
  reshape(range: RangeArea, change: () => void): void {
    const kept = range.keepsCasterOffset;
    change();
    if (range.keepsCasterOffset === kept) return;
    if (range.followingCharacterIdentifier) this.putBack(range);
    else range.casterOffset = { x: 0, y: 0 };
  }

  /**
   * The ground under a piece on a wall or a board at a point across the table, in the room, as the
   * floor it is read as standing over: what can be stood on below the feet of the body standing in for
   * it (see `standInOf`), the top of a block or the ground, or the face of the board it is on where
   * that face looks up and reaches over the point; never above those feet.
   */
  private groundUnder(piece: StandingThing, x: number, y: number): number {
    const footZ = this.bodyMiddleOf(piece).z - pieceCentreOffsetPx(piece, this.grid());
    return this.groundBelow(piece, x, y, footZ);
  }

  private groundBelow(piece: StandingThing, x: number, y: number, footZ: number): number {
    const landed = this.pieces.landingPxAt(x, y, footZ);
    const surface = this.pieces.surfaceOf(piece);
    const frame = this.surfaces.frameOf(surface);
    const size = this.surfaces.sizeOf(surface);
    const face = frame && size ? faceHeightOver(frame, size, x, y) : null;
    return face === null ? landed : Math.max(landed, Math.min(face, footZ));
  }

  private grid(): number {
    const size = this.tabletop.currentTable.gridSize;
    return size > 0 ? size : 50;
  }
}

/** How many cells across a thing is read as, where it is measured from its middle: one where it has no size. */
function cellsAcross(thing: TabletopObject): number {
  const size = (thing as { size?: unknown }).size;
  return typeof size === 'number' && size > 0 ? size : 1;
}
