import { FURNISHING_SHAPES } from '@axe/domain/tabletop/dungeon/room-furnishing';
import { planField } from '@axe/domain/tabletop/field/field-generator';
import { TOWN_ROOM_PLANS } from '@axe/domain/tabletop/field/settlement-furnishing';
import {
  HUNG_FIXTURES,
  laySettlement,
  SETTLEMENT_WALL_KINDS,
  SETTLEMENT_ZONES,
  type SettlementLayout,
  TOWN_BUILDING_KINDS,
  TOWN_ROOM_KINDS,
} from '@axe/domain/tabletop/field/settlement-layout';
import { GridType } from '@axe/domain/tabletop/grid-type';

const SEEDS = [1, 7, 42, 1234, 20261106];

/** The kind of wall standing on a cell, or null for none. */
function wallAt(town: SettlementLayout, width: number, x: number, y: number): string | null {
  const mark = town.walls[y * width + x];
  return mark ? SETTLEMENT_WALL_KINDS[mark - 1] : null;
}

/** The room a cell is in, if it is in one. */
function roomAt(town: SettlementLayout, x: number, y: number) {
  return town.rooms?.find((room) => x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h);
}

describe('a castle town', () => {
  it('stands the castle wall along the top of the board with its gate in the middle and banners along it', () => {
    for (const seed of SEEDS) {
      const town = laySettlement('castleTown', 40, 30, seed);
      const gates = town.doors.filter((door) => door.kind === 'gate');
      expect(gates.map((gate) => gate.y)).toEqual([0, 0]);
      expect(Math.abs(gates[0].x + 1 - 20)).toBeLessThanOrEqual(1);
      for (let x = 0; x < 40; x++) {
        if (gates.some((gate) => gate.x === x)) continue;
        expect(['stoneWall', 'tower'], `${seed} ${x}`).toContain(wallAt(town, 40, x, 0));
      }
      const banners = (town.fixtures ?? []).filter((fixture) => fixture.kind === 'banner');
      expect(banners.length).toBeGreaterThan(2);
      for (const banner of banners) expect(wallAt(town, 40, banner.rect.x, banner.rect.y)).toBe('stoneWall');
    }
  });

  it('lays a market square round a fountain where the high street crosses the street across the board', () => {
    for (const seed of SEEDS) {
      const town = laySettlement('castleTown', 40, 30, seed);
      const fountains = (town.fixtures ?? []).filter((fixture) => fixture.kind === 'fountain');
      expect(fountains).toHaveLength(1);
      const { rect } = fountains[0];
      expect([rect.w, rect.h]).toEqual([3, 3]);
      for (let y = rect.y - 1; y <= rect.y + rect.h; y++) {
        for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
          expect(town.zones[y * 40 + x], `${seed} ${x},${y}`).toBe(SETTLEMENT_ZONES.yard);
        }
      }
      expect((town.fixtures ?? []).filter((fixture) => fixture.kind.startsWith('marketStall')).length).toBeGreaterThan(
        0
      );
      expect((town.fixtures ?? []).filter((fixture) => fixture.kind === 'lampPost').length).toBeGreaterThan(3);
    }
  });

  it('puts up the guards’ house, a church, an inn, a tavern, a smithy, a bakery and a shop, and houses round them', () => {
    for (const seed of SEEDS) {
      const town = laySettlement('castleTown', 40, 30, seed);
      const kinds = new Set((town.rooms ?? []).map((room) => room.kind));
      for (const kind of TOWN_BUILDING_KINDS) expect(kinds, `${seed} ${kind}`).toContain(TOWN_ROOM_KINDS[kind].front);
    }
  });

  it('hangs a shop’s sign on the timber wall beside its door, facing the street out of it', () => {
    let signs = 0;
    for (const seed of SEEDS) {
      const town = laySettlement('castleTown', 40, 30, seed);
      for (const fixture of town.fixtures ?? []) {
        if (!fixture.kind.startsWith('sign')) continue;
        signs++;
        const { x, y } = fixture.rect;
        expect(wallAt(town, 40, x, y), `${seed}`).toBe('timberWall');
        const beside = town.doors.find((door) => Math.abs(door.x - x) + Math.abs(door.y - y) === 1);
        expect(beside, `${seed}`).toBeDefined();
        const out = { 0: [0, 1], 180: [0, -1], 270: [1, 0], 90: [-1, 0] }[fixture.turn]!;
        expect(town.zones[(y + out[1]) * 40 + x + out[0]], `${seed}`).not.toBe(SETTLEMENT_ZONES.floor);
        expect(town.walls[(y + out[1]) * 40 + x + out[0]], `${seed}`).toBe(0);
      }
    }
    expect(signs).toBeGreaterThan(SEEDS.length * 3);
  });

  it('furnishes every kind of room by plans of its own, and each kind of room has some', () => {
    const planned = new Set(TOWN_ROOM_PLANS.map((plan) => plan.set));
    const kinds = TOWN_BUILDING_KINDS.flatMap((kind) => [TOWN_ROOM_KINDS[kind].front, ...TOWN_ROOM_KINDS[kind].back]);
    expect([...planned].sort()).toEqual([...new Set(kinds)].sort());
  });

  it('furnishes the rooms as what they are, every room still walked into and through from its door', () => {
    for (const seed of SEEDS) {
      const plan = planField({ atmosphere: 'castleTown', size: 40, density: 50, seed, models: true });
      const town = plan.layout.settlement!;
      const width = plan.layout.width;
      const height = plan.layout.height;
      const pieces = town.furnishings ?? [];
      const inKind = (kind: string) =>
        pieces.filter((piece) => roomAt(town, piece.x, piece.y)?.kind === kind).map((piece) => piece.piece);
      expect(inKind('innHall'), `${seed}`).toContain('tavernCounter');
      expect(inKind('smithy'), `${seed}`).toEqual(expect.arrayContaining(['forge', 'anvil']));
      expect(inKind('nave'), `${seed}`).toEqual(expect.arrayContaining(['altar', 'pew']));
      for (const piece of pieces) {
        expect(roomAt(town, piece.x, piece.y), `${seed} ${piece.piece}`).toBeDefined();
        expect(FURNISHING_SHAPES[piece.piece]).toBeDefined();
      }

      const blocked = new Uint8Array(width * height);
      town.walls.forEach((wall, cell) => (blocked[cell] = wall ? 1 : 0));
      for (const door of town.doors) blocked[door.y * width + door.x] = 0;
      for (const piece of pieces) {
        for (let y = piece.y; y < piece.y + piece.h; y++)
          blocked.fill(1, y * width + piece.x, y * width + piece.x + piece.w);
      }
      const gate = town.doors.find((door) => door.kind === 'gate')!;
      const seen = new Uint8Array(width * height);
      const queue = [gate.y * width + gate.x];
      seen[queue[0]] = 1;
      for (let at = 0; at < queue.length; at++) {
        const x = queue[at] % width;
        const y = Math.floor(queue[at] / width);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          const next = ny * width + nx;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || blocked[next] || seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      const shut = [...town.zones].flatMap((zone, cell) =>
        zone === SETTLEMENT_ZONES.floor && !blocked[cell] && !seen[cell] ? [cell] : []
      );
      expect(shut, `${seed}`).toEqual([]);
    }
  });

  it('stands its fixtures and its furniture as their models, a sign or a banner over its wall only where models are asked for', () => {
    for (const gridType of [GridType.SQUARE, GridType.HEX_VERTICAL]) {
      const modelled = planField({ atmosphere: 'castleTown', size: 40, density: 50, seed: 7, gridType, models: true });
      const plain = planField({ atmosphere: 'castleTown', size: 40, density: 50, seed: 7, gridType });
      const town = modelled.layout.settlement!;
      const fixtures = town.fixtures ?? [];
      const hung = fixtures.filter((fixture) => HUNG_FIXTURES.includes(fixture.kind));
      const fixtureBlocks = modelled.blocks.blocks.filter((block) =>
        fixtures.some((fixture) => fixture.kind === block.thing)
      );
      expect(fixtureBlocks).toHaveLength(fixtures.length);
      expect(fixtureBlocks.every((block) => block.model !== undefined)).toBe(true);
      const plainFixtures = plain.blocks.blocks.filter((block) =>
        fixtures.some((fixture) => fixture.kind === block.thing)
      );
      expect(plainFixtures).toHaveLength(fixtures.length - hung.length);
      expect(plainFixtures.every((block) => block.model === undefined)).toBe(true);
      expect(modelled.blocks.blocks.length, `${gridType}`).toBeLessThanOrEqual(700);
    }
  });
});
