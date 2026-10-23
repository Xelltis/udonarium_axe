import { inject, Injectable } from '@angular/core';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { cellCenterOf, CellGrid, cellIndexAt, CellPoint } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { hopHeightAt, hopLiftFor, isWalkableStep, landingHeightAt } from '@axe/domain/tabletop/move/landing-height';
import { isSquareGrid, moveGridOf } from '@axe/domain/tabletop/move/move-grid';
import {
  cellsCoveredAt,
  pieceCornerOn,
  pieceCornersNearest,
  pieceWidthPx,
} from '@axe/domain/tabletop/move/piece-on-grid';

/** How long the piece rests on each cell of the way it walks, once the way is settled. */
export const MOVE_STEP_MS = 90;

/** How a hop onto or off a ledge is drawn: how many times it is redrawn, and how long each lasts. */
export const HOP_FRAMES = 7;
export const HOP_FRAME_MS = 24;

interface StepPoint {
  x: number;
  y: number;
  z: number;
}

interface Arrival {
  centre: CellPoint;
  corner: CellPoint;
  grid: CellGrid;
  cell: number;
  ending: boolean;
  standingZ: number;
}

@Injectable({ providedIn: 'root' })
export class PieceStepService {
  private readonly triggerFire = inject(TriggerFireService);

  /**
   * Steps onto a cell of a grid. On a grid of squares keeping its pieces to their cells, the piece
   * stands on the cells nearest the middle of the square it may stand on, and the ground is read
   * under its own middle.
   *
   * Which of the table's cells it may stand on is `standsOn`'s to say, given the height the piece
   * is at, where the move knows; otherwise it is any cell it can step onto from that height.
   */
  async step(
    character: GameCharacter,
    table: GameTable,
    grid: CellGrid,
    cell: number,
    ending: boolean,
    standingZ: number = character.posZ,
    standsOn?: (tableCell: number, standingPx: number) => boolean
  ): Promise<number> {
    const corner = pieceCornerOn(grid, character, table.gridSize, cell);
    if (isSquareGrid(grid) && grid.keepsToCells) {
      const width = pieceWidthPx(character, table.gridSize);
      const half = width / 2;
      const steps = (tableCell: number) => {
        if (standsOn) return standsOn(tableCell, standingZ);
        const { x, y } = cellCenterOf(grid.fine, tableCell);
        return isWalkableStep(
          landingHeightAt(table.terrains, table.gridSize, x, y, table.gridType),
          standingZ,
          table.gridSize
        );
      };
      const place = pieceCornersNearest(grid, character, cell, { x: corner.x + half, y: corner.y + half }).find(
        (spot) => cellsCoveredAt(grid, spot, width).every(steps)
      );
      return this.stepOnto(character, table, grid, cell, { ...(place ?? corner), width }, ending, standingZ);
    }
    const centre = cellCenterOf(grid, cell);
    return this.arrive(character, table, { centre, corner, grid, cell, ending, standingZ });
  }

  /**
   * Steps onto a cell of a grid, standing with its corner at a place in it rather than in the
   * middle of it: a cell of a square of several cells, on a table whose pieces keep to them. `at`
   * is where the corner goes and how wide the piece stands there.
   */
  async stepOnto(
    character: GameCharacter,
    table: GameTable,
    grid: CellGrid,
    cell: number,
    at: { readonly x: number; readonly y: number; readonly width: number },
    ending: boolean,
    standingZ: number = character.posZ
  ): Promise<number> {
    const corner = { x: at.x, y: at.y };
    const centre = { x: at.x + at.width / 2, y: at.y + at.width / 2 };
    return this.arrive(character, table, { centre, corner, grid, cell, ending, standingZ });
  }

  async stepToPoint(
    character: GameCharacter,
    table: GameTable,
    centre: CellPoint,
    ending: boolean,
    standingZ: number = character.posZ
  ): Promise<number> {
    const half = (Math.max(1, character.size) * table.gridSize) / 2;
    const corner = { x: centre.x - half, y: centre.y - half };
    const grid = moveGridOf(table);
    const cell = cellIndexAt(grid, centre.x, centre.y);
    return this.arrive(character, table, { centre, corner, grid, cell, ending, standingZ });
  }

  private async arrive(character: GameCharacter, table: GameTable, arrival: Arrival): Promise<number> {
    const { centre, corner, grid, cell, ending, standingZ } = arrival;
    const landing = landingHeightAt(table.terrains, table.gridSize, centre.x, centre.y, table.gridType);
    const from = { x: character.location.x, y: character.location.y, z: standingZ };
    const to = { x: corner.x, y: corner.y, z: landing };
    // Where the piece is going is written once, at the end of the step. Written before
    // the hop as well, every screen but this one saw the piece arrive, go back and cross
    // again, since the hop begins by winding it back to where it set out from.
    if (landing === standingZ) {
      character.location.x = to.x;
      character.location.y = to.y;
      character.posZ = to.z;
      character.update();
      await new Promise((rest) => setTimeout(rest, MOVE_STEP_MS));
    } else {
      await this.hop(character, from, to, table.gridSize);
    }
    // Sprung on arrival rather than once the walking is over, so what the ground does
    // happens where the piece is standing when it does it.
    if (cell >= 0) this.triggerFire.stepped(character, grid, cell, ending);
    return landing;
  }

  /**
   * Draws a piece leaving the ground and coming down again on the next cell.
   *
   * The way across is walked evenly and the height is arched over it, so a piece is over the
   * ledge before it is above it rather than climbing the face on the way past.
   */
  private async hop(character: GameCharacter, from: StepPoint, to: StepPoint, gridSize: number): Promise<void> {
    const lift = hopLiftFor(from.z, to.z, gridSize);
    for (let frame = 1; frame <= HOP_FRAMES; frame++) {
      const along = frame / HOP_FRAMES;
      character.location.x = from.x + (to.x - from.x) * along;
      character.location.y = from.y + (to.y - from.y) * along;
      character.posZ = hopHeightAt(along, from.z, to.z, lift);
      character.update();
      await new Promise((rest) => setTimeout(rest, HOP_FRAME_MS));
    }
    character.location.x = to.x;
    character.location.y = to.y;
    character.posZ = to.z;
    character.update();
  }
}
