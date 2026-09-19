import { FIELD_ATMOSPHERES, TownPlan } from '@axe/domain/tabletop/field/field-atmosphere';
import { planField } from '@axe/domain/tabletop/field/field-generator';
import { FieldBuilding, layTown, TownGround } from '@axe/domain/tabletop/field/town-layout';
import { GridType } from '@axe/domain/tabletop/game-table';

const SEEDS = [1, 7, 42, 1234, 99999];
const CITY = FIELD_ATMOSPHERES.city.town!;
const SLUM = FIELD_ATMOSPHERES.slum.town!;
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

/** How many cells of street there are, and whether the streets all join up. */
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

function middleOf(building: FieldBuilding): number {
  return Math.hypot(building.x + building.w / 2 - WIDTH / 2, building.y + building.h / 2 - HEIGHT / 2);
}

describe('layTown()', () => {
  it('joins every street to every other, so the whole town can be walked', () => {
    for (const plan of [CITY, SLUM]) {
      for (const seed of SEEDS) {
        const found = streets(layTown(plan, WIDTH, HEIGHT, seed, 50), plan);

        expect(found.cells).toBeGreaterThan(0);
        expect(found.joined).toBe(true);
      }
    }
  });

  it('puts every building on the board, on a lot, and never two on one cell', () => {
    for (const plan of [CITY, SLUM]) {
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

  it('never builds on a lot too narrow to hold more than a sliver', () => {
    for (const plan of [CITY, SLUM]) {
      for (const seed of SEEDS) {
        for (const building of layTown(plan, WIDTH, HEIGHT, seed, 100).buildings) {
          expect(Math.min(building.w, building.h)).toBeGreaterThanOrEqual(2);
          expect(Math.max(building.w, building.h)).toBeLessThanOrEqual(plan.lot.most);
        }
      }
    }
  });

  it('builds each as tall as the plan allows and no taller', () => {
    for (const plan of [CITY, SLUM]) {
      for (const seed of SEEDS) {
        for (const building of layTown(plan, WIDTH, HEIGHT, seed, 50).buildings) {
          expect(building.height).toBeGreaterThanOrEqual(plan.storeys.least);
          expect(building.height).toBeLessThanOrEqual(plan.storeys.most);
        }
      }
    }
  });

  it('raises the tallest towers in the middle of a city', () => {
    for (const seed of SEEDS) {
      const buildings = layTown(CITY, WIDTH, HEIGHT, seed, 100).buildings;
      const byNearness = [...buildings].sort((left, right) => middleOf(left) - middleOf(right));
      const half = Math.floor(byNearness.length / 2);
      const mean = (some: FieldBuilding[]) => some.reduce((sum, each) => sum + each.height, 0) / some.length;

      expect(mean(byNearness.slice(0, half))).toBeGreaterThan(mean(byNearness.slice(half)));
    }
  });

  it('sets a tall tower back from the edge of its lot on a podium, and a short one not at all', () => {
    const buildings = SEEDS.flatMap((seed) => layTown(CITY, WIDTH, HEIGHT, seed, 100).buildings);
    const podiums = buildings.filter((building) => building.podium > 0);

    expect(podiums.length).toBeGreaterThan(0);
    for (const building of podiums) {
      expect(building.height).toBeGreaterThan(CITY.setbackAbove!);
      expect(Math.min(building.w, building.h)).toBeGreaterThanOrEqual(4);
      expect(building.podium).toBeLessThan(building.height);
    }
    for (const building of layTown(SLUM, WIDTH, HEIGHT, 42, 100).buildings) expect(building.podium).toBe(0);
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

  it('knocks the shacks of a slum off square, and leaves a city square to its streets', () => {
    const shacks = SEEDS.flatMap((seed) => layTown(SLUM, WIDTH, HEIGHT, seed, 50).buildings);
    const towers = SEEDS.flatMap((seed) => layTown(CITY, WIDTH, HEIGHT, seed, 50).buildings);

    expect(shacks.some((shack) => shack.spin !== 0)).toBe(true);
    expect(shacks.every((shack) => Math.abs(shack.spin) <= SLUM.spin)).toBe(true);
    expect(towers.every((tower) => tower.spin === 0)).toBe(true);
  });

  it('builds more of the lots up the higher the density', () => {
    for (const plan of [CITY, SLUM]) {
      const count = (density: number) =>
        SEEDS.reduce((sum, seed) => sum + layTown(plan, WIDTH, HEIGHT, seed, density).buildings.length, 0);

      expect(count(0)).toBeLessThan(count(50));
      expect(count(50)).toBeLessThan(count(100));
    }
  });

  it('floods only the street, and about as much of it as the plan says', () => {
    for (const seed of SEEDS) {
      const town = layTown(SLUM, WIDTH, HEIGHT, seed, 50);
      const flooded = [...town.ground].filter((band) => band === SLUM.zones.puddle).length;
      const street = [...town.ground].filter((band) => band === SLUM.zones.street).length;

      expect(flooded / (flooded + street)).toBeCloseTo(SLUM.puddles!, 1);
      for (const building of town.buildings) {
        expect(town.ground[building.y * WIDTH + building.x]).not.toBe(SLUM.zones.puddle);
      }
    }
    expect([...layTown(CITY, WIDTH, HEIGHT, 42, 50).ground]).not.toContain(3);
  });

  it('lets the lanes of a slum wander, where the avenues of a city run straight across', () => {
    const straight = (town: TownGround) => {
      const columns = new Set<number>();
      for (let x = 0; x < WIDTH; x++) {
        let open = true;
        for (let y = 0; y < HEIGHT && open; y++) open = builtOn(town)[y * WIDTH + x] === 0;
        if (open) columns.add(x);
      }
      return columns.size;
    };

    expect(straight(layTown(CITY, WIDTH, HEIGHT, 42, 100))).toBeGreaterThan(0);
    expect(SEEDS.some((seed) => straight(layTown(SLUM, WIDTH, HEIGHT, seed, 100)) === 0)).toBe(true);
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
    for (const block of blocks) {
      expect(block.blocksSight).toBe(true);
      expect(block.skin?.side).toEqual({ kind: 'texture', id: 'wall_facade' });
      expect(block.skin?.top).toEqual({ kind: 'texture', id: 'rooftop' });
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

  it('sets a shack in from the edge of its lot and turns it the way it stands', () => {
    const plan = planField({ atmosphere: 'slum', size: 40, density: 50, seed: 42 });
    const shack = plan.layout.buildings.find((building) => building.spin !== 0)!;
    const block = plan.blocks.blocks.find(
      (each) => each.thing === 'building' && each.rect.x === shack.x && each.rect.y === shack.y
    )!;

    expect(block.rotate).toBe(shack.spin);
    expect(block.footprint).toEqual({ w: shack.w - SLUM.inset * 2, d: shack.h - SLUM.inset * 2 });
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

  it('lights a city by street lamps on its pavements, and a slum by fires in its lanes', () => {
    for (const seed of SEEDS) {
      const city = planField({ atmosphere: 'city', size: 40, density: 50, seed });
      const slum = planField({ atmosphere: 'slum', size: 40, density: 50, seed });

      expect(city.blocks.lights.length).toBeGreaterThan(0);
      for (const light of city.blocks.lights) {
        expect(light.kind).toBe('streetlamp');
        expect(city.layout.ground[light.y * city.layout.width + light.x]).toBe(CITY.zones.kerb);
      }
      for (const light of slum.blocks.lights) {
        expect(['brazier', 'campfire']).toContain(light.kind);
        expect(slum.layout.props[light.y * slum.layout.width + light.x]).toBe('');
      }
    }
  });

  it('plants the squares of a city and nothing where a building stands', () => {
    const plan = planField({ atmosphere: 'city', size: 60, density: 50, seed: 7 });
    const planted = plan.layout.props.flatMap((mark, index) => (mark === 'bush' ? [index] : []));

    expect(planted.length).toBeGreaterThan(0);
    for (const index of planted) expect(plan.layout.ground[index]).toBe(CITY.zones.lot);
    for (const object of plan.layout.objects) {
      expect(plan.layout.props[object.y * plan.layout.width + object.x]).not.toBe('building');
    }
  });
});
