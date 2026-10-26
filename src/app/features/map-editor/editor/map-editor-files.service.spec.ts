import { TestBed } from '@angular/core/testing';
import { FunctionalPaintService } from '@axe/application/tabletop/functional-paint.service';
import { createScene } from '@axe/domain/map-editor/scene';
import { serializeScene } from '@axe/domain/map-editor/serialize';
import { TableSnapshot } from '@axe/domain/map-editor/table-import';
import { GridType } from '@axe/domain/tabletop/game-table';
import { MapEditorFilesService } from '@axe/features/map-editor/editor/map-editor-files.service';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MapEditorFilesService', () => {
  let files: MapEditorFilesService;
  let state: MapEditorState;
  let paint: FunctionalPaintService;

  function table(over: Partial<TableSnapshot> = {}): TableSnapshot {
    return {
      cols: 10,
      rows: 8,
      cellPx: 50,
      gridType: GridType.SQUARE,
      floorImageIdentifier: '',
      blockedCells: [],
      terrainBlocks: [],
      maskBlocks: [],
      moveCostBlocks: [],
      ambienceBlocks: [],
      triggerBlocks: [],
      ...over,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS, MapEditorState, MapEditorFilesService] });
    files = TestBed.inject(MapEditorFilesService);
    state = TestBed.inject(MapEditorState);
    paint = TestBed.inject(FunctionalPaintService);
    state.newScene(10, 8, 50, 'transparent');
  });

  afterEach(() => vi.restoreAllMocks());

  it('opens a scene kept as bare JSON, and refuses a file that holds none', async () => {
    expect(await files.open(new Blob([serializeScene(createScene(7, 6, 48))]))).toBe(true);
    expect(state.current.cols).toBe(7);

    expect(await files.open(new Blob(['not a scene']))).toBe(false);
    expect(state.current.cols).toBe(7);
  });

  it('brings in the table that is out only once the user agrees', async () => {
    vi.spyOn(paint, 'snapshot').mockReturnValue(table({ cols: 12 }));

    expect(await files.bringInTable(() => Promise.resolve(false))).toBe('declined');
    expect(state.current.cols).toBe(10);

    expect(await files.bringInTable(() => Promise.resolve(true))).toBe('done');
    expect(state.current.cols).toBe(12);
  });

  it('says so where there is no table to bring in or lay what was painted on', async () => {
    vi.spyOn(paint, 'snapshot').mockReturnValue(null);

    expect(await files.bringInTable(() => Promise.resolve(true))).toBe('noTable');
    expect(files.applyFunctions()).toBe('noTable');
  });

  it('lays nothing painted on a table of another size or grid', () => {
    vi.spyOn(paint, 'snapshot').mockReturnValue(table({ cols: 12 }));
    const apply = vi.spyOn(paint, 'apply');

    expect(files.applyFunctions()).toBe('gridMismatch');
    expect(apply).not.toHaveBeenCalled();
  });
});
