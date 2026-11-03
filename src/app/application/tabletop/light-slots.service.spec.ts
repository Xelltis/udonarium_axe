import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LightSlotsService, SHADOW_LIGHT_SLOTS } from '@axe/application/tabletop/light-slots.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { GridType } from '@axe/domain/tabletop/game-table';
import type { SceneLight, VisionScene } from '@axe/domain/tabletop/vision-scene';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function lamp(id: string, x: number, castShadows = true): SceneLight {
  return {
    x,
    y: 375,
    z: 25,
    brightPx: 100,
    dimPx: 200,
    color: '#ffcc88',
    angle: 360,
    direction: 0,
    pitch: 0,
    revealToAll: false,
    castShadows,
    ignoreOcclusion: false,
    animation: 'none',
    sourceId: id,
    surface: 'floor',
  };
}

function sceneOf(lights: SceneLight[], darknessEnabled = true): VisionScene {
  return {
    darknessEnabled,
    fogEnabled: false,
    darknessLevel: 0.9,
    ambientColor: '#05060a',
    globalIllumination: 0,
    gridSize: 50,
    gridType: GridType.SQUARE,
    widthPx: 1000,
    heightPx: 750,
    lights,
    visionSources: [],
    sightSegments: [],
    lightSegments: [],
    shadowCasters: [],
  };
}

describe('LightSlotsService', () => {
  const scene = signal<VisionScene | null>(null);

  beforeEach(() => {
    scene.set(null);
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: VisionService, useValue: { scene } }],
    });
  });

  it('chooses the lights set to throw shadows nearest the middle of the board, as many as there are slots', () => {
    const slots = TestBed.inject(LightSlotsService);
    scene.set(sceneOf([lamp('edge', 20), lamp('middle', 500), lamp('beside', 650), lamp('quiet', 520, false)]));

    expect(slots.lights().map((light) => light.sourceId)).toEqual(['middle', 'beside'].slice(0, SHADOW_LIGHT_SLOTS));
    expect([...slots.ids()]).toEqual(['middle', 'beside'].slice(0, SHADOW_LIGHT_SLOTS));
  });

  it('chooses none on a table that is not dark', () => {
    const slots = TestBed.inject(LightSlotsService);
    scene.set(sceneOf([lamp('middle', 500)], false));

    expect(slots.lights()).toEqual([]);
  });
});
