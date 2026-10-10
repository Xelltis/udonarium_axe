import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MoveRangeService, MoveRangeView } from '@axe/application/tabletop/move-range.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import {
  MOVE_RANGE_FILL,
  MOVE_RANGE_OTHERS_FILL,
  MOVE_WAY_OTHERS,
  MOVE_ZOC_FILL,
  TableMoveRangeOverlayComponent,
} from '@axe/features/tabletop/table-move-range-overlay/table-move-range-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

describe('TableMoveRangeOverlayComponent', () => {
  let fixture: ComponentFixture<TableMoveRangeOverlayComponent>;
  let filled: string[];
  let stroked: string[];
  /** What each canvas was handed, since the overlay draws the raised ground on one of its own. */
  let painted: Map<HTMLCanvasElement, { filled: string[]; stroked: string[] }>;

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
    painted = new Map();
    // happy-dom draws nothing, so the paths are shapes the canvas is merely handed.
    vi.stubGlobal(
      'Path2D',
      class {
        moveTo(): void {}
        lineTo(): void {}
        arc(): void {}
        closePath(): void {}
      }
    );
    const contexts = new Map<HTMLCanvasElement, object>();
    function contextFor(canvas: HTMLCanvasElement): object {
      const held = contexts.get(canvas);
      if (held) return held;
      const own = { filled: [] as string[], stroked: [] as string[] };
      painted.set(canvas, own);
      const context = {
        setTransform: () => undefined,
        clearRect: () => undefined,
        fill: () => {
          filled.push(String(context.fillStyle));
          own.filled.push(String(context.fillStyle));
        },
        stroke: () => {
          stroked.push(String(context.strokeStyle));
          own.stroked.push(String(context.strokeStyle));
        },
        setLineDash: () => undefined,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        lineJoin: '',
        lineCap: '',
      };
      contexts.set(canvas, context);
      return context;
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement): null {
      return contextFor(this) as unknown as null;
    });

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
    // Chosen outright: a table first read for is adopted then and there, and the writing that
    // takes would reach the overlay later as a change to the table.
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
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

  it('leaves out somebody walking a piece the fog keeps from this reader', () => {
    const table = tableOf();
    const piece = pieceAt(1, 1, 3);
    otherWalking(table.identifier, piece.identifier, [cellIndexOf(grid, 1, 1), cellIndexOf(grid, 2, 1)]);
    vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockReturnValue(false);

    fixture.detectChanges();

    expect(stroked).not.toContain(MOVE_WAY_OTHERS);
    expect(filled).not.toContain(MOVE_RANGE_OTHERS_FILL);
  });

  it('leaves out somebody walking on a table this reader is not looking at', () => {
    tableOf();
    const piece = pieceAt(1, 1, 3);
    otherWalking('another table', piece.identifier, [cellIndexOf(grid, 1, 1), cellIndexOf(grid, 2, 1)]);

    fixture.detectChanges();

    expect(stroked).not.toContain(MOVE_WAY_OTHERS);
    expect(filled).not.toContain(MOVE_RANGE_OTHERS_FILL);
  });

  it('draws the way anew while the reach under it is left as it was', async () => {
    const table = tableOf();
    const piece = pieceAt(1, 1, 3);
    const cursor = otherWalking(table.identifier, piece.identifier, [cellIndexOf(grid, 1, 1), cellIndexOf(grid, 2, 1)]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const overlay = fixture.componentInstance as unknown as { othersReach: () => unknown };
    const before = overlay.othersReach();
    stroked.length = 0;

    cursor.movingWay = [cellIndexOf(grid, 1, 1), cellIndexOf(grid, 2, 1), cellIndexOf(grid, 3, 1)].join(',');
    cursor.update();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(overlay.othersReach()).toBe(before);
    expect(stroked).toContain(MOVE_WAY_OTHERS);
  });

  it('paints the ground an enemy holds under the reach', () => {
    carry({
      characterIdentifier: 'piece',
      grid,
      cells: cellsAt(cellIndexOf(grid, 2, 2)),
      held: cellsAt(cellIndexOf(grid, 3, 3)),
      showsReach: true,
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
    });

    fixture.detectChanges();

    expect(filled).toEqual([MOVE_ZOC_FILL]);
  });

  describe('a piece standing on a block', () => {
    /** A block laid flat, high enough to stand on and gentle enough to be climbed. */
    function platformOn(table: GameTable, col: number, row: number, cells: number, height: number): Terrain {
      const terrain = Terrain.create('台', cells, cells, height, '', '');
      terrain.mode = TerrainViewState.FLOOR;
      terrain.location = { name: 'table', x: col * 50, y: row * 50 };
      table.appendChild(terrain);
      return terrain;
    }

    function canvases(): HTMLCanvasElement[] {
      return [...fixture.nativeElement.querySelectorAll('canvas')] as HTMLCanvasElement[];
    }

    it('draws the part of the reach that lies on the blocks on top of them', async () => {
      const table = tableOf();
      platformOn(table, 0, 0, 3, 1);
      carry({
        characterIdentifier: 'piece',
        grid,
        cells: cellsAt(cellIndexOf(grid, 1, 1), cellIndexOf(grid, 2, 2)),
        held: null,
        showsReach: true,
      });

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const [floor, raised] = canvases();
      expect(raised).toBeDefined();
      expect(raised.style.transform).toBe(`translateZ(${50 + Z_OFFSET_RANGE_PX}px)`);
      expect(painted.get(raised)?.filled).toContain(MOVE_RANGE_FILL);
      expect(painted.get(floor)?.filled ?? []).toEqual([]);
    });

    it('leaves the part of the reach that lies on the table where it is', async () => {
      const table = tableOf();
      platformOn(table, 0, 0, 3, 1);
      carry({
        characterIdentifier: 'piece',
        grid,
        cells: cellsAt(cellIndexOf(grid, 1, 1), cellIndexOf(grid, 4, 4)),
        held: null,
        showsReach: true,
      });

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const [floor, raised] = canvases();
      expect(painted.get(raised)?.filled).toContain(MOVE_RANGE_FILL);
      expect(painted.get(floor)?.filled).toContain(MOVE_RANGE_FILL);
    });

    it('gives each height of ground the reach touches a layer of its own', async () => {
      const table = tableOf();
      platformOn(table, 0, 0, 3, 1);
      platformOn(table, 4, 4, 2, 0.5);
      carry({
        characterIdentifier: 'piece',
        grid,
        cells: cellsAt(cellIndexOf(grid, 1, 1), cellIndexOf(grid, 4, 4), cellIndexOf(grid, 3, 0)),
        held: null,
        showsReach: true,
      });

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const drawn = canvases();
      expect(drawn.map((canvas) => canvas.style.transform)).toEqual([
        `translateZ(${Z_OFFSET_RANGE_PX}px)`,
        `translateZ(${25 + Z_OFFSET_RANGE_PX}px)`,
        `translateZ(${50 + Z_OFFSET_RANGE_PX}px)`,
      ]);
      for (const canvas of drawn) expect(painted.get(canvas)?.filled).toContain(MOVE_RANGE_FILL);
    });

    it('keeps to the table where nothing of the reach is up on the blocks', async () => {
      const table = tableOf();
      platformOn(table, 0, 0, 3, 1);
      carry({
        characterIdentifier: 'piece',
        grid,
        cells: cellsAt(cellIndexOf(grid, 4, 4)),
        held: null,
        showsReach: true,
      });

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(canvases().length).toBe(1);
      expect(painted.get(canvases()[0])?.filled).toContain(MOVE_RANGE_FILL);
    });
  });

  it('paints the reach alone where no enemy holds any', () => {
    carry({
      characterIdentifier: 'piece',
      grid,
      cells: cellsAt(cellIndexOf(grid, 2, 2)),
      held: null,
      showsReach: true,
    });

    fixture.detectChanges();

    expect(filled).toEqual([MOVE_RANGE_FILL]);
  });
});
