import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MoveRangeService, MoveRangeView } from '@axe/application/tabletop/move-range.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import {
  MOVE_RANGE_FILL,
  MOVE_RANGE_OTHERS_FILL,
  MOVE_WAY_OTHERS,
  MOVE_ZOC_FILL,
  TableMoveRangeOverlayComponent,
} from '@axe/features/tabletop/table-move-range-overlay/table-move-range-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableMoveRangeOverlayComponent', () => {
  let fixture: ComponentFixture<TableMoveRangeOverlayComponent>;
  let filled: string[];
  let stroked: string[];

  const grid = cellGridOf(6, 6, 50, GridType.SQUARE);

  function cellsAt(...indexes: number[]): CellBits {
    const bits = new CellBits(grid.cols * grid.rows);
    for (const index of indexes) bits.set(index);
    return bits;
  }

  /** What the service holds while a piece is carried, which is what the overlay draws. */
  function carry(view: MoveRangeView): void {
    (TestBed.inject(MoveRangeService) as unknown as { held: WritableSignal<MoveRangeView | null> }).held.set(view);
  }

  beforeEach(() => {
    filled = [];
    stroked = [];
    // happy-dom draws nothing, so the paths are shapes the canvas is merely handed.
    vi.stubGlobal(
      'Path2D',
      class {
        moveTo(): void {}
        lineTo(): void {}
        closePath(): void {}
      }
    );
    const context = {
      setTransform: () => undefined,
      clearRect: () => undefined,
      fill: () => filled.push(String(context.fillStyle)),
      stroke: () => stroked.push(String(context.strokeStyle)),
      setLineDash: () => undefined,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineJoin: '',
      lineCap: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as null);

    TestBed.configureTestingModule({ imports: [TableMoveRangeOverlayComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(TableMoveRangeOverlayComponent);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A table for the peers to be moving on, since a cell number means nothing without one. */
  function tableOf(): GameTable {
    const table = new GameTable();
    table.width = 6;
    table.height = 6;
    table.gridSize = 50;
    table.initialize();
    return table;
  }

  /** A piece somebody else could be walking, with a move written on its sheet. */
  function pieceAt(col: number, row: number, walk: number): GameCharacter {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.location = { name: 'table', x: col * 50, y: row * 50 };
    DataElement.findElementByReference(piece.rootDataElement!, '移動')!.value = walk;
    return piece;
  }

  /** Somebody else, part way through a move the whole room is meant to watch. */
  function otherWalking(on: string, piece: string, way: readonly number[]): PeerCursor {
    const cursor = new PeerCursor();
    cursor.peerId = 'them';
    cursor.movingCharacterIdentifier = piece;
    cursor.movingTableIdentifier = on;
    cursor.movingWay = way.join(',');
    cursor.initialize();
    return cursor;
  }

  it('draws the way somebody else is walking, so the room watches the move being made', () => {
    const table = tableOf();
    const piece = pieceAt(1, 1, 3);
    otherWalking(table.identifier, piece.identifier, [cellIndexOf(grid, 1, 1), cellIndexOf(grid, 2, 1)]);

    fixture.detectChanges();

    expect(stroked).toContain(MOVE_WAY_OTHERS);
  });

  it('draws the reach of the piece somebody else has picked, before any of it is walked', () => {
    const table = tableOf();
    const piece = pieceAt(1, 1, 3);
    otherWalking(table.identifier, piece.identifier, []);

    fixture.detectChanges();

    expect(filled).toContain(MOVE_RANGE_OTHERS_FILL);
  });

  it('leaves out somebody walking on a table this reader is not looking at', () => {
    tableOf();
    const piece = pieceAt(1, 1, 3);
    otherWalking('another table', piece.identifier, [cellIndexOf(grid, 1, 1), cellIndexOf(grid, 2, 1)]);

    fixture.detectChanges();

    expect(stroked).not.toContain(MOVE_WAY_OTHERS);
    expect(filled).not.toContain(MOVE_RANGE_OTHERS_FILL);
  });

  it('paints the ground an enemy holds under the reach', () => {
    carry({
      characterIdentifier: 'piece',
      grid,
      cells: cellsAt(cellIndexOf(grid, 2, 2)),
      held: cellsAt(cellIndexOf(grid, 3, 3)),
      showsReach: true,
      route: [],
    });

    fixture.detectChanges();

    expect(filled).toEqual([MOVE_ZOC_FILL, MOVE_RANGE_FILL]);
  });

  it('paints the held ground alone where the reach is not to be shown', () => {
    carry({
      characterIdentifier: 'piece',
      grid,
      cells: cellsAt(cellIndexOf(grid, 2, 2)),
      held: cellsAt(cellIndexOf(grid, 3, 3)),
      showsReach: false,
      route: [],
    });

    fixture.detectChanges();

    expect(filled).toEqual([MOVE_ZOC_FILL]);
  });

  it('paints the reach alone where no enemy holds any', () => {
    carry({
      characterIdentifier: 'piece',
      grid,
      cells: cellsAt(cellIndexOf(grid, 2, 2)),
      held: null,
      showsReach: true,
      route: [],
    });

    fixture.detectChanges();

    expect(filled).toEqual([MOVE_RANGE_FILL]);
  });
});
