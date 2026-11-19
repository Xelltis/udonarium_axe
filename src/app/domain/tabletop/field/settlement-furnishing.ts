import { seededRandom } from '@axe/core/util/seeded-random';
import { DungeonCell, DungeonLayout, DungeonRoomRole } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { FurnishingPlan, furnishRooms } from '@axe/domain/tabletop/dungeon/room-furnishing';
import { SETTLEMENT_ZONES, SettlementLayout } from '@axe/domain/tabletop/field/settlement-layout';

/** What the furniture of a town draws its chances from, apart from what the town drew its own from. */
const FURNISHING_SEED = 3307;

/**
 * How each kind of room in a town is furnished, as a dungeon's rooms are: an inn's common room and a
 * tavern round a counter and a fire, an inn's bedrooms with beds and chests, a smithy round its anvil
 * with a forge on the wall, a bakery with its ovens, a shop with its counter and shelves, stores
 * heaped in the corners, a church's nave of pews facing an altar across from its door, a guards' house with
 * its table, bunks and racks of weapons, and a house's kitchen by its hearth and bedroom.
 */
export const TOWN_ROOM_PLANS: readonly FurnishingPlan[] = [
  {
    piece: 'tavernCounter',
    arrangement: 'counter',
    roles: ['chamber'],
    every: 0,
    seat: 'chairWood',
    set: ['innHall', 'tavern'],
  },
  { piece: 'shopCounter', arrangement: 'counter', roles: ['chamber'], every: 0, set: ['bakeryShop', 'shop'] },
  { piece: 'anvil', arrangement: 'centre', roles: ['chamber'], every: 0, set: 'smithy' },
  { piece: 'tableWood', arrangement: 'centre', roles: ['chamber'], every: 0, set: ['bakery', 'guardroom', 'kitchen'] },
  { piece: 'pew', arrangement: 'rows', roles: ['chamber'], every: 0, back: 'altar', set: 'nave' },
  {
    piece: 'fireplace',
    arrangement: 'wall',
    roles: ['chamber'],
    every: 200,
    most: 1,
    set: ['innHall', 'tavern', 'guardroom', 'kitchen'],
  },
  { piece: 'forge', arrangement: 'wall', roles: ['chamber'], every: 200, most: 1, set: 'smithy' },
  { piece: 'breadOven', arrangement: 'wall', roles: ['chamber'], every: 30, most: 2, set: 'bakery' },
  { piece: 'bed', arrangement: 'wall', roles: ['chamber'], every: 8, most: 2, set: 'innRoom' },
  { piece: 'bed', arrangement: 'wall', roles: ['chamber'], every: 12, most: 2, set: 'bedroom' },
  { piece: 'bunkBed', arrangement: 'wall', roles: ['chamber'], every: 5, most: 3, set: 'barracks' },
  { piece: 'cupboard', arrangement: 'wall', roles: ['chamber'], every: 40, most: 1, set: ['kitchen', 'vestry'] },
  { piece: 'wardrobe', arrangement: 'wall', roles: ['chamber'], every: 40, most: 1, set: 'bedroom' },
  { piece: 'weaponRack', arrangement: 'wall', roles: ['chamber'], every: 12, most: 2, set: ['smithy', 'guardroom'] },
  { piece: 'weaponRack', arrangement: 'wall', roles: ['chamber'], every: 6, most: 2, set: 'smithyStore' },
  { piece: 'weaponRack', arrangement: 'wall', roles: ['chamber'], every: 3, most: 3, set: 'armory' },
  { piece: 'shelfGoods', arrangement: 'wall', roles: ['chamber'], every: 6, most: 2, set: 'bakeryShop' },
  { piece: 'shelfGoods', arrangement: 'wall', roles: ['chamber'], every: 4, most: 3, set: 'shop' },
  { piece: 'shelfGoods', arrangement: 'wall', roles: ['chamber'], every: 8, most: 2, set: 'shopStore' },
  { piece: 'tableWood', arrangement: 'scatter', roles: ['chamber'], every: 8, set: 'innHall' },
  { piece: 'tableWood', arrangement: 'scatter', roles: ['chamber'], every: 7, set: 'tavern' },
  { piece: 'chairWood', arrangement: 'scatter', roles: ['chamber'], every: 10, set: 'innHall' },
  { piece: 'chairWood', arrangement: 'scatter', roles: ['chamber'], every: 8, set: ['tavern', 'guardroom', 'kitchen'] },
  { piece: 'lectern', arrangement: 'scatter', roles: ['chamber'], every: 20, set: 'vestry' },
  { piece: 'barrel', arrangement: 'corners', roles: ['chamber'], every: 20, set: ['innHall', 'smithy', 'kitchen'] },
  { piece: 'barrel', arrangement: 'corners', roles: ['chamber'], every: 15, set: 'tavern' },
  {
    piece: 'barrel',
    arrangement: 'corners',
    roles: ['chamber'],
    every: 3,
    pieces: ['barrel', 'barrel', 'crate'],
    set: 'tavernStore',
  },
  {
    piece: 'crate',
    arrangement: 'corners',
    roles: ['chamber'],
    every: 4,
    pieces: ['crate', 'barrel', 'chestWood'],
    set: 'smithyStore',
  },
  { piece: 'flourSacks', arrangement: 'corners', roles: ['chamber'], every: 12, set: 'bakeryShop' },
  { piece: 'flourSacks', arrangement: 'corners', roles: ['chamber'], every: 6, set: 'bakery' },
  { piece: 'crate', arrangement: 'corners', roles: ['chamber'], every: 12, set: 'shop' },
  {
    piece: 'crate',
    arrangement: 'corners',
    roles: ['chamber'],
    every: 3,
    pieces: ['crate', 'barrel', 'flourSacks'],
    set: 'shopStore',
  },
  { piece: 'candelabra', arrangement: 'corners', roles: ['chamber'], every: 12, set: 'nave' },
  { piece: 'chestWood', arrangement: 'corners', roles: ['chamber'], every: 10, set: ['vestry', 'barracks'] },
  { piece: 'chestWood', arrangement: 'corners', roles: ['chamber'], every: 16, set: 'innRoom' },
  { piece: 'chestWood', arrangement: 'corners', roles: ['chamber'], every: 8, set: 'armory' },
  { piece: 'chestWood', arrangement: 'corners', roles: ['chamber'], every: 12, set: 'bedroom' },
];

/**
 * A settlement with the rooms of its buildings furnished as what each is, by the plans of
 * `TOWN_ROOM_PLANS`, the same from the same seed: the rooms are handed to the dungeon's furnisher
 * as a dungeon's rooms are, the walls as its rock, the doors as its doors and the streets as its
 * passages, so a piece never stands in a doorway or shuts a room in two. Containers are stacked
 * only where asked, as on a board of squares. A settlement with no rooms to furnish is left as it is.
 */
export function furnishSettlement(
  settlement: SettlementLayout,
  width: number,
  height: number,
  seed: number,
  stacksContainers: boolean
): SettlementLayout {
  if (!settlement.rooms || settlement.rooms.length === 0) return settlement;
  const furnishings = furnishRooms(
    asDungeon(settlement, width, height, seed),
    TOWN_ROOM_PLANS,
    seededRandom(seed + FURNISHING_SEED),
    { stacksContainers }
  );
  return { ...settlement, furnishings };
}

/**
 * A settlement as a dungeon's furnisher reads one: a wall is rock, a door a door, the floor inside a
 * building a room's floor and the rest a passage; its rooms are the rooms of its buildings, each of
 * the kind it is; and its way in and out is its gate, or its corner where it has none.
 */
function asDungeon(settlement: SettlementLayout, width: number, height: number, seed: number): DungeonLayout {
  const cells = new Uint8Array(width * height);
  for (let cell = 0; cell < cells.length; cell++) {
    cells[cell] = settlement.walls[cell]
      ? DungeonCell.Rock
      : settlement.zones[cell] === SETTLEMENT_ZONES.floor
        ? DungeonCell.Room
        : DungeonCell.Corridor;
  }
  for (const door of settlement.doors) cells[door.y * width + door.x] = DungeonCell.Door;
  const gate = settlement.doors.find((door) => door.kind === 'gate') ?? { x: 0, y: 0 };
  return {
    width,
    height,
    cells,
    rooms: (settlement.rooms ?? []).map(({ kind, ...rect }, index) => ({
      ...rect,
      index,
      role: DungeonRoomRole.Chamber,
      set: kind,
    })),
    doors: [],
    doorLeaves: [],
    links: [],
    entrance: { x: gate.x, y: gate.y },
    exit: { x: gate.x, y: gate.y },
    mouth: null,
    keyRoomIndex: -1,
    seed,
  };
}
