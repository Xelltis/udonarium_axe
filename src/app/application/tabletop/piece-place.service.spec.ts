import { TestBed } from '@angular/core/testing';
import { PiecePlaceService } from '@axe/application/tabletop/piece-place.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { RangeArea } from '@axe/domain/tabletop/range';
import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('PiecePlaceService', () => {
  let made: GameCharacter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    made = GameCharacter.create('コマ', 1, '');
    made.location = { name: 'table', x: 0, y: 0 };
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function standOnSouthWall(piece: GameCharacter): void {
    const dims = { widthPx: 1000, depthPx: 1000, wallHeightPx: 500 };
    const pieces = TestBed.inject(TablePiecesService);
    const footOf = pieces.footOf.bind(pieces);
    vi.spyOn(pieces, 'footOf').mockImplementation((one) =>
      one === piece ? { surface: 'south-wall', x: 0, y: 0, height: 0 } : footOf(one)
    );
    vi.spyOn(TestBed.inject(TableSurfaceService), 'frameOf').mockImplementation((surface) =>
      surface === 'south-wall' ? surfaceFrame('south-wall', dims) : null
    );
  }

  it('reads a piece on the floor upright where it is said to stand, from its feet at its altitude', () => {
    made.altitude = 2;

    expect(TestBed.inject(PiecePlaceService).bodyAt(made, { x: 40, y: 60 })).toEqual({
      feet: { x: 40, y: 60, z: 100 },
      head: { x: 40, y: 60, z: 150 },
    });
  });

  it('reads a piece on a wall out from the wall where the wall stands in the room, whatever floor point is given', () => {
    standOnSouthWall(made);

    expect(TestBed.inject(PiecePlaceService).bodyAt(made, { x: 25, y: 25 })).toEqual({
      feet: { x: 975, y: 1000, z: 475 },
      head: { x: 975, y: 950, z: 475 },
    });
  });

  it('lays what is put for a piece on the floor at its middle and height, and for a piece on a wall on the floor under its feet', () => {
    made.posZ = 30;
    const place = TestBed.inject(PiecePlaceService);
    expect(place.floorPlaceOf(made)).toEqual({ x: 25, y: 25, z: 30 });
    expect(place.floorPlaceOf(made, { x: 70, y: 80 })).toEqual({ x: 70, y: 80, z: 30 });

    standOnSouthWall(made);
    expect(place.floorPlaceOf(made)).toEqual({ x: 975, y: 1000, z: 0 });
  });

  it('puts a range on the piece it follows where the piece lays it, a piece on a wall on the floor under its feet', () => {
    const range = RangeArea.create('円', 1, 2, 50);
    range.followingCharacterIdentifier = made.identifier;
    standOnSouthWall(made);

    TestBed.inject(PiecePlaceService).follow(range);

    expect([range.location.x, range.location.y]).toEqual([975, 1000]);
  });

  function sphereOffItsPiece(): RangeArea {
    const range = RangeArea.create('円', 1, 2, 50);
    range.type = 'CIRCLE';
    range.solidKind = 'sphere';
    range.followingCharacterIdentifier = made.identifier;
    range.casterOffset = { x: 2, y: 0 };
    range.altitude = 1;
    range.location = { name: 'table', x: 125, y: 25 };
    return range;
  }

  it('puts a range following a piece back on it once it comes to keep an offset or stops, as a sphere made flat', () => {
    const range = sphereOffItsPiece();

    TestBed.inject(PiecePlaceService).reshape(range, () => (range.solidKind = ''));

    expect([range.location.x, range.location.y, range.casterOffset.x, range.altitude]).toEqual([25, 25, 0, 0]);
  });

  it('keeps the offset and altitude of a sphere made a column, or of a range whose shape alone changes', () => {
    const range = sphereOffItsPiece();
    const place = TestBed.inject(PiecePlaceService);

    place.reshape(range, () => (range.solidKind = 'column'));
    place.reshape(range, () => (range.type = 'SQUARE'));

    expect([range.location.x, range.casterOffset.x, range.altitude]).toEqual([125, 2, 1]);
  });

  it('leaves a range following no piece where it is, whatever kind it becomes', () => {
    const range = sphereOffItsPiece();
    range.followingCharacterIdentifier = '';

    TestBed.inject(PiecePlaceService).reshape(range, () => (range.solidKind = ''));

    expect([range.location.x, range.casterOffset.x, range.altitude]).toEqual([125, 2, 1]);
  });

  it('puts a range back on the piece it follows, its offset and altitude let go', () => {
    const range = sphereOffItsPiece();

    TestBed.inject(PiecePlaceService).putBack(range);

    expect([range.location.x, range.location.y, range.casterOffset.x, range.altitude]).toEqual([25, 25, 0, 0]);
  });
});
