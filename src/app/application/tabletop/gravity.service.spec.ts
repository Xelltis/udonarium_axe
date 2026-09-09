import { TestBed } from '@angular/core/testing';
import { GravityService } from '@axe/application/tabletop/gravity.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopOverlapRegistryEntry, TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSurface, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
});

function makeTerrain(opts: {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  altitude?: number;
  posZ?: number;
  identifier?: string;
  surface?: TableSurface;
}): TabletopOverlapRegistryEntry {
  const terrain = Terrain.create('t', opts.w, opts.d, opts.h, '', '', opts.identifier ?? `terrain_${opts.x}_${opts.y}`);
  terrain.location.x = opts.x;
  terrain.location.y = opts.y;
  if (opts.surface) terrain.location.surface = opts.surface;
  terrain.posZ = opts.posZ ?? 0;
  void terrain.altitude;
  terrain.altitude = opts.altitude ?? 0;
  const element = document.createElement('div');
  Object.defineProperty(element, 'offsetWidth', { value: opts.w * 50, configurable: true });
  Object.defineProperty(element, 'offsetHeight', { value: opts.d * 50, configurable: true });
  return { object: terrain, element };
}

function makeCharacter(opts: {
  x: number;
  y: number;
  size?: number;
  altitude?: number;
  posZ?: number;
  identifier?: string;
}): TabletopOverlapRegistryEntry {
  const character = GameCharacter.create('c', opts.size ?? 1, '');
  if (opts.identifier) {
    (character as unknown as { identifier: string }).identifier = opts.identifier;
  }
  character.location.x = opts.x;
  character.location.y = opts.y;
  character.posZ = opts.posZ ?? 0;
  void character.altitude;
  character.altitude = opts.altitude ?? 0;
  const size = (opts.size ?? 1) * 50;
  const element = document.createElement('div');
  Object.defineProperty(element, 'offsetWidth', { value: size, configurable: true });
  Object.defineProperty(element, 'offsetHeight', { value: size, configurable: true });
  return { object: character, element };
}

describe('GravityService.topZ', () => {
  it('the top of terrain is (altitude + height) * gridSize + posZ', () => {
    const entry = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 2, altitude: 1, posZ: 25 });
    expect(GravityService.topZ(entry.object, 50)).toBe((1 + 2) * 50 + 25);
  });

  it('the top of a character is altitude * gridSize + posZ, with no height of its own', () => {
    const entry = makeCharacter({ x: 0, y: 0, altitude: 1, posZ: 10 });
    expect(GravityService.topZ(entry.object, 50)).toBe(1 * 50 + 10);
  });
});

describe('GravityService.contactTopZ', () => {
  it('on the floor it matches the top, altitude included', () => {
    const entry = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 2, altitude: 1, posZ: 25 });
    expect(GravityService.contactTopZ(entry.object, 'floor', 50)).toBe(GravityService.topZ(entry.object, 50));
  });

  it('on a wall it is the offset plus the terrain height, with no altitude', () => {
    const entry = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 2, altitude: 1, posZ: 25 });
    expect(GravityService.contactTopZ(entry.object, 'north-wall', 50)).toBe(25 + 2 * 50);
  });

  it('on a wall anything but terrain is the offset alone, with no depth', () => {
    const entry = makeCharacter({ x: 0, y: 0, altitude: 1, posZ: 10 });
    expect(GravityService.contactTopZ(entry.object, 'east-wall', 50)).toBe(10);
  });
});

describe('GravityService on a table with cells of its own size', () => {
  it('reads a block at the height its own table makes it', () => {
    const entry = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 2, altitude: 1, posZ: 0 });

    expect(GravityService.topZ(entry.object, 50)).toBe(150);
    expect(GravityService.topZ(entry.object, 100)).toBe(300);
  });
});

describe('GravityService.findSupportZ', () => {
  it('supports an object whose centre falls within the footprint of another', () => {
    const base = makeTerrain({ x: 0, y: 0, w: 4, d: 4, h: 2, identifier: 'base' });
    const target = makeTerrain({ x: 50, y: 50, w: 1, d: 1, h: 1, identifier: 'target', posZ: 100 });
    const z = GravityService.findSupportZ(target, [base, target], 50);
    expect(z).toBe(2 * 50);
  });

  it('takes the highest of several supports', () => {
    const low = makeTerrain({ x: 0, y: 0, w: 4, d: 4, h: 1, identifier: 'low' });
    const high = makeTerrain({ x: 0, y: 0, w: 4, d: 4, h: 3, identifier: 'high' });
    const target = makeTerrain({ x: 50, y: 50, w: 1, d: 1, h: 1, identifier: 'target', posZ: 200 });
    const z = GravityService.findSupportZ(target, [low, high, target], 50);
    expect(z).toBe(3 * 50);
  });

  it('ignores a footprint the centre falls outside of', () => {
    const base = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 2, identifier: 'base' });
    const target = makeTerrain({ x: 500, y: 500, w: 1, d: 1, h: 1, identifier: 'target', posZ: 100 });
    const z = GravityService.findSupportZ(target, [base, target], 50);
    expect(z).toBe(0);
  });

  it('never supports an object on itself', () => {
    const target = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 2, identifier: 'target', posZ: 100 });
    const z = GravityService.findSupportZ(target, [target], 50);
    expect(z).toBe(0);
  });

  it('ignores anything above it, so two objects cannot lift each other', () => {
    // A rests on B: A sits at 50, on top of B, which is one cell tall
    const lower = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 1, identifier: 'lower', posZ: 0 });
    const upper = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 1, identifier: 'upper', posZ: 50 });
    // the upper is supported at 50, the top of the lower
    expect(GravityService.findSupportZ(upper, [lower, upper], 50)).toBe(50);
    // the lower is supported by the ground, since the upper is above it
    expect(GravityService.findSupportZ(lower, [lower, upper], 50)).toBe(0);
  });

  it('two objects side by side on the ground support neither', () => {
    const a = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 1, identifier: 'a', posZ: 0 });
    const b = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 1, identifier: 'b', posZ: 0 });
    expect(GravityService.findSupportZ(a, [a, b], 50)).toBe(0);
    expect(GravityService.findSupportZ(b, [a, b], 50)).toBe(0);
  });
});

describe('GravityService.isAffectedByGravity', () => {
  it('terrain counts', () => {
    const entry = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 1 });
    expect(GravityService.isAffectedByGravity(entry.object)).toBe(true);
  });

  it('a character counts', () => {
    const entry = makeCharacter({ x: 0, y: 0 });
    expect(GravityService.isAffectedByGravity(entry.object)).toBe(true);
  });

  it('anything else on the table does not', () => {
    const obj = { identifier: 'x', altitude: 0, posZ: 0 } as unknown as TabletopObject;
    expect(GravityService.isAffectedByGravity(obj)).toBe(false);
  });
});

describe('applying gravity through the spatial index', () => {
  function setup(entries: TabletopOverlapRegistryEntry[]): GravityService {
    const overlap = TestBed.inject(TabletopOverlapService);
    for (const e of entries) overlap.register(e.object, e.element);
    return TestBed.inject(GravityService);
  }

  function applyNow(svc: GravityService): void {
    (svc as unknown as { apply(): void }).apply();
  }

  it('drops a character in the air onto the terrain below', () => {
    const base = makeTerrain({ x: 0, y: 0, w: 4, d: 4, h: 2, identifier: 'base' });
    const char = makeCharacter({ x: 50, y: 50, posZ: 300 });
    const svc = setup([base, char]);

    applyNow(svc);

    expect(char.object.posZ).toBe(2 * 50);
  });

  it('leaves distant terrain out, since the index never offers it', () => {
    const base = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 2, identifier: 'base' });
    const char = makeCharacter({ x: 2000, y: 2000, posZ: 300 });
    const svc = setup([base, char]);

    applyNow(svc);

    expect(char.object.posZ).toBe(0);
  });

  it('settles a stack several deep', () => {
    // a floating terrain over a base one cell tall, and a floating character over that
    const base = makeTerrain({ x: 0, y: 0, w: 2, d: 2, h: 1, identifier: 'base' });
    const stack = makeTerrain({ x: 0, y: 0, w: 2, d: 2, h: 1, identifier: 'stack', posZ: 300 });
    const char = makeCharacter({ x: 25, y: 25, posZ: 500 });
    const svc = setup([base, stack, char]);

    applyNow(svc);

    // the stack lands at 50 and the character at 100
    expect(stack.object.posZ).toBe(50);
    expect(char.object.posZ).toBe(50 + 50);
  });

  it('leaves a canopy at the height it was built, rather than stacking it on its trunk again', () => {
    // what the field generator builds: a post in the middle of the square, layers of leaves
    // over it at an altitude counted from the ground
    const trunk = makeTerrain({ x: 100, y: 100, w: 0.4, d: 0.4, h: 3, identifier: 'trunk' });
    const lower = makeTerrain({ x: 25, y: 25, w: 3, d: 3, h: 1, altitude: 3, identifier: 'lower' });
    const upper = makeTerrain({ x: 50, y: 50, w: 2, d: 2, h: 1, altitude: 4, identifier: 'upper' });
    const svc = setup([trunk, lower, upper]);

    applyNow(svc);

    expect(lower.object.posZ).toBe(0);
    expect(upper.object.posZ).toBe(0);
  });

  it('still drops terrain that was lifted into the air, down to what is under it', () => {
    const base = makeTerrain({ x: 0, y: 0, w: 4, d: 4, h: 2, identifier: 'base' });
    const falling = makeTerrain({ x: 50, y: 50, w: 1, d: 1, h: 1, altitude: 1, posZ: 300, identifier: 'falling' });
    const svc = setup([base, falling]);

    applyNow(svc);

    // its altitude covers one cell of the two the base stands, so the offset makes up the rest
    expect(falling.object.posZ).toBe(50);
  });

  it('carries a character up with the support, its altitude kept as clearance', () => {
    const base = makeTerrain({ x: 0, y: 0, w: 4, d: 4, h: 2, identifier: 'base' });
    const flying = makeCharacter({ x: 50, y: 50, altitude: 2, posZ: 300 });
    const svc = setup([base, flying]);

    applyNow(svc);

    expect(flying.object.posZ).toBe(100);
  });

  it('forces no reflow under a crowd of objects', () => {
    const entries: TabletopOverlapRegistryEntry[] = [];
    const ROWS = 10;
    const COLS = 10;
    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        entries.push(makeTerrain({ x: i * 60, y: j * 60, w: 1, d: 1, h: 1, identifier: `t_${i}_${j}` }));
      }
    }
    // one floating object whose centre sits over the terrain
    const flying = makeCharacter({ x: 5, y: 5, posZ: 400 });
    entries.push(flying);

    const svc = setup(entries);

    // count the layout reads during one pass; the cache should mean no extra ones
    let postCacheReads = 0;
    const counted = new WeakSet<HTMLElement>();
    for (const e of entries) {
      const el = e.element;
      const fixed = el.offsetWidth;
      Object.defineProperty(el, 'offsetWidth', {
        configurable: true,
        get() {
          if (counted.has(el)) postCacheReads++;
          counted.add(el);
          return fixed;
        },
      });
    }

    applyNow(svc);

    // each element is measured once per pass, while the cache is built
    expect(postCacheReads).toBe(0);
    expect(flying.object.posZ).toBe(50);
  });

  it('measures terrain from its own footprint rather than from the page', () => {
    const base = makeTerrain({ x: 0, y: 0, w: 2, d: 2, h: 1, identifier: 'base' });
    Object.defineProperty(base.element, 'offsetWidth', { value: 0, configurable: true });
    Object.defineProperty(base.element, 'offsetHeight', { value: 0, configurable: true });
    const char = makeCharacter({ x: 25, y: 25, posZ: 200 });
    const svc = setup([base, char]);

    applyNow(svc);

    expect(char.object.posZ).toBe(50);
  });

  it('can be scheduled again once the microtasks from the last pass have drained', async () => {
    const base = makeTerrain({ x: 0, y: 0, w: 1, d: 1, h: 1, identifier: 'base' });
    const char = makeCharacter({ x: 25, y: 25, posZ: 200 });
    const svc = setup([base, char]);

    applyNow(svc);
    expect((svc as unknown as { applying: boolean }).applying).toBe(true);

    // wait for the drain, which is when a real message or pointer event would arrive
    await Promise.resolve();
    await Promise.resolve();

    expect((svc as unknown as { applying: boolean }).applying).toBe(false);
  });

  function selectTable(opts: { width: number; height: number; wallHeight: number }): void {
    const table = new GameTable();
    table.initialize();
    table.width = opts.width;
    table.height = opts.height;
    table.wallHeight = opts.wallHeight;
    table.gridSize = 50;
    TestBed.inject(TabletopService).tableSelecter.viewTableIdentifier = table.identifier;
  }

  it('lands a character on top of a beam reaching out from a wall', () => {
    selectTable({ width: 10, height: 10, wallHeight: 10 });
    // a beam on the north wall reaching four cells into the room
    // which occupies x[100,200] y[0,200] z[450,500], with its top at 500
    const beam = makeTerrain({ x: 100, y: 0, w: 2, d: 1, h: 4, identifier: 'beam', surface: 'north-wall' });
    // a floating character directly over the beam
    const char = makeCharacter({ x: 125, y: 75, posZ: 700 });
    const svc = setup([beam, char]);

    applyNow(svc);

    expect(char.object.posZ).toBe(500);
  });

  it('leaves a character beyond the reach of the beam off it', () => {
    selectTable({ width: 10, height: 10, wallHeight: 10 });
    const beam = makeTerrain({ x: 100, y: 0, w: 2, d: 1, h: 4, identifier: 'beam', surface: 'north-wall' });
    // the centre falls outside the beam's footprint
    const char = makeCharacter({ x: 125, y: 400, posZ: 700 });
    const svc = setup([beam, char]);

    applyNow(svc);

    expect(char.object.posZ).toBe(0);
  });

  it('leaves terrain on a wall where it is; only the floor pulls', () => {
    selectTable({ width: 10, height: 10, wallHeight: 10 });
    const beam = makeTerrain({ x: 100, y: 0, w: 2, d: 1, h: 4, identifier: 'beam', surface: 'north-wall', posZ: 120 });
    const svc = setup([beam]);

    applyNow(svc);

    expect(beam.object.posZ).toBe(120);
  });
});
