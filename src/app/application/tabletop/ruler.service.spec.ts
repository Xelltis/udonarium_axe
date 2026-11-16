import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RulerService } from '@axe/application/tabletop/ruler.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
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
