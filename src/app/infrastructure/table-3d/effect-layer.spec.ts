import { type EffectMote, type EffectRibbon, sealSeedOf } from '@axe/domain/effect/scene/effect-scene';
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

/** The colour of its middle the layer tells the shader of each particle of the batch of colour, and whether it has one. */
function coresOf(layer: EffectLayer): number[][] {
  const meshes = layer.group.children.filter((object) => (object as Mesh).isMesh) as Mesh[];
  const batch = meshes
    .map((mesh) => mesh.geometry as InstancedBufferGeometry)
    .filter((geometry) => geometry.getAttribute('motion') !== undefined)[1];
  const core = batch.getAttribute('core').array;
  return Array.from({ length: batch.instanceCount }, (_unused, index) => [...core.slice(index * 4, index * 4 + 4)]);
}

function ribbon(fields: Partial<EffectRibbon>): EffectRibbon {
  return { points: [], widths: 10, color: '#ffffff', alpha: 1, blend: 'color', ...fields };
}

/** A point so far east along a level line. */
function at(x: number): { x: number; y: number; z: number } {
  return { x, y: 0, z: 0 };
}

/** What the layer tells the shader of each of so many points of the bands of colour it draws, two to a point along a band. */
function bandsOf(layer: EffectLayer, name: 'fray' | 'hub', points: number): number[][] {
  const meshes = layer.group.children.filter((object) => (object as Mesh).isMesh) as Mesh[];
  const batch = meshes
    .map((mesh) => mesh.geometry)
    .filter((geometry) => geometry.getAttribute('spine') !== undefined)[1];
  const values = batch.getAttribute(name).array;
  return Array.from({ length: points * 2 }, (_unused, index) => [...values.slice(index * 4, index * 4 + 4)]);
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

  it('tells a shape that flows how far its pattern has run as it is, and turns every other shape within one round', () => {
    const layer = new EffectLayer();

    layer.set({
      motes: [
        mote({ shape: 'lick', spin: 20 }),
        mote({ shape: 'gust', spin: 31.5 }),
        mote({ shape: 'chunk', spin: 20 }),
      ],
      ribbons: [],
      floor: [],
      lights: [],
    });
    const [lick, gust, chunk] = looksOf(layer, 'color');

    expect(lick[1]).toBeCloseTo(20, 5);
    expect(gust[1]).toBeCloseTo(31.5, 5);
    expect(chunk[1]).toBeCloseTo(20 - Math.PI * 6, 5);
    expect(lick[0]).toBeLessThan(gust[0]);
    expect(chunk[0]).toBeLessThan(lick[0]);
    layer.dispose();
  });

  it('tells a blaze and a billow how far their pattern has rolled as it is, after every shape there was before them', () => {
    const layer = new EffectLayer();

    layer.set({
      motes: [
        mote({ shape: 'gust', spin: 1 }),
        mote({ shape: 'blaze', spin: 44.25 }),
        mote({ shape: 'billow', spin: 19.5 }),
      ],
      ribbons: [],
      floor: [],
      lights: [],
    });
    const [gust, blaze, billow] = looksOf(layer, 'color');

    expect(blaze[1]).toBeCloseTo(44.25, 4);
    expect(billow[1]).toBeCloseTo(19.5, 4);
    expect(blaze[0]).toBe(gust[0] + 1);
    expect(billow[0]).toBe(gust[0] + 2);
    layer.dispose();
  });

  it('tells a crag what its spin holds as it is, how much of it is broken off and how far it is veined, as no turn is', () => {
    const layer = new EffectLayer();

    layer.set({
      motes: [
        mote({ shape: 'crag', spin: 72.4 }),
        mote({ shape: 'plume', spin: 72.4 }),
        mote({ shape: 'lick', spin: 1 }),
      ],
      ribbons: [],
      floor: [],
      lights: [],
    });
    const [crag, plume, lick] = looksOf(layer, 'color');

    expect(crag[1]).toBeCloseTo(72.4, 4);
    expect(plume[1]).toBeLessThan(Math.PI * 2);
    expect(plume[0]).toBeLessThan(crag[0]);
    expect(crag[0]).toBeLessThan(lick[0]);
    layer.dispose();
  });

  it('tells a crystal of ice what its spin holds as it is, as a shape of its own after those that flow', () => {
    const layer = new EffectLayer();

    layer.set({
      motes: [mote({ shape: 'billow', spin: 3 }), mote({ shape: 'crystal', spin: 40.6 })],
      ribbons: [],
      floor: [],
      lights: [],
    });
    const [billow, crystal] = looksOf(layer, 'color');

    expect(crystal[1]).toBeCloseTo(40.6, 4);
    expect(crystal[0]).toBe(billow[0] + 1);
    layer.dispose();
  });

  it('lays a rime as a mark of its own kind, as thick as it is told', () => {
    const layer = new EffectLayer();
    const mark = {
      x: 1,
      y: 2,
      z: 3,
      radius: 40,
      width: 0.6,
      color: '#eaf8ff',
      alpha: 1,
      blend: 'color',
      turn: 0,
      seed: 4,
    } as const;

    layer.set({
      motes: [],
      ribbons: [],
      floor: [
        { ...mark, shape: 'crest' },
        { ...mark, shape: 'rime' },
      ],
      lights: [],
    });
    const meshes = layer.group.children.filter((object) => (object as Mesh).isMesh) as Mesh[];
    const marks = meshes
      .map((mesh) => mesh.geometry as InstancedBufferGeometry)
      .filter(
        (geometry) => geometry.getAttribute('look') !== undefined && geometry.getAttribute('motion') === undefined
      )[1];
    const look = marks.getAttribute('look').array;

    expect(marks.instanceCount).toBe(2);
    expect(look[4]).toBe(look[0] + 1);
    expect(look[5]).toBeCloseTo(0.6, 5);
    layer.dispose();
  });

  it('lays a seal as a mark of its own kind, its seed telling its part and how much of it is written', () => {
    const layer = new EffectLayer();
    const mark = {
      x: 1,
      y: 2,
      z: 3,
      radius: 90,
      width: 0.06,
      color: '#ffe9a8',
      alpha: 1,
      blend: 'color',
      turn: 0.3,
      seed: sealSeedOf('star', 3, 0.25),
    } as const;

    layer.set({
      motes: [],
      ribbons: [],
      floor: [
        { ...mark, shape: 'rime' },
        { ...mark, shape: 'seal' },
      ],
      lights: [],
    });
    const meshes = layer.group.children.filter((object) => (object as Mesh).isMesh) as Mesh[];
    const marks = meshes
      .map((mesh) => mesh.geometry as InstancedBufferGeometry)
      .filter(
        (geometry) => geometry.getAttribute('look') !== undefined && geometry.getAttribute('motion') === undefined
      )[1];
    const look = marks.getAttribute('look').array;

    expect(marks.instanceCount).toBe(2);
    expect(look[4]).toBe(look[0] + 1);
    expect(Math.floor(look[7])).toBe(7);
    expect(look[7] - Math.floor(look[7])).toBeCloseTo(0.75, 5);
    layer.dispose();
  });

  it('lays a fissure as a mark of its own kind, turned the way it runs and as wide as it is told', () => {
    const layer = new EffectLayer();
    const mark = {
      x: 1,
      y: 2,
      z: 3,
      radius: 40,
      width: 0.1,
      color: '#402010',
      alpha: 1,
      blend: 'color',
      turn: 0.7,
      seed: 4,
    } as const;

    layer.set({
      motes: [],
      ribbons: [],
      floor: [
        { ...mark, shape: 'fissure' },
        { ...mark, shape: 'scorch' },
        { ...mark, shape: 'crest' },
      ],
      lights: [],
    });
    const meshes = layer.group.children.filter((object) => (object as Mesh).isMesh) as Mesh[];
    const marks = meshes
      .map((mesh) => mesh.geometry as InstancedBufferGeometry)
      .filter(
        (geometry) => geometry.getAttribute('look') !== undefined && geometry.getAttribute('motion') === undefined
      )[1];
    const look = marks.getAttribute('look').array;

    expect(marks.instanceCount).toBe(3);
    expect(look[0]).toBe(look[4] + 1);
    expect(look[8]).toBe(look[0] + 1);
    expect([...look.slice(1, 4)].map((value) => Math.round(value * 100) / 100)).toEqual([0.1, 0.7, 4]);
    layer.dispose();
  });

  it('tells the signs apart as shapes of their own, between the shapes that turn and the crag, turned within one round', () => {
    const layer = new EffectLayer();
    const signs = [
      'heart',
      'zed',
      'query',
      'cross',
      'skull',
      'pentagram',
      'swirl',
      'dial',
      'eyes',
      'bubble',
      'hoop',
      'bar',
      'feather',
    ] as const;

    layer.set({
      motes: [
        mote({ shape: 'plume' }),
        ...signs.map((shape) => mote({ shape, spin: 7, variant: 1 })),
        mote({ shape: 'crag' }),
      ],
      ribbons: [],
      floor: [],
      lights: [],
    });
    const looks = looksOf(layer, 'color');
    const numbers = looks.map((look) => look[0]);

    expect(new Set(numbers).size).toBe(signs.length + 2);
    expect(numbers.slice(1, -1).every((number) => number > numbers[0] && number < numbers.at(-1)!)).toBe(true);
    expect(looks[1][1]).toBeCloseTo(7 - Math.PI * 2, 4);
    expect(looks[8][2]).toBeCloseTo(1, 5);
    layer.dispose();
  });

  it('sets a particle off across the screen by as far as it is told, and one told nothing by nothing, whatever was drawn before', () => {
    const layer = new EffectLayer();
    const asidesOf = () => {
      const meshes = layer.group.children.filter((object) => (object as Mesh).isMesh) as Mesh[];
      const batch = meshes
        .map((mesh) => mesh.geometry as InstancedBufferGeometry)
        .filter((geometry) => geometry.getAttribute('motion') !== undefined)[1];
      const aside = batch.getAttribute('aside').array;
      return Array.from({ length: batch.instanceCount }, (_unused, index) => [
        ...aside.slice(index * 4, index * 4 + 2),
      ]);
    };

    layer.set({ motes: [mote({ aside: { right: 24, up: -6 } })], ribbons: [], floor: [], lights: [] });
    expect(asidesOf()).toEqual([[24, -6]]);
    layer.set({ motes: [mote({})], ribbons: [], floor: [], lights: [] });
    expect(asidesOf()).toEqual([[0, 0]]);
    layer.dispose();
  });

  it('tells the colour of the middle of a particle that has one, and none for the rest, whatever was drawn before', () => {
    const layer = new EffectLayer();

    layer.set({ motes: [mote({ shape: 'lick', core: '#ffffff' })], ribbons: [], floor: [], lights: [] });
    layer.set({
      motes: [mote({ shape: 'puff' }), mote({ shape: 'jet', core: '#ff0000' })],
      ribbons: [],
      floor: [],
      lights: [],
    });
    const [plain, cored] = coresOf(layer);

    expect(plain[3]).toBe(0);
    expect(cored).toEqual([1, 0, 0, 1]);
    layer.dispose();
  });

  it('is drawn again as the eye comes to stand among the effects or leaves them, and only then', () => {
    const layer = new EffectLayer();
    layer.takeChanged();

    layer.seeFromWithin(true);
    expect(layer.takeChanged()).toBe(true);
    layer.seeFromWithin(true);
    expect(layer.takeChanged()).toBe(false);
    layer.seeFromWithin(false);
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

  it('tells a band that frays how far along it each point is, in its widths, less how far its pattern has run', () => {
    const layer = new EffectLayer();

    layer.set({
      motes: [],
      ribbons: [
        ribbon({
          points: [at(0), at(30), at(90)],
          widths: [10, 30, 20],
          torn: 0.5,
          soft: 0.25,
          flowed: 2,
          leans: -0.4,
        }),
      ],
      floor: [],
      lights: [],
    });
    const frays = bandsOf(layer, 'fray', 3);

    expect(frays.map((fray) => fray[0])).toEqual([-2, -2, -1, -1, 1, 1]);
    for (const fray of frays) {
      expect(fray[1]).toBeCloseTo(0.5);
      expect(fray[2]).toBeCloseTo(0.25);
      expect(fray[3]).toBeCloseTo(-0.4);
    }
    layer.dispose();
  });

  it('tells a band drawn by halves which half and what each point winds about, table up as the scene has it', () => {
    const layer = new EffectLayer();
    const about = [
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 },
    ];

    layer.set({
      motes: [],
      ribbons: [
        ribbon({ points: [at(0), at(10)], about, half: 'near' }),
        ribbon({ points: [at(0), at(10)], about, half: 'far' }),
      ],
      floor: [],
      lights: [],
    });

    expect(bandsOf(layer, 'hub', 4)).toEqual([
      [1, 3, 2, 1],
      [1, 3, 2, 1],
      [4, 6, 5, 1],
      [4, 6, 5, 1],
      [1, 3, 2, -1],
      [1, 3, 2, -1],
      [4, 6, 5, -1],
      [4, 6, 5, -1],
    ]);
    layer.dispose();
  });

  it('tells a band given none of that to be drawn whole, hard-edged and its middle in its middle, whatever was drawn before', () => {
    const layer = new EffectLayer();
    const about = [at(0), at(10)];

    layer.set({
      motes: [],
      ribbons: [ribbon({ points: [at(0), at(10)], about, half: 'far', torn: 0.5, soft: 0.5, flowed: 3, leans: 0.6 })],
      floor: [],
      lights: [],
    });
    layer.set({ motes: [], ribbons: [ribbon({ points: [at(0), at(10)] })], floor: [], lights: [] });

    expect(bandsOf(layer, 'fray', 2)).toEqual(Array.from({ length: 4 }, () => [0, 0, 0, 0]));
    expect(bandsOf(layer, 'hub', 2).map((hub) => hub[3])).toEqual([0, 0, 0, 0]);
    layer.dispose();
  });

  it('tells a band that thins near the eye so, over which half of it is drawn', () => {
    const layer = new EffectLayer();
    const about = [at(0), at(10)];

    layer.set({
      motes: [],
      ribbons: [
        ribbon({ points: [at(0), at(10)], thins: true }),
        ribbon({ points: [at(0), at(10)], about, half: 'far', thins: true }),
        ribbon({ points: [at(0), at(10)], about, half: 'near' }),
      ],
      floor: [],
      lights: [],
    });

    expect(bandsOf(layer, 'hub', 6).map((hub) => hub[3])).toEqual([4, 4, 4, 4, 3, 3, 3, 3, 1, 1, 1, 1]);
    layer.dispose();
  });

  it('draws the whole of a band that winds about something where it is told no half', () => {
    const layer = new EffectLayer();

    layer.set({
      motes: [],
      ribbons: [ribbon({ points: [at(0), at(10)], about: [at(0), at(10)] })],
      floor: [],
      lights: [],
    });

    expect(bandsOf(layer, 'hub', 2).map((hub) => hub[3])).toEqual([0, 0, 0, 0]);
    layer.dispose();
  });
});
