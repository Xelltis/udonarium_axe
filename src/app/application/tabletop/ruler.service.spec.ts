import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RulerService } from '@axe/application/tabletop/ruler.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { decodeRulerLine, encodeRulerLine } from '@axe/domain/tabletop/ruler/ruler-line';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('RulerService', () => {
  let ruler: RulerService;
  let table: GameTable;
  /** What the stand-in picking says a point of the page lands on. */
  let landing: { x: number; y: number; z: number };
  let pressed: { id: string; layer: string } | null;

  beforeEach(() => {
    landing = { x: 0, y: 0, z: 0 };
    pressed = null;
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: TablePickService,
          useValue: {
            pressedAt: () =>
              pressed ? { target: { ...pressed, order: 0, shapes: [] }, t: 0, point: landing, shapeIndex: 0 } : null,
            rayAt: () => ({ origin: { x: 0, y: 0, z: 1000 }, direction: { x: 0, y: 0, z: -1 } }),
            landingAt: () => landing,
            pickTargets: () => [],
          },
        },
      ],
    });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    ruler = TestBed.inject(RulerService);
  });

  afterEach(() => {
    Config.instance.cellDistance = null;
    Config.instance.cellDistanceUnit = null;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, altitude = 0): GameCharacter {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    piece.altitude = altitude;
    return piece;
  }

  it('keeps an end laid on the table to the middle of its square where the table snaps, and off it laid freely', () => {
    landing = { x: 61, y: 149, z: 0 };
    expect(ruler.endAt(0, 0, false)).toEqual({ x: 75, y: 125, z: 0 });
    expect(ruler.endAt(0, 0, true)).toEqual({ x: 61, y: 149, z: 0 });
    table.gridSnap = false;
    expect(ruler.endAt(0, 0, false)).toEqual({ x: 61, y: 149, z: 0 });
  });

  it('holds an end laid on a piece to the middle of its feet, its altitude included', () => {
    const piece = pieceAt(2, 3, 2);
    pressed = { id: piece.identifier, layer: 'character' };

    expect(ruler.endAt(0, 0, false)).toEqual({ x: 125, y: 175, z: 100, piece: piece.identifier, lift: 0 });
  });

  it('measures from a piece to where it is drawn out to, and follows the piece as it moves', () => {
    const piece = pieceAt(0, 0);
    ruler.startFrom(piece);
    landing = { x: 175, y: 25, z: 0 };
    ruler.reachTo(0, 0, false);
    ruler.letGo();

    expect(ruler.inHand()).toBe(true);
    expect(ruler.measured()?.reading).toMatchObject({ straight: '3.0', level: '3.0', rise: '0.0', steps: 3 });

    piece.location = { name: 'table', x: 100, y: 0 };
    TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);

    expect(ruler.measured()?.reading.straight).toBe('1.0');
  });

  it('says its lengths in the room’s unit of length, afresh as the room changes the unit', () => {
    landing = { x: 25, y: 25, z: 0 };
    ruler.startAt(0, 0, true);
    landing = { x: 175, y: 25, z: 200 };
    ruler.reachTo(0, 0, true);
    ruler.letGo();

    expect(ruler.measured()?.reading).toEqual({
      unit: 'square',
      straight: '5.0',
      level: '3.0',
      rise: '+4.0',
      steps: 4,
    });

    Config.instance.cellDistance = 1.5;
    Config.instance.cellDistanceUnit = 'metre';
    TestBed.inject(ObjectChangeService).notifyChanged(Config.instance.identifier);

    expect(ruler.measured()?.reading).toEqual({ unit: 'metre', straight: '7.5', level: '4.5', rise: '+6.0', steps: 4 });
  });

  it('keeps the far end lifted as it is drawn about', () => {
    landing = { x: 25, y: 25, z: 0 };
    ruler.startAt(0, 0, false);
    landing = { x: 175, y: 25, z: 0 };
    ruler.reachTo(0, 0, false);
    ruler.liftEnd(4);
    expect(ruler.measured()?.reading).toMatchObject({ straight: '5.0', rise: '+4.0' });

    landing = { x: 225, y: 25, z: 0 };
    ruler.reachTo(0, 0, false);

    expect(ruler.measured()?.reading).toMatchObject({ level: '4.0', rise: '+4.0' });
  });

  it('takes the line away as another table is viewed, keeping the ruler in hand', () => {
    landing = { x: 25, y: 25, z: 0 };
    ruler.startAt(0, 0, false);
    ruler.letGo();
    TestBed.tick();
    const other = new GameTable();
    other.initialize();

    TableSelecter.instance.viewTableIdentifier = other.identifier;
    TestBed.inject(ObjectChangeService).notifyChanged(TableSelecter.instance.identifier);
    TestBed.tick();

    expect(ruler.laid()).toBeNull();
    expect(ruler.inHand()).toBe(true);
  });

  it('draws the ruler in the scene while it is laid, and nothing once it is put away', () => {
    landing = { x: 25, y: 25, z: 0 };
    ruler.startAt(0, 0, false);
    landing = { x: 125, y: 25, z: 0 };
    ruler.reachTo(0, 0, false);

    expect(ruler.guides()).toHaveLength(1);
    expect(ruler.guides()[0].segments[0]).toEqual([
      { x: 25, y: 25, z: 0 },
      { x: 125, y: 25, z: 0 },
    ]);

    ruler.putAway();

    expect(ruler.inHand()).toBe(false);
    expect(ruler.guides()).toEqual([]);
  });
});

describe('RulerService with the room', () => {
  let ruler: RulerService;
  let table: GameTable;
  let hidden: Set<string>;
  let fogged: boolean;

  beforeEach(() => {
    hidden = new Set();
    fogged = false;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const vision = TestBed.inject(VisionService);
    vi.spyOn(vision, 'isTokenVisible').mockImplementation((piece: GameCharacter) => !hidden.has(piece.identifier));
    vi.spyOn(vision, 'isHiddenByFog').mockImplementation(() => fogged);
    table = new GameTable();
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    ruler = TestBed.inject(RulerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  function someoneMeasuring(line: string, onTable = table.identifier): PeerCursor {
    const cursor = new PeerCursor();
    cursor.initialize();
    cursor.name = 'アリス';
    cursor.measuring = line;
    cursor.measuringTable = onTable;
    return cursor;
  }

  it('shows the ruler another seat lays on the table in view, by name', () => {
    someoneMeasuring(encodeRulerLine({ from: { x: 0, y: 0, z: 0 }, to: { x: 150, y: 200, z: 0 } }));

    expect(ruler.others()).toMatchObject([{ name: 'アリス', reading: { straight: '5.0' } }]);
    expect(ruler.guides()).toHaveLength(1);
  });

  it('shows none laid on another table, or held to a piece this seat may not see, or laid in the fog', () => {
    const piece = GameCharacter.create('潜む', 1, '');
    piece.location = { name: 'table', x: 0, y: 0 };
    someoneMeasuring(encodeRulerLine({ from: { x: 0, y: 0, z: 0 }, to: { x: 100, y: 0, z: 0 } }), 'another');
    someoneMeasuring(
      encodeRulerLine({ from: { x: 25, y: 25, z: 0, piece: piece.identifier, lift: 0 }, to: { x: 100, y: 0, z: 0 } })
    );
    hidden.add(piece.identifier);

    expect(ruler.others()).toEqual([]);

    hidden.clear();
    TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);
    expect(ruler.others()).toHaveLength(1);

    fogged = true;
    TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);
    expect(ruler.others()).toEqual([]);
  });

  it('tells the room where its own ruler is laid, and takes it back once it is put away', async () => {
    vi.useFakeTimers();
    try {
      const mine = new PeerCursor();
      mine.initialize();
      PeerCursor.myCursor = mine;
      ruler.inHand.set(true);
      ruler.laid.set({ from: { x: 0, y: 0, z: 0 }, to: { x: 50, y: 0, z: 0 } });
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(200);

      expect(decodeRulerLine(mine.measuring)).toEqual({ from: { x: 0, y: 0, z: 0 }, to: { x: 50, y: 0, z: 0 } });
      expect(mine.measuringTable).toBe(table.identifier);

      ruler.putAway();
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(200);

      expect(mine.measuring).toBe('');
      expect(mine.measuringTable).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});
