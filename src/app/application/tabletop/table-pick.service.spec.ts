import { TestBed } from '@angular/core/testing';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { BoardSwitch } from '@axe/domain/tabletop/board-switch/board-switch';
import { DEFAULT_TABLE_CAMERA_VIEW, pageOfTablePoint, TableLayout } from '@axe/domain/tabletop/camera/table-camera';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { TerrainFogCover } from '@axe/domain/tabletop/terrain-cover';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GRID = 50;
const layout: TableLayout = { left: 0, top: 0, width: 1280, height: 800, boardWidth: 1000, boardHeight: 1000 };

describe('TablePickService', () => {
  let service: TablePickService;
  let camera: TableCameraService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    camera = TestBed.inject(TableCameraService);
    camera.setLayout(layout);
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    service = TestBed.inject(TablePickService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function blockAt(col: number, row: number, height = 2): Terrain {
    const terrain = Terrain.create('block', 1, 1, height, '', '');
    terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
    table.appendChild(terrain);
    return terrain;
  }

  /** Where the middle of a cell's top is drawn on the page. */
  function onPage(col: number, row: number, z: number): { x: number; y: number } {
    return pageOfTablePoint(camera.sceneMatrix()!, (col + 0.5) * GRID, (row + 0.5) * GRID, z);
  }

  async function settled(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('lands on the block drawn at a point of the page, and on nothing beside it', async () => {
    const block = blockAt(5, 5);
    await settled();
    const top = onPage(5, 5, 2 * GRID);
    expect(service.pickAt(top.x, top.y)?.target.id).toBe(block.identifier);
    const bare = onPage(12, 12, 0);
    expect(service.pickAt(bare.x, bare.y)).toBeNull();
  });

  it('puts the nearer of two blocks on one line of sight first', async () => {
    const near = blockAt(5, 6, 6);
    const far = blockAt(5, 5, 1);
    await settled();
    // The camera looks from the south, so a tall block just south of a low one hides it.
    const hidden = onPage(5, 5, GRID);
    expect(service.allAt(hidden.x, hidden.y).map((hit) => hit.target.id)).toEqual([near.identifier, far.identifier]);
  });

  it('makes the targets of the blocks named alone, as it makes them all', async () => {
    const named = blockAt(2, 3);
    blockAt(5, 5);
    await settled();

    const all = service.targets();
    const some = service.targetsOf(new Set([named.identifier, 'not-a-block']));

    expect(some).toEqual([all.find((target) => target.id === named.identifier)]);
  });

  it('builds a block over again once it has moved', async () => {
    const block = blockAt(5, 5);
    await settled();
    const first = service.targets()[0];
    expect(service.targets()[0]).toBe(first);

    block.location = { name: 'table', x: 8 * GRID, y: 5 * GRID };
    await settled();
    expect(service.targets()[0]).not.toBe(first);
    const top = onPage(8, 5, 2 * GRID);
    expect(service.pickAt(top.x, top.y)?.target.id).toBe(block.identifier);
  });

  it('leaves out a block the fog lies over entirely', async () => {
    const block = blockAt(5, 5);
    await settled();
    const cover: TerrainFogCover = { cols: 1, rows: 1, cleared: [false] } as unknown as TerrainFogCover;
    vi.spyOn(TestBed.inject(VisionService), 'terrainFogCover').mockReturnValue(cover);
    const top = onPage(5, 5, 2 * GRID);
    expect(service.pickAt(top.x, top.y)).toBeNull();
    expect(block.identifier).toBeTruthy();
  });

  it('has nothing to say before the table has a camera', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    expect(TestBed.inject(TablePickService).pickAt(100, 100)).toBeNull();
    expect(TestBed.inject(TablePickService).faceAt(100, 100)).toBeNull();
  });

  function boardAt(x: number, y: number, pitch = 0, rotate = 0): WhiteBoard {
    const board = new WhiteBoard();
    board.initialize();
    board.width = 8;
    board.height = 4;
    board.location = { name: 'table', x, y };
    board.pitch = pitch;
    board.rotate = rotate;
    table.appendChild(board);
    return board;
  }

  describe('where a point lands', () => {
    it('is on top of the block the line of sight meets, and on the floor beside it', async () => {
      blockAt(5, 5);
      await settled();
      const top = onPage(5, 5, 2 * GRID);
      const onTop = service.landingAt(top.x, top.y);
      expect(onTop.x).toBeCloseTo(5.5 * GRID, 6);
      expect(onTop.y).toBeCloseTo(5.5 * GRID, 6);
      expect(onTop.z).toBeCloseTo(2 * GRID, 6);

      const bare = onPage(12, 12, 0);
      expect(service.landingAt(bare.x, bare.y)).toMatchObject({ z: 0 });
      expect(service.landingAt(bare.x, bare.y).x).toBeCloseTo(12.5 * GRID, 6);
    });

    it('is on the floor’s plane beyond the edge of the table', () => {
      const beyond = pageOfTablePoint(camera.sceneMatrix()!, -300, 400, 0);
      const landed = service.landingAt(beyond.x, beyond.y);
      expect(landed.x).toBeCloseTo(-300, 6);
      expect(landed.y).toBeCloseTo(400, 6);
      expect(landed.z).toBe(0);
    });

    it('is on a board stood up where the board draws the point', async () => {
      const board = boardAt(300, 200, 90);
      await settled();
      const surfaces = TestBed.inject(TableSurfaceService);
      // Well up the board, clear of its foot on the floor.
      const onPage = surfaces.pageOf(board.identifier, 100, 50)!;
      const landed = service.landingAt(onPage.x, onPage.y);
      const expected = surfaces.boardPointOf(board.identifier, 100, 50)!;
      expect(expected.z).toBeGreaterThan(50);
      expect(landed.x).toBeCloseTo(expected.x, 6);
      expect(landed.y).toBeCloseTo(expected.y, 6);
      expect(landed.z).toBeCloseTo(expected.z, 6);
    });

    it('takes the point of the page as the point of the floor before the table has a camera', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
      expect(TestBed.inject(TablePickService).landingAt(40, 50)).toEqual({ x: 40, y: 50, z: 0 });
    });
  });

  describe('the face a point lands on', () => {
    it('is the floor where nothing else is', async () => {
      await settled();
      const bare = onPage(12, 12, 0);
      expect(service.faceAt(bare.x, bare.y)).toBe('floor');
    });

    it('is a board lying on the floor, over the floor it lies on', async () => {
      const board = boardAt(100, 100);
      await settled();
      const over = onPage(4, 3, 0);
      expect(service.faceAt(over.x, over.y)).toBe(board.identifier);
    });

    it('is a wall only once the wall is drawn with a picture', async () => {
      table.showNorthWall = true;
      table.northWallImageIdentifier = 'north-picture';
      await settled();
      const onWall = TestBed.inject(TableSurfaceService).pageOf('north-wall', 500, 20)!;
      expect(service.faceAt(onWall.x, onWall.y)).not.toBe('north-wall');

      const picture = { isEmpty: false, url: 'blob:north-picture' } as unknown as ImageFile;
      vi.spyOn(TestBed.inject(ImageService), 'getEmptyOr').mockReturnValue(picture);
      expect(service.faceAt(onWall.x, onWall.y)).toBe('north-wall');
    });

    it('is the face what stands in the way stands on, once the line of sight stops at it', async () => {
      // A block on the floor stands over a board lying there: past the block the line of sight
      // reaches the board.
      boardAt(0, 0).height = 8;
      blockAt(4, 3, 2);
      await settled();
      const top = onPage(4, 3, 2 * GRID);
      expect(service.faceAt(top.x, top.y, { stopsAt: () => true })).toBe('floor');
      expect(service.faceAt(top.x, top.y)).not.toBe('floor');
    });

    it('passes through a face it is told to, and whatever stands on that face', async () => {
      const board = boardAt(100, 100);
      const onBoard = Terrain.create('on the board', 1, 1, 2, '', '');
      onBoard.location = { name: 'table', x: 100, y: 50, surface: board.identifier };
      table.appendChild(onBoard);
      await settled();
      const top = onPage(4, 3, 2 * GRID);
      const options = { excluding: new Set([board.identifier]), stopsAt: () => true };
      expect(service.faceAt(top.x, top.y, options)).toBe('floor');
    });
  });

  it('lands on a block stuck to a board where the board draws it, however the board is turned', async () => {
    const board = boardAt(300, 200, 60, 20);
    const onBoard = Terrain.create('on the board', 1, 1, 1, '', '');
    onBoard.location = { name: 'table', x: 50, y: 50, surface: board.identifier };
    table.appendChild(onBoard);
    await settled();
    const surfaces = TestBed.inject(TableSurfaceService);

    const front = surfaces.pageOf(board.identifier, 75, 75, GRID)!;
    expect(service.pickAt(front.x, front.y)?.target).toMatchObject({
      id: onBoard.identifier,
      surface: board.identifier,
    });
    const beside = surfaces.pageOf(board.identifier, 300, 75)!;
    expect(service.pickAt(beside.x, beside.y)).toBeNull();
  });

  it('lands on a block put on a wall where it runs out from the wall', async () => {
    const beam = Terrain.create('beam', 4, 1, 1, '', '');
    beam.location = { name: 'table', x: 100, y: 100, surface: 'north-wall' };
    table.appendChild(beam);
    await settled();

    const front = TestBed.inject(TableSurfaceService).pageOf('north-wall', 150, 125, GRID)!;
    expect(service.pickAt(front.x, front.y)?.target).toMatchObject({ id: beam.identifier, surface: 'north-wall' });
  });

  it('moves a block put on a wall with the wall, once the table is made larger', async () => {
    const beam = Terrain.create('beam', 4, 1, 1, '', '');
    beam.location = { name: 'table', x: 100, y: 100, surface: 'south-wall' };
    table.appendChild(beam);
    await settled();
    const before = JSON.stringify(service.targets().find((target) => target.id === beam.identifier)!.shapes);

    table.height += 4;
    await settled();

    const after = JSON.stringify(service.targets().find((target) => target.id === beam.identifier)!.shapes);
    expect(after).not.toBe(before);
  });

  it('lands on a die where its frame lies, and lets the blocks a piece lands on be picked apart from it', async () => {
    const die = DiceSymbol.create('D6', DiceType.D6, 1);
    die.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };
    await settled();

    const frame = onPage(5, 5, 1);
    expect(service.pickAt(frame.x, frame.y)?.target).toMatchObject({ id: die.identifier, layer: 'dice-symbol' });
    expect(service.targets()).toEqual([]);
    expect(service.landingAt(frame.x, frame.y).z).toBe(0);
  });

  it('lands on a look laid over the ground where it covers the floor, behind a die lying in it, and beside it on nothing', async () => {
    const look = TableAmbience.create('marsh', 'swamp', 4, 4);
    look.location = { name: 'table', x: 4 * GRID, y: 4 * GRID };
    table.appendChild(look);
    const die = DiceSymbol.create('D6', DiceType.D6, 1);
    die.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };
    await settled();

    const inside = onPage(7, 7, 0);
    expect(service.pickAt(inside.x, inside.y)?.target).toMatchObject({ id: look.identifier, layer: 'table-ambience' });
    const frame = onPage(5, 5, 1);
    expect(service.allAt(frame.x, frame.y).map((hit) => hit.target.id)).toEqual([die.identifier, look.identifier]);
    const beside = onPage(9, 6, 0);
    expect(service.pickAt(beside.x, beside.y)).toBeNull();
  });

  it('lands on the card drawn over another where they overlap: the higher, and of two as high the later', async () => {
    vi.spyOn(TestBed.inject(PictureSizeService), 'sizeOf').mockReturnValue({ width: 2, height: 3 });
    const first = Card.create('first', 'front', 'back');
    first.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };
    const second = Card.create('second', 'front', 'back');
    second.location = { name: 'table', x: 5 * GRID + 20, y: 5 * GRID + 20 };
    await settled();
    const overlap = pageOfTablePoint(camera.sceneMatrix()!, 5 * GRID + 60, 5 * GRID + 60, 0.15);

    expect(service.pickAt(overlap.x, overlap.y)?.target.id).toBe(second.identifier);

    first.zindex = 1;
    TestBed.inject(ObjectChangeService).notifyChanged(first.identifier);
    await settled();

    expect(service.pickAt(overlap.x, overlap.y)?.target.id).toBe(first.identifier);
  });

  it('hands a press on a block locked in place to a piece behind it on the same line of sight, but keeps one on a block not locked', async () => {
    const block = blockAt(5, 5);
    block.isLocked = true;
    const die = DiceSymbol.create('D6', DiceType.D6, 1);
    die.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };
    await settled();
    const frame = onPage(5, 5, 1);

    expect(service.pickAt(frame.x, frame.y)?.target.id).toBe(block.identifier);
    expect(service.pressedAt(frame.x, frame.y)?.target.id).toBe(die.identifier);

    block.isLocked = false;
    expect(service.pressedAt(frame.x, frame.y)?.target.id).toBe(block.identifier);
  });

  it('keeps a press on a locked door, and on a locked switch, with a piece behind it', async () => {
    const door = blockAt(5, 5);
    door.isLocked = true;
    door.doorStyle = DoorStyle.SWING;
    const die = DiceSymbol.create('D6', DiceType.D6, 1);
    die.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };
    await settled();
    const frame = onPage(5, 5, 1);

    expect(service.pressedAt(frame.x, frame.y)?.target.id).toBe(door.identifier);

    door.doorStyle = DoorStyle.NONE;
    expect(service.pressedAt(frame.x, frame.y)?.target.id).toBe(die.identifier);
    const held = new BoardSwitch();
    held.initialize();
    door.appendChild(held);
    expect(service.pressedAt(frame.x, frame.y)?.target.id).toBe(door.identifier);
  });

  it('keeps a press on a block locked in place with no piece behind it, for its menu and its door', async () => {
    const block = blockAt(5, 5);
    block.isLocked = true;
    await settled();
    const top = onPage(5, 5, 2 * GRID);

    expect(service.pressedAt(top.x, top.y)?.target.id).toBe(block.identifier);
  });

  it('lands on a coin where its disc lies, and beside it on nothing', async () => {
    const coin = Coin.create('coin');
    coin.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };
    await settled();

    const top = onPage(5, 5, 6);
    expect(service.pickAt(top.x, top.y)?.target).toMatchObject({ id: coin.identifier, layer: 'coin' });
    const corner = pageOfTablePoint(camera.sceneMatrix()!, 5 * GRID + 3, 5 * GRID + 3, 6);
    expect(service.pickAt(corner.x, corner.y)).toBeNull();
  });

  /** Stands a character a cell tall in cell (5, 5), its picture solid along its left half and clear along its right. */
  async function standHero(): Promise<GameCharacter> {
    const character = GameCharacter.create('hero', 1, 'hero-picture');
    character.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };
    table.appendChild(character);
    vi.spyOn(TestBed.inject(ImageService), 'getEmptyOr').mockReturnValue({
      isEmpty: false,
      url: 'blob:hero',
    } as unknown as ImageFile);
    const pictures = TestBed.inject(PictureSizeService);
    vi.spyOn(pictures, 'sizeOf').mockReturnValue({ width: 2, height: 2 });
    // The picture is solid along its left half and clear along its right.
    vi.spyOn(pictures, 'maskOf').mockReturnValue({ width: 2, height: 2, alpha: new Uint8Array([255, 0, 255, 0]) });
    TestBed.inject(PiecePicturesService).show(character.identifier, {
      url: 'blob:pedestal',
      widthPx: GRID,
      heightPx: GRID,
    });
    await settled();
    return character;
  }

  /** Where the left and the right half of the hero's picture are drawn on the page, a quarter from its top. */
  function heroHalves(): { solid: { x: number; y: number }; clear: { x: number; y: number } } {
    const solid = pageOfTablePoint(
      camera.sceneMatrix()!,
      5 * GRID + GRID / 2 - 10,
      5 * GRID + GRID / 2,
      1 + GRID * 0.75
    );
    const clear = pageOfTablePoint(
      camera.sceneMatrix()!,
      5 * GRID + GRID / 2 + 10,
      5 * GRID + GRID / 2,
      1 + GRID * 0.75
    );
    return { solid, clear };
  }

  it('passes a press through the clear parts of a character’s picture, and lands on it where it is drawn', async () => {
    const character = await standHero();
    const { solid, clear } = heroHalves();

    expect(service.pickAt(solid.x, solid.y)?.target.id).toBe(character.identifier);
    expect(service.pickAt(clear.x, clear.y)).toBeNull();
  });

  it('tells what of the floor a character’s picture hides and where its corners lie, and a picture not shown hides nothing', async () => {
    const character = await standHero();
    const { solid, clear } = heroHalves();
    const picture = TestBed.inject(TablePiecesService)
      .sprites()
      .find((sprite) => sprite.id === `${character.identifier}#picture`)!;
    const behindSolid = service.landingAt(solid.x, solid.y);
    const behindClear = service.landingAt(clear.x, clear.y);
    expect(behindSolid.z).toBe(0);

    const sight = service.pictureSightOf(picture)!;
    expect(sight.hides('floor', behindSolid.x, behindSolid.y)).toBe(true);
    expect(sight.hides('floor', behindClear.x, behindClear.y)).toBe(false);

    const unseen = service.pictureSightOf({ ...picture, hidden: true })!;
    expect(unseen.hides('floor', behindSolid.x, behindSolid.y)).toBe(false);
    expect(unseen.cornerOnPage(1)).toEqual(sight.cornerOnPage(1));
  });
});
