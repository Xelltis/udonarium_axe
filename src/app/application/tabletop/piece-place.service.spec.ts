import { TestBed } from '@angular/core/testing';
import { PiecePlaceService } from '@axe/application/tabletop/piece-place.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { GameCharacter } from '@axe/domain/character/game-character';
import { RangeArea } from '@axe/domain/tabletop/range';
import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { whiteBoardFrame } from '@axe/domain/tabletop/white-board-frame';
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
    const surfaceOf = pieces.surfaceOf.bind(pieces);
    vi.spyOn(pieces, 'surfaceOf').mockImplementation((one) => (one === piece ? 'south-wall' : surfaceOf(one)));
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

  it('leaves a range following no piece where it is, letting its offset go as it comes to keep one or stops', () => {
    const place = TestBed.inject(PiecePlaceService);
    const range = sphereOffItsPiece();
    range.followingCharacterIdentifier = '';

    place.reshape(range, () => (range.solidKind = 'column'));
    expect([range.location.x, range.casterOffset.x, range.altitude]).toEqual([125, 2, 1]);

    place.reshape(range, () => (range.solidKind = ''));
    expect([range.location.x, range.casterOffset.x, range.altitude]).toEqual([125, 0, 1]);

    range.casterOffset = { x: 3, y: 0 };
    place.reshape(range, () => (range.solidKind = 'sphere'));
    expect([range.location.x, range.casterOffset.x, range.altitude]).toEqual([125, 0, 1]);
  });

  it('puts a range back on the piece it follows, its offset and altitude let go', () => {
    const range = sphereOffItsPiece();

    TestBed.inject(PiecePlaceService).putBack(range);

    expect([range.location.x, range.location.y, range.casterOffset.x, range.altitude]).toEqual([25, 25, 0, 0]);
  });

  it('stands in for a piece on a wall by an upright body round the middle of its own, and for none on the floor', () => {
    const place = TestBed.inject(PiecePlaceService);
    expect(place.standInOf(made)).toBeNull();

    standOnSouthWall(made);
    expect(place.standInOf(made)).toEqual({ x: 975, y: 975, footZ: 450, groundZ: 0 });
  });

  it('reads where a piece stands for what is cast at it: its middle on the floor, one cell across with no size, the feet of its stand-in on a wall', () => {
    const place = TestBed.inject(PiecePlaceService);
    made.size = 0;
    made.posZ = 30;
    expect(place.standingCentreOf(made)).toEqual({ x: 25, y: 25, z: 30 });

    made.size = 1;
    standOnSouthWall(made);
    expect(place.standingCentreOf(made)).toEqual({ x: 975, y: 975, z: 450 });
  });

  it('lays what goes by a corner at the piece’s corner on the floor, and round the floor under its feet on a wall', () => {
    const place = TestBed.inject(PiecePlaceService);
    made.posZ = 30;
    expect(place.floorCornerOf(made)).toEqual({ x: 0, y: 0, z: 30 });

    standOnSouthWall(made);
    expect(place.floorCornerOf(made)).toEqual({ x: 950, y: 975, z: 0 });
  });

  it('drapes a range laid for a piece on a wall over raised ground, and stands what goes by the room on a block there', () => {
    const place = TestBed.inject(PiecePlaceService);
    standOnSouthWall(made);
    vi.spyOn(TestBed.inject(StandingGroundService), 'heightPxAt').mockReturnValue(40);
    vi.spyOn(TestBed.inject(TablePiecesService), 'landingPxAt').mockReturnValue(40);

    expect(place.floorPlaceOf(made)).toEqual({ x: 975, y: 1000, z: 0 });
    expect(place.floorCornerOf(made)).toEqual({ x: 950, y: 975, z: 0 });
    expect(place.floorPointOf(made)).toEqual({ x: 975, y: 1000, z: 40 });
    expect(place.fieldCornerOf(made)).toEqual({ x: 950, y: 975, z: 40 });
    expect(place.standInOf(made)).toEqual({ x: 975, y: 975, footZ: 450, groundZ: 40 });
  });

  it('reads the ground under a piece on a wall one way, below the feet of the body standing in for it, wherever it is read', () => {
    const place = TestBed.inject(PiecePlaceService);
    standOnSouthWall(made);
    const landing = vi
      .spyOn(TestBed.inject(TablePiecesService), 'landingPxAt')
      .mockImplementation((_x, _y, below) => Math.min(460, below));

    expect(place.floorPointOf(made).z).toBe(450);
    expect(place.standInOf(made)?.groundZ).toBe(450);
    expect(landing).toHaveBeenCalledWith(975, 1000, 450);
    expect(landing).toHaveBeenCalledWith(975, 975, 450);
    expect(landing).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 475);
  });

  it('stands what goes by the room for a piece on a board lying up high on the board, over the ground under it', () => {
    const place = TestBed.inject(PiecePlaceService);
    const board = { width: 4, height: 4, pitch: 0, rotate: 0, posZ: 200, location: { x: 100, y: 100 } };
    const frame = whiteBoardFrame(board, 50);
    const pieces = TestBed.inject(TablePiecesService);
    const footOf = pieces.footOf.bind(pieces);
    vi.spyOn(pieces, 'footOf').mockImplementation((one) =>
      one === made ? { surface: 'board-1', x: 50, y: 50, height: 0 } : footOf(one)
    );
    const surfaceOf = pieces.surfaceOf.bind(pieces);
    vi.spyOn(pieces, 'surfaceOf').mockImplementation((one) => (one === made ? 'board-1' : surfaceOf(one)));
    const surfaces = TestBed.inject(TableSurfaceService);
    vi.spyOn(surfaces, 'frameOf').mockImplementation((surface) => (surface === 'board-1' ? frame : null));
    vi.spyOn(surfaces, 'sizeOf').mockImplementation((surface) =>
      surface === 'board-1' ? { width: 200, height: 200 } : null
    );
    vi.spyOn(pieces, 'landingPxAt').mockReturnValue(0);

    expect(place.floorPointOf(made)).toEqual({ x: 175, y: 175, z: frame.origin.z });
    expect(place.fieldCornerOf(made)).toEqual({ x: 150, y: 150, z: frame.origin.z });
    expect(place.standInOf(made)).toEqual({ x: 175, y: 175, footZ: frame.origin.z, groundZ: frame.origin.z });
  });

  it('keeps a range laid for a piece on the floor at its height, and stands what goes by the room where its feet stand', () => {
    const place = TestBed.inject(PiecePlaceService);
    const pieces = TestBed.inject(TablePiecesService);
    vi.spyOn(pieces, 'footOf').mockReturnValue({ surface: 'floor', x: 300, y: 400, height: 70 });

    expect(place.floorPlaceOf(made)).toEqual({ x: 25, y: 25, z: 0 });
    expect(place.floorCornerOf(made)).toEqual({ x: 0, y: 0, z: 0 });
    expect(place.floorPointOf(made)).toEqual({ x: 325, y: 425, z: 70 });
    expect(place.fieldCornerOf(made)).toEqual({ x: 300, y: 400, z: 70 });
    expect(place.standingCentreOf(made)).toEqual({ x: 325, y: 425, z: 70 });
  });

  it('meets a card at the middle of its picture as the table draws it, and anything but a piece as a card', () => {
    const place = TestBed.inject(PiecePlaceService);
    const card = Card.create('カード', '', '', 2);
    const lying = vi
      .spyOn(TestBed.inject(TablePiecesService), 'lyingMiddleOf')
      .mockReturnValue({ x: 150, y: 175, z: 11 });

    expect(place.faceCentreOf(card)).toEqual({ x: 150, y: 175, z: 11 });
    expect(place.standingCentreOf(card)).toEqual({ x: 150, y: 175, z: 11 });
    expect(lying).toHaveBeenCalledWith(card);
    card.destroy();
  });

  it('meets a card with no picture at its middle on the face it lies on, the table or a wall', () => {
    const place = TestBed.inject(PiecePlaceService);
    const card = Card.create('カード', '', '', 2);
    card.location = { name: 'table', x: 100, y: 100 };
    card.posZ = 10;
    expect(place.faceCentreOf(card)).toEqual({ x: 150, y: 150, z: 10 });

    card.location = { name: 'table', x: 0, y: 0 };
    standOnSouthWall(card as unknown as GameCharacter);
    expect(place.faceCentreOf(card)).toEqual({ x: 950, y: 1000, z: 450 });
    card.destroy();
  });
});
