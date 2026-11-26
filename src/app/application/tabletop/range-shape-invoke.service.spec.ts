import { TestBed } from '@angular/core/testing';
import { RangeShapeInvokeService } from '@axe/application/tabletop/range-shape-invoke.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { RangeShapeFieldValue } from '@axe/domain/data/range-shape-field';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { RangeArea } from '@axe/domain/tabletop/range';
import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RangeShapeInvokeService', () => {
  let service: RangeShapeInvokeService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(RangeShapeInvokeService);
  });

  function makeField(overrides: Partial<RangeShapeFieldValue> = {}): RangeShapeFieldValue {
    return {
      name: '攻撃',
      cellPattern: '0,0;1,0;0,1',
      gridType: 'square',
      gridColor: '#FF0000',
      rangeColor: '#00FF00',
      isRotatable: false,
      ...overrides,
    };
  }

  it('spawns a custom range area', () => {
    const tabletopService = TestBed.inject(TabletopService);
    const table = new GameTable();
    Object.defineProperty(tabletopService, 'currentTable', { get: () => table });

    const range = service.spawnAt({ x: 100, y: 200, z: 0 }, makeField());

    expect(range).toBeInstanceOf(RangeArea);
    expect(range.type).toBe('CUSTOM');
    expect(range.cellPattern).toBe('0,0;1,0;0,1');
    expect(range.customGridType).toBe('square');
    expect(range.gridColor).toBe('#FF0000');
    expect(range.rangeColor).toBe('#00FF00');
    expect(range.location.x).toBe(100);
    expect(range.location.y).toBe(200);
    expect(range.isRotatable).toBe(false);
  });

  it('carries the rotatable flag through to the area', () => {
    const tabletopService = TestBed.inject(TabletopService);
    const table = new GameTable();
    Object.defineProperty(tabletopService, 'currentTable', { get: () => table });

    const range = service.spawnAt({ x: 0, y: 0, z: 0 }, makeField({ isRotatable: true }));
    expect(range.isRotatable).toBe(true);
  });

  it('spawns on the centre of the character', () => {
    const tabletopService = TestBed.inject(TabletopService);
    const table = new GameTable();
    Object.defineProperty(tabletopService, 'currentTable', { get: () => table });

    const character = GameCharacter.create('テスト', 2, '');
    character.location.x = 300;
    character.location.y = 400;

    const range = service.spawnForCharacter(character, makeField());
    expect(range.location.x).toBe(300 + (2 * 50) / 2);
    expect(range.location.y).toBe(400 + (2 * 50) / 2);
  });

  it('spawns on the floor under the feet of a character on a wall', () => {
    const tabletopService = TestBed.inject(TabletopService);
    const table = new GameTable();
    Object.defineProperty(tabletopService, 'currentTable', { get: () => table });
    const character = GameCharacter.create('壁', 1, '');
    character.location.x = 0;
    character.location.y = 0;
    const pieces = TestBed.inject(TablePiecesService);
    const footOf = pieces.footOf.bind(pieces);
    vi.spyOn(pieces, 'footOf').mockImplementation((one) =>
      one === character ? { surface: 'south-wall', x: 0, y: 0, height: 0 } : footOf(one)
    );
    vi.spyOn(TestBed.inject(TableSurfaceService), 'frameOf').mockImplementation((surface) =>
      surface === 'south-wall' ? surfaceFrame('south-wall', { widthPx: 1000, depthPx: 1000, wallHeightPx: 500 }) : null
    );

    const range = service.spawnForCharacter(character, makeField());

    expect([range.location.x, range.location.y, range.posZ]).toEqual([975, 1000, 0]);
  });
});
