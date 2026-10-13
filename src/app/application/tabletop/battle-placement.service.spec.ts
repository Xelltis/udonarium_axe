import { TestBed } from '@angular/core/testing';
import { BattlePlacementService } from '@axe/application/tabletop/battle-placement.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('BattlePlacementService', () => {
  let service: BattlePlacementService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    Config.instance.zoneEnabled = true;
    const table = new GameTable();
    table.width = 40;
    table.height = 40;
    table.gridSize = GRID;
    table.initialize();
    service = TestBed.inject(BattlePlacementService);
  });

  afterEach(() => {
    Config.instance.zoneEnabled = null;
    Config.instance.placementDistances = null;
    Config.instance.distanceModifiers = null;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, npc = false): GameCharacter {
    const piece = GameCharacter.create(npc ? '敵' : '味方', 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    piece.isNpc = npc;
    return piece;
  }

  it('reads the distances and what they do from what the room writes', () => {
    Config.instance.placementDistances = '近い:10,遠い:30';
    Config.instance.distanceModifiers = '10:修正なし,20:命中-2';

    expect(service.distances().map((row) => row.metres)).toEqual([10, 30]);
    expect(service.modifierBetween(pieceAt(0, 0), pieceAt(15, 0, true))?.note).toBe('命中-2');
  });

  it('puts the other leader the distance away in the direction, and gathers each side about its leader', () => {
    const leader = pieceAt(5, 5);
    const ally = pieceAt(30, 30);
    const other = pieceAt(1, 1, true);
    const foe = pieceAt(35, 2, true);
    const resting = pieceAt(20, 20, true);
    resting.offField = '1';

    expect(service.place(leader, other, 0, 10)).toBe(true);

    expect([other.location.x, other.location.y]).toEqual([15 * GRID, 5 * GRID]);
    expect(Math.hypot(ally.location.x - leader.location.x, ally.location.y - leader.location.y)).toBeLessThanOrEqual(
      1.5 * GRID
    );
    expect(Math.hypot(foe.location.x - other.location.x, foe.location.y - other.location.y)).toBeLessThanOrEqual(
      1.5 * GRID
    );
    expect([resting.location.x, resting.location.y]).toEqual([20 * GRID, 20 * GRID]);
    expect(service.distanceM(leader, other)).toBe(10);
  });

  it('sets out a piece riding another, or held on to by another, with that one', () => {
    const leader = pieceAt(5, 5);
    const horse = pieceAt(30, 30);
    horse.mountable = '1';
    const knight = pieceAt(30, 30);
    knight.ridingOn = horse.identifier;
    const other = pieceAt(1, 1, true);
    const snake = pieceAt(35, 2, true);
    const caught = pieceAt(35, 2);
    caught.grabbedBy = snake.identifier;

    expect(service.place(leader, other, 0, 10)).toBe(true);

    expect([knight.location.x, knight.location.y]).toEqual([horse.location.x, horse.location.y]);
    expect(knight.ridingOn).toBe(horse.identifier);
    expect([caught.location.x, caught.location.y]).toEqual([snake.location.x, snake.location.y]);
    expect(Math.hypot(snake.location.x - other.location.x, snake.location.y - other.location.y)).toBeLessThanOrEqual(
      1.5 * GRID
    );
  });

  it('works the zones out once for every piece it lists, not once for each', () => {
    for (let col = 0; col < 8; col++) pieceAt(col, 0, col % 2 === 0);
    const zones = TestBed.inject(EngagementZoneService) as unknown as { snapshot(): unknown };
    const worked = vi.spyOn(zones, 'snapshot');

    expect(service.pieces()).toHaveLength(8);
    expect(worked).toHaveBeenCalledTimes(1);
  });

  it('sets out nothing for two leaders on the same side', () => {
    expect(service.place(pieceAt(5, 5), pieceAt(6, 6), 0, 10)).toBe(false);
  });
});
