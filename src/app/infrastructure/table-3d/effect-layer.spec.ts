import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { EffectLayer, nearerOf } from '@axe/infrastructure/table-3d/effect-layer';
import { type InstancedBufferGeometry, type Mesh } from 'three/webgpu';

function mote(fields: Partial<EffectMote>): EffectMote {
  return { x: 10, y: 20, z: 30, size: 40, color: '#ff8800', alpha: 0.5, blend: 'color', shape: 'puff', ...fields };
}

/** What the layer tells the shader of each particle of a blend it draws: shape, spin, variant and how far nearer the eye. */
function looksOf(layer: EffectLayer, blend: 'light' | 'color'): number[][] {
  const meshes = layer.group.children.filter((object) => (object as Mesh).isMesh) as Mesh[];
  const batch = meshes
    .map((mesh) => mesh.geometry as InstancedBufferGeometry)
    .filter((geometry) => geometry.getAttribute('motion') !== undefined)[blend === 'light' ? 0 : 1];
  const look = batch.getAttribute('look').array;
  return Array.from({ length: batch.instanceCount }, (_unused, index) => [...look.slice(index * 4, index * 4 + 4)]);
}

describe('nearerOf()', () => {
  it('tells a particle drawn the usual way by how far it is set towards the eye, never below nothing', () => {
    expect(nearerOf({ forward: 12 })).toBe(12);
    expect(nearerOf({})).toBe(0);
    expect(nearerOf({ forward: -3 })).toBe(0);
  });

  it('tells a particle held to its own depth apart, below nothing, with how far it is set', () => {
    expect(nearerOf({ forward: 12, exactDepth: true })).toBe(-13);
    expect(nearerOf({ exactDepth: true })).toBe(-1);
    expect(nearerOf({ forward: 0.2, exactDepth: true })).toBeLessThan(0);
  });
});

describe('EffectLayer', () => {
  it('draws each particle in the batch of its blend, those held to their own depth told apart from the rest', () => {
    const layer = new EffectLayer();

    layer.set({
      motes: [
        mote({ forward: 8 }),
        mote({ forward: 8, exactDepth: true }),
        mote({ blend: 'light', shape: 'glow', forward: 5 }),
        mote({ blend: 'light', shape: 'glow', exactDepth: true }),
      ],
      ribbons: [],
      floor: [],
      lights: [],
    });

    expect(looksOf(layer, 'color').map((look) => look[3])).toEqual([8, -9]);
    expect(looksOf(layer, 'light').map((look) => look[3])).toEqual([5, -1]);
    expect(layer.shown).toBe(4);
    expect(layer.takeChanged()).toBe(true);
    layer.dispose();
  });

  it('draws nothing more once the effects are over', () => {
    const layer = new EffectLayer();
    layer.set({ motes: [mote({})], ribbons: [], floor: [], lights: [] });
    layer.set({ motes: [], ribbons: [], floor: [], lights: [] });

    expect(layer.shown).toBe(0);
    layer.dispose();
  });
});
