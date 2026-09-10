import {
  collectLights,
  collectSegments,
  collectShadowCasters,
  collectVisionSources,
  toSceneLight,
} from '@axe/application/tabletop/vision-scene-assembly';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { segmentBlocks } from '@axe/domain/tabletop/los/segments';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { LightSpec } from '@axe/domain/tabletop/vision-types';

function makeTable(): GameTable {
  const table = new GameTable();
  table.width = 10;
  table.height = 8;
  table.gridSize = 50;
  table.wallHeight = 4;
  table.initialize();
  return table;
}

function standing(name: string, x: number, y: number): GameCharacter {
  const character = GameCharacter.create(name, 1, '');
  character.location.x = x;
  character.location.y = y;
  return character;
}

describe('vision scene assembly', () => {
  it('walls the table with the perimeter and only the walls that are shown', () => {
    const table = makeTable();
    table.showNorthWall = true;
    table.showEastWall = true;
    const segments = collectSegments(table, 50, 500, 400);

    expect(segments.sight).toHaveLength(4);
    expect(segments.light).toEqual([
      { x1: 0, y1: 0, x2: 500, y2: 0, heightPx: 200 },
      { x1: 500, y1: 0, x2: 500, y2: 400, heightPx: 200 },
    ]);
  });

  it('adds the edges of a walled terrain at the height of its top', () => {
    const table = makeTable();
    const terrain = Terrain.create('壁', 2, 1, 1, '', '');
    terrain.location.x = 100;
    terrain.location.y = 100;
    terrain.altitude = 1;
    table.appendChild(terrain);

    const segments = collectSegments(table, 50, 500, 400);
    expect(segments.sight).toHaveLength(8);
    expect(segments.sight[4].heightPx).toBe(100);
  });

  it('gives the edges a bottom as well, so an arch can be seen under', () => {
    const table = makeTable();
    const arch = Terrain.create('アーチ', 2, 1, 1, '', '');
    arch.location.x = 100;
    arch.location.y = 100;
    arch.altitude = 3;
    table.appendChild(arch);

    const segments = collectSegments(table, 50, 500, 400);

    const wall = segments.sight.slice(4).find((seg) => seg.x1 === 100 && seg.x2 === 100)!;
    expect(wall.basePx).toBe(150);
    expect(wall.heightPx).toBe(200);
    expect(segmentBlocks(50, 125, 25, 400, 125, 25, wall)).toBe(false);
    expect(segmentBlocks(50, 125, 175, 400, 125, 175, wall)).toBe(true);
  });

  it('reads a block resting on something at the height it really stands', () => {
    const table = makeTable();
    const terrain = Terrain.create('棚', 2, 1, 1, '', '');
    terrain.location.x = 100;
    terrain.location.y = 100;
    terrain.altitude = 1;
    terrain.posZ = 25;
    table.appendChild(terrain);

    const segments = collectSegments(table, 50, 500, 400);

    expect(segments.sight[4].heightPx).toBe(125);
  });

  it('turns a light spec into pixels, keeping the direction it was given', () => {
    const spec = {
      brightRadius: 2,
      dimRadius: 4,
      color: '#fff',
      angle: 360,
      direction: 45,
      pitch: 0,
      revealToAll: false,
      castShadows: true,
      ignoreOcclusion: false,
      animation: 'none',
    } as unknown as LightSpec;
    const light = toSceneLight(spec, 10, 20, 30, 50, 'l1', 90, 'north-wall');
    expect(light).toEqual(expect.objectContaining({ brightPx: 100, dimPx: 200, direction: 90, surface: 'north-wall' }));
    expect(toSceneLight(spec, 0, 0, 0, 50, 'l2').direction).toBe(45);
  });

  it('hangs a character light at eye height in the middle of the piece', () => {
    const table = makeTable();
    const torch = standing('Torch', 200, 200);
    torch.altitude = 2;
    torch.lightEnabled = true;
    torch.lightDimRadius = 4;
    const dark = standing('Dark', 0, 0);

    const lights = collectLights(table, [torch, dark], 50, () => null);
    expect(lights).toHaveLength(1);
    expect(lights[0]).toEqual(expect.objectContaining({ x: 225, y: 225, sourceId: torch.identifier }));
    expect(lights[0].z).toBeCloseTo((2 + 0.5) * 50);
  });

  it('casts shadows only from visible floor pieces that ask to', () => {
    const caster = standing('Caster', 100, 100);
    caster.castsShadow = true;
    const onWall = standing('Wall', 200, 100);
    onWall.location.surface = 'north-wall';
    onWall.castsShadow = true;
    const quiet = standing('Quiet', 300, 100);
    quiet.castsShadow = false;

    const casters = collectShadowCasters([caster, onWall, quiet], 50);
    expect(casters.map((c) => c.ownerId)).toEqual([caster.identifier]);
    expect(casters[0]).toEqual(expect.objectContaining({ x: 125, y: 125, radiusPx: 25 }));
  });

  it('gives every visible floor character eyes at its centre', () => {
    const seer = standing('Seer', 100, 100);
    seer.visionRange = 4;
    seer.owner = 'p1';
    const sources = collectVisionSources([seer], 50);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual(
      expect.objectContaining({ x: 125, y: 125, rangePx: 200, owner: 'p1', sourceId: seer.identifier })
    );
  });
});
