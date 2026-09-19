import { FIELD_ATMOSPHERES, TownPlan } from '@axe/domain/tabletop/field/field-atmosphere';
import { planField } from '@axe/domain/tabletop/field/field-generator';
import { FieldBuilding, layTown, TownGround } from '@axe/domain/tabletop/field/town-layout';
import { GridType } from '@axe/domain/tabletop/game-table';

const SEEDS = [1, 7, 42, 1234, 99999];
const CITY = FIELD_ATMOSPHERES.city.town!;
const FUTURE = FIELD_ATMOSPHERES.sfCity.town!;
const ROWS = FIELD_ATMOSPHERES.slum.town!;
const DUMP = FIELD_ATMOSPHERES.dump.town!;
const TOWNS = [CITY, FUTURE, ROWS, DUMP];
const WIDTH = 40;
const HEIGHT = 30;

function builtOn(town: TownGround): Uint8Array {
  const taken = new Uint8Array(WIDTH * HEIGHT);
  for (const building of town.buildings) {
    for (let dy = 0; dy < building.h; dy++) {
      for (let dx = 0; dx < building.w; dx++) taken[(building.y + dy) * WIDTH + building.x + dx]++;
    }
  }
  return taken;
}

/** How many cells of street and pavement there are, and whether they all join up. */
function streets(town: TownGround, plan: TownPlan): { cells: number; joined: boolean } {
  const walkable = (index: number) =>
    town.ground[index] === plan.zones.street ||
    town.ground[index] === plan.zones.kerb ||
    (plan.zones.puddle !== undefined && town.ground[index] === plan.zones.puddle);
  const all = [...town.ground.keys()].filter(walkable);
  const seen = new Set([all[0]]);
  const queue = [all[0]];
  for (let head = 0; head < queue.length; head++) {
    const x = queue[head] % WIDTH;
    const y = Math.floor(queue[head] / WIDTH);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue;
      const next = ny * WIDTH + nx;
      if (!walkable(next) || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return { cells: all.length, joined: seen.size === all.length };
}

/** Whether a building stands with one side against the pavement. */
function facesPavement(town: TownGround, plan: TownPlan, building: FieldBuilding): boolean {
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT && town.ground[y * WIDTH + x] === plan.zones.kerb;
  for (let dx = 0; dx < building.w; dx++) {
    if (at(building.x + dx, building.y - 1) || at(building.x + dx, building.y + building.h)) return true;
  }
  for (let dy = 0; dy < building.h; dy++) {
    if (at(building.x - 1, building.y + dy) || at(building.x + building.w, building.y + dy)) return true;
  }
  return false;
}

function middleOf(building: FieldBuilding): number {
  return Math.hypot(building.x + building.w / 2 - WIDTH / 2, building.y + building.h / 2 - HEIGHT / 2);
}

describe('layTown()', () => {
  it('joins every street to every other, so the whole town can be walked', () => {
    for (const plan of TOWNS) {
      for (const seed of SEEDS) {
        const found = streets(layTown(plan, WIDTH, HEIGHT, seed, 50), plan);

        expect(found.cells).toBeGreaterThan(0);
        expect(found.joined).toBe(true);
      }
    }
  });

  it('puts every building on the board, on a lot, and never two on one cell', () => {
    for (const plan of TOWNS) {
      for (const seed of SEEDS) {
        const town = layTown(plan, WIDTH, HEIGHT, seed, 100);
        const taken = builtOn(town);

        expect(town.buildings.length).toBeGreaterThan(0);
        for (const building of town.buildings) {
          expect(building.x).toBeGreaterThanOrEqual(0);
          expect(building.y).toBeGreaterThanOrEqual(0);
          expect(building.x + building.w).toBeLessThanOrEqual(WIDTH);
          expect(building.y + building.h).toBeLessThanOrEqual(HEIGHT);
          expect(town.ground[building.y * WIDTH + building.x]).toBe(plan.zones.lot);
        }
        expect(Math.max(...taken)).toBe(1);
      }
    }
  });

  it('never builds on a lot too narrow to hold more than a sliver, nor on one bigger than the plan allows', () => {
    for (const plan of TOWNS) {
      const widest = Math.max(plan.lot.most + plan.lot.least - 1, plan.frontage ?? 0);
      for (const seed of SEEDS) {
        for (const building of layTown(plan, WIDTH, HEIGHT, seed, 100).buildings) {
          expect(Math.min(building.w, building.h)).toBeGreaterThanOrEqual(2);
          expect(Math.max(building.w, building.h)).toBeLessThanOrEqual(widest);
        }
      }
    }
  });

  it('builds each as tall as the plan allows and no taller, in one of the facades it offers', () => {
    for (const plan of TOWNS) {
      const worn = new Set<number>();
      for (const seed of SEEDS) {
        for (const building of layTown(plan, WIDTH, HEIGHT, seed, 50).buildings) {
          expect(building.height).toBeGreaterThanOrEqual(plan.storeys.least);
          expect(building.height).toBeLessThanOrEqual(plan.storeys.most);
          worn.add(building.skin);
        }
      }
      expect([...worn].sort()).toEqual(plan.skins.map((_, index) => index));
    }
  });

  it('raises the tallest towers in the middle of a city', () => {
    for (const plan of [CITY, FUTURE]) {
      for (const seed of SEEDS) {
        const buildings = layTown(plan, WIDTH, HEIGHT, seed, 100).buildings;
        const byNearness = [...buildings].sort((left, right) => middleOf(left) - middleOf(right));
        const half = Math.floor(byNearness.length / 2);
        const mean = (some: FieldBuilding[]) => some.reduce((sum, each) => sum + each.height, 0) / some.length;

        expect(mean(byNearness.slice(0, half))).toBeGreaterThan(mean(byNearness.slice(half)));
      }
    }
  });

  it('sets a tall tower back from the edge of its lot on a podium, and a row house not at all', () => {
    const buildings = SEEDS.flatMap((seed) => layTown(CITY, WIDTH, HEIGHT, seed, 100).buildings);
    const podiums = buildings.filter((building) => building.podium > 0);

    expect(podiums.length).toBeGreaterThan(0);
    for (const building of podiums) {
      expect(building.height).toBeGreaterThan(CITY.setbackAbove!);
      expect(Math.min(building.w, building.h)).toBeGreaterThanOrEqual(4);
      expect(building.podium).toBeLessThan(building.height);
    }
    for (const building of layTown(ROWS, WIDTH, HEIGHT, 42, 100).buildings) expect(building.podium).toBe(0);
  });

  it('puts what stands on a roof on that roof, and on the tower rather than the podium', () => {
    const buildings = SEEDS.flatMap((seed) => layTown(CITY, WIDTH, HEIGHT, seed, 100).buildings);
    const planted = buildings.filter((building) => building.plant);

    expect(planted.length).toBeGreaterThan(0);
    for (const building of planted) {
      const inset = building.podium > 0 ? 1 : 0;
      expect(building.plant!.x).toBeGreaterThanOrEqual(building.x + inset);
      expect(building.plant!.x).toBeLessThan(building.x + building.w - inset);
      expect(building.plant!.y).toBeGreaterThanOrEqual(building.y + inset);
      expect(building.plant!.y).toBeLessThan(building.y + building.h - inset);
    }
  });

  it('lines a block of row houses with them along the pavement and keeps the yards behind them', () => {
    for (const seed of SEEDS) {
      const town = layTown(ROWS, WIDTH, HEIGHT, seed, 100);
      const taken = builtOn(town);
      const yards = [...town.ground.keys()].filter((index) => town.ground[index] === ROWS.zones.lot && !taken[index]);

      for (const building of town.buildings) expect(facesPavement(town, ROWS, building)).toBe(true);
      expect(town.buildings.some((building) => Math.min(building.w, building.h) === ROWS.frontage)).toBe(true);
      expect(yards.length).toBeGreaterThan(0);
    }
  });

  it('builds more of the lots up the higher the density', () => {
    for (const plan of TOWNS) {
      const count = (density: number) =>
        SEEDS.reduce((sum, seed) => sum + layTown(plan, WIDTH, HEIGHT, seed, density).buildings.length, 0);

      expect(count(0)).toBeLessThan(count(50));
      expect(count(50)).toBeLessThan(count(100));
    }
  });

  it('runs the avenues of a planned town straight across the board', () => {
    for (const plan of [CITY, FUTURE, ROWS]) {
      const town = layTown(plan, WIDTH, HEIGHT, 42, 100);
      const taken = builtOn(town);
      const open = (x: number) => [...Array(HEIGHT).keys()].every((y) => taken[y * WIDTH + x] === 0);

      expect([...Array(WIDTH).keys()].some(open)).toBe(true);
    }
  });

  it('lets the lanes of the dump wander, where no avenue runs straight across it', () => {
    const straight = (town: TownGround) => {
      const taken = builtOn(town);
      return [...Array(WIDTH).keys()].filter((x) => [...Array(HEIGHT).keys()].every((y) => taken[y * WIDTH + x] === 0))
        .length;
    };

    expect(SEEDS.some((seed) => straight(layTown(DUMP, WIDTH, HEIGHT, seed, 100)) === 0)).toBe(true);
  });

  it('knocks the shacks of the dump off square, and leaves every other town square to its streets', () => {
    const shacks = SEEDS.flatMap((seed) => layTown(DUMP, WIDTH, HEIGHT, seed, 50).buildings);

    expect(shacks.some((shack) => shack.spin !== 0)).toBe(true);
    expect(shacks.every((shack) => Math.abs(shack.spin) <= DUMP.spin!)).toBe(true);
    for (const plan of [CITY, FUTURE, ROWS]) {
      for (const building of layTown(plan, WIDTH, HEIGHT, 42, 50).buildings) expect(building.spin).toBe(0);
    }
  });

  it('floods only the lanes of the dump, and about as much of them as the plan says', () => {
    for (const seed of SEEDS) {
      const town = layTown(DUMP, WIDTH, HEIGHT, seed, 50);
      const flooded = [...town.ground].filter((band) => band === DUMP.zones.puddle).length;
      const street = [...town.ground].filter((band) => band === DUMP.zones.street).length;

      expect(flooded / (flooded + street)).toBeCloseTo(DUMP.puddles!, 1);
      for (const building of town.buildings) {
        expect(town.ground[building.y * WIDTH + building.x]).not.toBe(DUMP.zones.puddle);
      }
    }
    for (const plan of [CITY, FUTURE, ROWS]) {
      expect([...layTown(plan, WIDTH, HEIGHT, 42, 50).ground].every((band) => band <= 2)).toBe(true);
    }
  });

  it('lays out the same town twice for one seed, and another for another', () => {
    expect(layTown(CITY, WIDTH, HEIGHT, 42, 50)).toEqual(layTown(CITY, WIDTH, HEIGHT, 42, 50));
    expect(layTown(CITY, WIDTH, HEIGHT, 42, 50)).not.toEqual(layTown(CITY, WIDTH, HEIGHT, 43, 50));
  });
});

describe('a town on the table', () => {
  it('builds a building as one block on squares, and a podium with its tower on top', () => {
    const plan = planField({ atmosphere: 'city', size: 40, density: 100, seed: 42 });
    const blocks = plan.blocks.blocks.filter((block) => block.thing === 'building');
    const stepped = plan.layout.buildings.filter((building) => building.podium > 0);

    expect(blocks.length).toBe(plan.layout.buildings.length + stepped.length);
    for (const building of stepped) {
      const tower = blocks.find(
        (block) => block.rect.x === building.x + 1 && block.rect.y === building.y + 1 && block.altitude
      )!;
      expect(tower.altitude).toBe(building.podium);
      expect(tower.height).toBeCloseTo(building.height - building.podium);
      expect(tower.rect.w).toBe(building.w - 2);
    }
    for (const building of plan.layout.buildings) {
      const block = blocks.find((each) => each.rect.x === building.x && each.rect.y === building.y)!;
      expect(block.blocksSight).toBe(true);
      expect(block.skin?.side).toEqual({ kind: 'texture', id: CITY.skins[building.skin].side });
      expect(block.skin?.top).toEqual({ kind: 'texture', id: CITY.skins[building.skin].top });
    }
  });

  it('builds a column to a cell on hexes, the edge of a podium standing only as tall as the podium', () => {
    const plan = planField({ atmosphere: 'city', size: 60, density: 100, seed: 42, gridType: GridType.HEX_VERTICAL });
    const blocks = plan.blocks.blocks.filter((block) => block.thing === 'building');
    const cells = plan.layout.buildings.reduce((sum, building) => sum + building.w * building.h, 0);

    expect(blocks.length).toBe(cells);
    expect(blocks.every((block) => block.rect.w === 1 && block.rect.h === 1 && !block.altitude)).toBe(true);
    const stepped = plan.layout.buildings.find((building) => building.podium > 0);
    if (stepped) {
      const heightAt = (x: number, y: number) =>
        blocks.find((block) => block.rect.x === x && block.rect.y === y)!.height;
      expect(heightAt(stepped.x, stepped.y)).toBe(stepped.podium);
      expect(heightAt(stepped.x + 1, stepped.y + 1)).toBe(stepped.height);
    }
  });

  it('stands a roof unit on top of its roof, in steel the building material leaves alone', () => {
    const plan = planField({ atmosphere: 'city', size: 40, density: 100, seed: 42 });
    const units = plan.blocks.blocks.filter((block) => block.thing === 'roofUnit');
    const planted = plan.layout.buildings.filter((building) => building.plant);

    expect(units.length).toBe(planted.length);
    for (const building of planted) {
      const unit = units.find((each) => each.rect.x === building.plant!.x && each.rect.y === building.plant!.y)!;
      expect(unit.altitude).toBe(building.height);
      expect(unit.skin?.side.kind === 'texture' && unit.skin.side.id).toBe('metal_grate');
    }
  });

  it('sets a shack of the dump in from the edge of its lot and turns it the way it stands', () => {
    const plan = planField({ atmosphere: 'dump', size: 40, density: 50, seed: 42 });
    const shack = plan.layout.buildings.find((building) => building.spin !== 0)!;
    const block = plan.blocks.blocks.find(
      (each) => each.thing === 'building' && each.rect.x === shack.x && each.rect.y === shack.y
    )!;

    expect(block.rotate).toBe(shack.spin);
    expect(block.footprint).toEqual({ w: shack.w - DUMP.inset! * 2, d: shack.h - DUMP.inset! * 2 });
  });

  it('keeps the water of an old walk-up in a wooden tank on its roof', () => {
    const plan = planField({ atmosphere: 'slum', size: 40, density: 100, seed: 42 });
    const units = plan.blocks.blocks.filter((block) => block.thing === 'roofUnit');

    expect(units.length).toBeGreaterThan(0);
    for (const unit of units) expect(unit.skin?.side).toEqual({ kind: 'texture', id: 'wood_plank' });
  });

  it('lights its pavements by the lamps of the place, in the colours it asks for', () => {
    for (const seed of SEEDS) {
      for (const [id, kinds] of [
        ['city', ['streetlamp']],
        ['sfCity', ['neonpole']],
        ['slum', ['streetlamp', 'brazier']],
        ['dump', ['brazier', 'campfire']],
      ] as const) {
        const plan = planField({ atmosphere: id, size: 40, density: 50, seed });
        const fires = FIELD_ATMOSPHERES[id].fires!;

        expect(plan.blocks.lights.length).toBeGreaterThan(0);
        plan.blocks.lights.forEach((light, index) => {
          const at = light.y * plan.layout.width + light.x;
          expect(kinds as readonly string[]).toContain(light.kind);
          expect(fires.bands).toContain(plan.layout.ground[at]);
          expect(plan.layout.props[at]).toBe('');
          expect(light.color).toBe(fires.colors?.[index % fires.colors.length]);
        });
      }
    }
  });

  it('plants the squares of a city, and trees along the pavements of the row houses', () => {
    const city = planField({ atmosphere: 'city', size: 60, density: 50, seed: 7 });
    const rows = planField({ atmosphere: 'slum', size: 40, density: 50, seed: 7 });
    const bushes = city.layout.props.flatMap((mark, index) => (mark === 'bush' ? [index] : []));
    const trees = rows.layout.objects.filter((object) => object.prop === 'streetTree');

    expect(bushes.length).toBeGreaterThan(0);
    for (const index of bushes) expect(city.layout.ground[index]).toBe(CITY.zones.lot);
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees) expect(rows.layout.ground[tree.y * rows.layout.width + tree.x]).toBe(ROWS.zones.kerb);
    for (const plan of [city, rows]) {
      for (const object of plan.layout.objects) {
        expect(plan.layout.props[object.y * plan.layout.width + object.x]).not.toBe('building');
      }
    }
  });
});
