import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PiecePlaceService } from '@axe/application/tabletop/piece-place.service';
import { SolidRangeService } from '@axe/application/tabletop/solid-range.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { pieceCentreOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { RangeArea } from '@axe/domain/tabletop/range';
import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('SolidRangeService', () => {
  let service: SolidRangeService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    service = TestBed.inject(SolidRangeService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function caster(col: number, row: number): GameCharacter {
    const piece = GameCharacter.create('caster', 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    return piece;
  }

  function solidRange(type: string, kind: RangeArea['solidKind'], following?: GameCharacter): RangeArea {
    const range = RangeArea.create('range', 1, 2, 100);
    range.type = type;
    range.solidKind = kind;
    range.reachSquares = 4;
    table.appendChild(range);
    if (following) {
      range.followingCharacterIdentifier = following.identifier;
      range.following(GRID, (piece) => pieceCentreOf(piece, GRID));
    }
    return range;
  }

  function changed(...objects: { identifier: string }[]): void {
    const change = TestBed.inject(ObjectChangeService);
    for (const object of objects) change.notifyChanged(object.identifier);
  }

  it('stands a range up only once it is set to, and draws it as the solid it is', () => {
    const range = solidRange('CIRCLE', '');
    expect(service.solids()).toEqual([]);

    range.solidKind = 'sphere';
    changed(range);

    expect(service.solids()).toMatchObject([{ owner: range.identifier, solid: { kind: 'sphere', radius: 2 * GRID } }]);
  });

  it('shows the room round the caster only while this seat holds the range', () => {
    const piece = caster(5, 5);
    const range = solidRange('CIRCLE', 'sphere', piece);
    expect(service.guides()).toEqual([]);

    TestBed.inject(TransientPlacementService).place(range.identifier, { surface: 'floor', x: 400, y: 275, z: 0 });

    expect(service.guides()).toHaveLength(1);
    TestBed.inject(TransientPlacementService).release(range.identifier);
    expect(service.guides()).toEqual([]);
  });

  it('keeps a sphere let go past its reach at the edge of the room round its caster', () => {
    const piece = caster(5, 5);
    const range = solidRange('CIRCLE', 'sphere', piece);
    range.location = { name: 'table', x: 275 + 10 * GRID, y: 275 };
    changed(range);

    service.settleRoundCaster(range);

    expect(range.casterOffset).toEqual({ x: 4, y: 0 });
    expect(range.location.x).toBeCloseTo(275 + 4 * GRID);
    piece.location = { name: 'table', x: 0, y: 0 };
    range.following(GRID, (piece) => pieceCentreOf(piece, GRID));
    expect([range.location.x, range.location.y]).toEqual([25 + 4 * GRID, 25]);
  });

  it('starts a cone following a piece on a wall from the middle of its body where it stands out from the wall', () => {
    const piece = caster(0, 0);
    const pieces = TestBed.inject(TablePiecesService);
    const footOf = pieces.footOf.bind(pieces);
    vi.spyOn(pieces, 'footOf').mockImplementation((one) =>
      one === piece ? { surface: 'south-wall', x: 0, y: 0, height: 0 } : footOf(one)
    );
    vi.spyOn(TestBed.inject(TableSurfaceService), 'frameOf').mockImplementation((surface) =>
      surface === 'south-wall' ? surfaceFrame('south-wall', { widthPx: 1000, depthPx: 1000, wallHeightPx: 500 }) : null
    );
    const range = solidRange('CORN', 'cone');
    range.followingCharacterIdentifier = piece.identifier;
    TestBed.inject(PiecePlaceService).follow(range);
    changed(range);

    expect(service.placedOf(range.identifier)?.origin).toEqual({ x: 975, y: 975, z: 475 });
  });

  it('keeps a sphere let go round a piece on a wall where it was let go as the piece is put back on', () => {
    const piece = caster(0, 0);
    const pieces = TestBed.inject(TablePiecesService);
    const footOf = pieces.footOf.bind(pieces);
    vi.spyOn(pieces, 'footOf').mockImplementation((one) =>
      one === piece ? { surface: 'south-wall', x: 0, y: 0, height: 0 } : footOf(one)
    );
    vi.spyOn(TestBed.inject(TableSurfaceService), 'frameOf').mockImplementation((surface) =>
      surface === 'south-wall' ? surfaceFrame('south-wall', { widthPx: 1000, depthPx: 1000, wallHeightPx: 500 }) : null
    );
    const place = TestBed.inject(PiecePlaceService);
    const range = solidRange('CIRCLE', 'sphere');
    range.followingCharacterIdentifier = piece.identifier;
    place.follow(range);
    expect([range.location.x, range.location.y]).toEqual([975, 975]);

    range.location = { name: 'table', x: 975, y: 900 };
    changed(range);
    service.settleRoundCaster(range);
    place.follow(range);

    expect([range.location.x, range.location.y]).toEqual([975, 900]);
  });

  it('draws a cone held by its tip the way it is pointed, and writes the way only once let go', () => {
    const piece = caster(5, 5);
    const range = solidRange('CORN', 'cone', piece);

    service.holdAim(range.identifier, { yaw: 90, pitch: 30 });

    const held = service.placedOf(range.identifier)!.solid;
    expect(held.kind === 'cone' && held.frame.way.z).toBeCloseTo(0.5);
    expect(range.aimPitch).toBe(0);
    expect(service.guides()).toHaveLength(1);

    service.letGoAim(range.identifier);

    expect(range.rotate).toBe(90);
    expect(range.aimPitch).toBe(30);
    expect(service.guides()).toEqual([]);
  });

  it('forgets the way a cone was pointed when it is dropped rather than let go', () => {
    const range = solidRange('CORN', 'cone');
    range.rotate = 10;

    service.holdAim(range.identifier, { yaw: 200, pitch: -20 });
    service.dropAim(range.identifier);

    expect(range.rotate).toBe(10);
    expect(range.aimPitch).toBe(0);
  });

  it('starts a cone following a piece from the middle of its body', () => {
    const piece = caster(5, 5);
    const range = solidRange('CORN', 'cone', piece);

    expect(service.placedOf(range.identifier)?.origin).toEqual({ x: 275, y: 275, z: GRID / 2 });
  });

  it('gives a press on a solid to the range, by the shape it is drawn with', () => {
    const range = solidRange('HEXAGON', 'column');

    expect(service.pickTargets()).toMatchObject([
      { id: range.identifier, layer: 'range', shapes: [{ kind: 'solid', solid: { kind: 'column' } }] },
    ]);
  });
});
