import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { visibleCellsLightKey, VisibleCellsMemo, visionSourceKey } from '@axe/domain/tabletop/fog/visible-cells-memo';
import type { SceneLight, SceneVisionSource, VisionScene } from '@axe/domain/tabletop/vision-scene';
import { VisionType } from '@axe/domain/tabletop/vision-types';

function eyes(partial: Partial<SceneVisionSource> = {}): SceneVisionSource {
  return {
    x: 125,
    y: 125,
    z: 25,
    type: VisionType.NORMAL,
    rangePx: 300,
    owner: 'p1',
    sourceId: 'a',
    direction: 0,
    lobes: [{ angle: 360, direction: 0, rangeScale: 1 }],
    ...partial,
  };
}

function lamp(partial: Partial<SceneLight> = {}): SceneLight {
  return {
    x: 200,
    y: 200,
    z: 25,
    brightPx: 100,
    dimPx: 200,
    color: '#ffffff',
    angle: 360,
    direction: 0,
    pitch: 0,
    revealToAll: false,
    castShadows: true,
    ignoreOcclusion: false,
    animation: 'none',
    sourceId: 'lamp',
    surface: 'floor',
    ...partial,
  };
}

function scene(lights: SceneLight[]): VisionScene {
  return {
    darknessEnabled: true,
    fogEnabled: false,
    darknessLevel: 1,
    ambientColor: '#000000',
    globalIllumination: 0,
    gridSize: 50,
    widthPx: 500,
    heightPx: 500,
    lights,
    visionSources: [],
    sightSegments: [],
    lightSegments: [],
    shadowCasters: [],
  };
}

describe('visible-cells-memo', () => {
  describe('visionSourceKey', () => {
    it('is the same for eyes in the same place looking the same way, whoever owns them', () => {
      expect(visionSourceKey(eyes({ owner: 'p2', partyId: 'party' }))).toBe(visionSourceKey(eyes()));
    });

    it.each<[string, Partial<SceneVisionSource>]>([
      ['moved', { x: 175 }],
      ['raised', { z: 75 }],
      ['turned', { direction: 90 }],
      ['given darkvision', { type: VisionType.DARKVISION }],
      ['given a longer reach', { rangePx: 400 }],
      ['narrowed to a cone', { lobes: [{ angle: 90, direction: 0, rangeScale: 1 }] }],
    ])('differs for eyes that are %s', (_, change) => {
      expect(visionSourceKey(eyes(change))).not.toBe(visionSourceKey(eyes()));
    });
  });

  describe('visibleCellsLightKey', () => {
    it('is the same for the same lights in a scene built again', () => {
      expect(visibleCellsLightKey(scene([lamp()]))).toBe(visibleCellsLightKey(scene([lamp()])));
    });

    it('ignores what a light does to the shadows and the colour, which a look does not read', () => {
      expect(visibleCellsLightKey(scene([lamp({ castShadows: false, color: '#ff0000' })]))).toBe(
        visibleCellsLightKey(scene([lamp()]))
      );
    });

    it('differs once a light moves, or the dark lifts', () => {
      expect(visibleCellsLightKey(scene([lamp({ x: 250 })]))).not.toBe(visibleCellsLightKey(scene([lamp()])));
      expect(visibleCellsLightKey({ ...scene([lamp()]), darknessEnabled: false })).not.toBe(
        visibleCellsLightKey(scene([lamp()]))
      );
    });
  });

  describe('VisibleCellsMemo', () => {
    const grid = {};
    const walls = {};

    it('hands back the cells it has for eyes that have not changed', () => {
      const memo = new VisibleCellsMemo();
      const work = vi.fn(() => new CellBits(16));

      const first = memo.recall('a', 'here', [grid, walls, 'lit'], work);
      const second = memo.recall('a', 'here', [grid, walls, 'lit'], work);

      expect(second).toBe(first);
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('works them out again for eyes that have moved', () => {
      const memo = new VisibleCellsMemo();
      const work = vi.fn(() => new CellBits(16));

      memo.recall('a', 'here', [grid, walls, 'lit'], work);
      memo.recall('a', 'there', [grid, walls, 'lit'], work);

      expect(work).toHaveBeenCalledTimes(2);
    });

    it('trusts nothing it kept once what the eyes look through has changed', () => {
      const memo = new VisibleCellsMemo();
      const work = vi.fn(() => new CellBits(16));

      memo.recall('a', 'here', [grid, walls, 'lit'], work);
      memo.recall('a', 'here', [grid, {}, 'lit'], work);
      memo.recall('a', 'here', [grid, {}, 'dark'], work);

      expect(work).toHaveBeenCalledTimes(3);
    });

    it('lets go of eyes that have left the table', () => {
      const memo = new VisibleCellsMemo();
      const work = vi.fn(() => new CellBits(16));

      memo.recall('a', 'here', [grid, walls, 'lit'], work);
      memo.keepOnly(new Set(['b']));
      memo.recall('a', 'here', [grid, walls, 'lit'], work);

      expect(work).toHaveBeenCalledTimes(2);
    });
  });
});
