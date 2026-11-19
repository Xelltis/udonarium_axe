import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import {
  ModelLayer,
  partPlacementsOf,
  placedPartsOf,
  placementOf,
  spinOf,
  spinPlacedAt,
  spoutsOf,
  standingBoxOf,
} from '@axe/infrastructure/table-3d/model-layer';
import { meshesOf, triangleCountOf } from '@axe/infrastructure/three-kit/model-faces';
import {
  AnimationClip,
  BufferAttribute,
  BufferGeometry,
  Group,
  type InstancedMesh,
  Matrix4,
  Mesh,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';

/** A model one unit across and two tall, as it was made. */
const MADE = { size: new Vector3(1, 2, 1) };

function knight(fields: Partial<TableWorldModel> = {}): TableWorldModel {
  return {
    owner: 'knight',
    kind: 'character',
    url: 'blob:knight',
    model: { identifier: 'knight-model', scale: 1, turnDeg: 0, idle: '', walk: '' },
    foot: { x: 100, y: 200, z: 0 },
    footprintPx: 50,
    heightPx: 100,
    rotateDeg: 0,
    rollDeg: 0,
    pivotPx: 25,
    altitudePx: 0,
    walking: false,
    ...fields,
  };
}

/** Where a point of the model as it was made is drawn, in the scene's x, y (up) and z (south). */
function drawnAt(model: TableWorldModel, x: number, y: number, z: number): number[] {
  const point = new Vector3(x, y, z).applyMatrix4(placementOf(model, MADE));
  return [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000 + 0);
}

describe('spoutsOf', () => {
  /** A drain one unit across and two tall, its mouth a unit up at the middle of its south face. */
  const drain = { ...MADE, spouts: [new Vector3(0, 1, 0.5)] };

  it('finds the mouth of a model placed for its block, how high it is, the way it faces and how wide it pours', () => {
    expect(spoutsOf(knight(), drain)).toEqual([
      { key: 'knight:0', x: 100, y: 225, mouthPx: 50, outX: 0, outY: 1, widthPx: 12 },
    ]);
  });

  it('turns the mouth with the model, and lifts it with the ground the block stands on', () => {
    const turned = knight({ model: { ...knight().model, turnDeg: 90 }, altitudePx: 30 });

    expect(spoutsOf(turned, drain)).toEqual([
      { key: 'knight:0', x: 75, y: 200, mouthPx: 80, outX: -1, outY: 0, widthPx: 12 },
    ]);
  });

  it('finds none on a model not read yet, nor on one made with no spout', () => {
    expect(spoutsOf(knight(), null)).toEqual([]);
    expect(spoutsOf(knight(), MADE)).toEqual([]);
  });
});

describe('a part made to turn', () => {
  /** A wheel turning a quarter turn a second about an axis running south through a point a unit up. */
  const wheel = {
    ...MADE,
    parts: [
      { within: new Matrix4() },
      { within: new Matrix4(), spin: { at: new Vector3(0, 1, 0), axis: new Vector3(0, 0, 1), degPerSecond: 90 } },
    ],
  };
  const drawn = (matrix: Matrix4, x: number, y: number, z: number) => {
    const point = new Vector3(x, y, z).applyMatrix4(matrix);
    return [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000 + 0);
  };

  it('stands as it was made at the start, and turns about its own axis by so many degrees a second from the moment alone', () => {
    const [[body], [rim]] = partPlacementsOf(knight(), wheel);
    expect(drawn(rim, 0.5, 1, 0)).toEqual(drawn(body, 0.5, 1, 0));
    expect(drawn(rim, 0.5, 1, 0)).toEqual([125, 50, 200]);

    const [[still], [turned]] = partPlacementsOf(knight(), wheel, 1000);
    expect(drawn(still, 0.5, 1, 0)).toEqual([125, 50, 200]);
    expect(drawn(turned, 0.5, 1, 0)).toEqual([100, 75, 200]);
    expect(drawn(turned, 0, 1, 0)).toEqual([100, 50, 200]);

    const [, [later]] = partPlacementsOf(knight(), wheel, 5000);
    expect(drawn(later, 0.5, 1, 0)).toEqual(drawn(turned, 0.5, 1, 0));
  });

  it('stands, turned as time goes, where placing its model afresh at that moment stands it', () => {
    const stretched = { ...wheel, stretch: true };
    const copies: [TableWorldModel, typeof stretched | typeof wheel][] = [
      [knight(), wheel],
      [knight({ rotateDeg: 37, rollDeg: 12, altitudePx: 30, model: { ...knight().model, turnDeg: 90 } }), wheel],
      [knight({ boxPx: { widthPx: 150, depthPx: 50 }, heightPx: 80 }), stretched],
    ];
    for (const [model, measure] of copies) {
      const spins = placedPartsOf(model, measure).spins;
      expect(spins.map((spin) => spin.part)).toEqual([1]);
      for (const timeMs of [0, 250, 1000, 4321, 987654]) {
        const [, [afresh]] = partPlacementsOf(model, measure, timeMs);
        const turned = spinPlacedAt(spins[0], timeMs);
        afresh.elements.forEach((value, at) =>
          expect(turned.elements[at], `${model.rotateDeg} ${timeMs}`).toBeCloseTo(value, 6)
        );
      }
    }
  });

  it('is worked out with the places of its model’s parts, once for the copy, and is none where no part turns', () => {
    const still = { ...MADE, parts: [{ within: new Matrix4() }, { within: new Matrix4() }] };
    const turned = knight({ rotateDeg: 37, altitudePx: 30 });

    expect(placedPartsOf(turned, still).spins).toEqual([]);
    for (const measure of [still, wheel]) {
      const placed = placedPartsOf(turned, measure, 1234).placements;
      const afresh = partPlacementsOf(turned, measure, 1234);
      expect(placed.map((each) => each.map((matrix) => matrix.elements))).toEqual(
        afresh.map((each) => each.map((matrix) => matrix.elements))
      );
    }
  });

  it('is not turned where its model is laid out of a kit over a block, or while it swings open as a leaf', () => {
    const block = knight({ boxPx: { widthPx: 100, depthPx: 100 } });
    expect(placedPartsOf(block, { ...wheel, tile: true }).spins).toEqual([]);
    expect(placedPartsOf(knight(), { ...wheel, tile: true }).spins.map((spin) => spin.part)).toEqual([1]);

    const leaf = {
      ...MADE,
      parts: [{ within: new Matrix4(), swing: { hinge: new Vector3(), deg: 90 }, spin: wheel.parts[1].spin }],
    };
    const open = knight({ door: { open: true, shiftX: 0, shiftY: 0, liftPx: 0, turnDeg: 0 } });
    expect(placedPartsOf(open, leaf).spins).toEqual([]);
    expect(placedPartsOf(knight(), leaf).spins).toHaveLength(1);
  });

  it('turns with its model, about the axis as the model is turned', () => {
    const quarter = knight({ model: { ...knight().model, turnDeg: 90 } });

    const [, [turned]] = partPlacementsOf(quarter, wheel, 1000);

    expect(drawn(turned, 0, 1, 0)).toEqual([100, 50, 200]);
    expect(drawn(turned, 0.5, 1, 0)).toEqual([100, 75, 200]);
  });

  it('is read off the node that says so, by the meshes hanging from it, the axis through its own origin where it names no point', () => {
    const node = new Group();
    node.userData = { spin: [0, 0, 2, 45], spinAt: [0, 1.5, 0.2] };
    const sail = new Mesh(new BufferGeometry());
    node.add(sail);
    const bare = new Group();
    bare.userData = { spin: [1, 0, 0, -30] };

    const read = spinOf(sail)!;
    expect(read.node).toBe(node);
    expect(read.at.toArray()).toEqual([0, 1.5, 0.2]);
    expect(read.axis.toArray()).toEqual([0, 0, 1]);
    expect(read.degPerSecond).toBe(45);
    expect(spinOf(bare)!.at.toArray()).toEqual([0, 0, 0]);
    expect(spinOf(new Mesh(new BufferGeometry()))).toBeNull();
  });

  it('is left out of the box its model stands in, which is round the rest, or round all of a model all of which turns', () => {
    const boxed = (min: number[], max: number[]) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array([...min, ...max, ...min]), 3));
      return new Mesh(geometry);
    };
    const rounded = (values: number[]) => values.map((value) => Math.round(value * 10) / 10);
    const scene = new Group();
    scene.add(boxed([-1.5, 0, -1.5], [1.5, 5.6, 1.5]));
    const sails = new Group();
    sails.userData = { spin: [0, 0, 1, 24], spinAt: [0, 3.9, 1.1] };
    sails.add(boxed([-2.5, 1.4, 1], [2.5, 6.4, 1.2]));
    scene.add(sails);
    scene.updateMatrixWorld(true);

    const box = standingBoxOf(scene);
    expect(rounded(box.min.toArray())).toEqual([-1.5, 0, -1.5]);
    expect(rounded(box.max.toArray())).toEqual([1.5, 5.6, 1.5]);

    const wheel = new Group();
    wheel.add(sails);
    wheel.updateMatrixWorld(true);
    expect(rounded(standingBoxOf(wheel).min.toArray())).toEqual([-2.5, 1.4, 1]);

    // A part that turns hung from a mesh that does not is left out just the same.
    const tower = boxed([-1.5, 0, -1.5], [1.5, 5.6, 1.5]);
    const hung = new Group();
    hung.userData = { spin: [0, 0, 1, 24] };
    hung.add(boxed([-2.5, 1.4, 1], [2.5, 6.4, 1.2]));
    tower.add(hung);
    const mill = new Group();
    mill.add(tower);
    expect(rounded(standingBoxOf(mill).min.toArray())).toEqual([-1.5, 0, -1.5]);
    expect(rounded(standingBoxOf(mill).max.toArray())).toEqual([1.5, 5.6, 1.5]);
  });

  it('reads nothing that names no axis, no turning, or anything but four figures', () => {
    for (const spin of [[0, 0, 0, 45], [0, 0, 1, 0], [0, 0, 1], [0, 0, 1, 'fast'], 'round']) {
      const node = new Group();
      node.userData = { spin };
      expect(spinOf(node)).toBeNull();
    }
  });
});

describe('placementOf', () => {
  it('stands a model on its piece’s foot, fitted inside the piece’s box', () => {
    expect(drawnAt(knight(), 0, 0, 0)).toEqual([100, 0, 200]);
    expect(drawnAt(knight(), 0, 2, 0)).toEqual([100, 100, 200]);
  });

  it('stretches a model made to fill its box to the block’s own width, depth and height, each on its own', () => {
    const door = knight({ footprintPx: 100, heightPx: 150, pivotPx: 0, boxPx: { widthPx: 100, depthPx: 10 } });
    const stretched = (model: TableWorldModel, x: number, y: number, z: number) => {
      const point = new Vector3(x, y, z).applyMatrix4(placementOf(model, { ...MADE, stretch: true }));
      return [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000 + 0);
    };

    expect(stretched(door, 0.5, 2, 0.5)).toEqual([150, 150, 205]);
    const turned = { ...door, model: { ...door.model, turnDeg: 90 } };
    expect(stretched(turned, 0.5, 0, 0)).toEqual([100, 0, 205]);
    expect(stretched(turned, 0, 0, 0.5)).toEqual([50, 0, 200]);
    expect(drawnAt(door, 0.5, 2, 0.5)).toEqual([137.5, 150, 237.5]);
  });

  it('moves an open door’s model whole, as its faces are moved, where the model has no leaves of its own', () => {
    const door = knight({
      pivotPx: 0,
      door: { open: true, shiftX: -25, shiftY: 25, turnDeg: 90, liftPx: 0 },
    });
    expect(drawnAt(door, 0, 0, 0)).toEqual([75, 0, 225]);
    expect(drawnAt({ ...door, door: { ...door.door!, open: false } }, 0, 0, 0)).toEqual([100, 0, 200]);
  });

  it('swings each leaf of a door on its own hinge while the door is open, unstretched, and leaves the door where it stands', () => {
    const saloon = {
      size: new Vector3(1, 2, 0.25),
      stretch: true,
      parts: [
        { within: new Matrix4(), swing: { hinge: new Vector3(-0.5, 0, 0), deg: -90 } },
        { within: new Matrix4(), swing: { hinge: new Vector3(0.5, 0, 0), deg: 90 } },
        { within: new Matrix4() },
      ],
    };
    const door = knight({
      footprintPx: 100,
      heightPx: 100,
      pivotPx: 0,
      boxPx: { widthPx: 100, depthPx: 25 },
      door: { open: true, shiftX: 40, shiftY: 0, turnDeg: 95, liftPx: 0 },
    });
    const at = (matrices: Matrix4[][], part: number, x: number) => {
      const point = new Vector3(x, 0, 0).applyMatrix4(matrices[part][0]);
      return [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000 + 0);
    };

    const open = partPlacementsOf(door, saloon);
    expect(at(open, 0, -0.5)).toEqual([50, 0, 200]);
    expect(at(open, 0, 0)).toEqual([50, 0, 250]);
    expect(at(open, 1, 0)).toEqual([150, 0, 250]);
    expect(at(open, 2, 0)).toEqual([100, 0, 200]);
    const shut = partPlacementsOf({ ...door, door: { ...door.door!, open: false } }, saloon);
    expect(at(shut, 0, 0)).toEqual([100, 0, 200]);
  });

  it('builds a building of its kit: walls round every side and up every storey, the roof over it, a parapet round that', () => {
    const kit = {
      size: new Vector3(1, 1, 1),
      facade: true,
      parts: [
        { within: new Matrix4(), role: 'wall' as const },
        { within: new Matrix4(), role: 'roof' as const },
        { within: new Matrix4(), role: 'cap' as const },
      ],
    };
    const building = knight({
      footprintPx: 100,
      heightPx: 120,
      pivotPx: 0,
      boxPx: { widthPx: 100, depthPx: 50, cellPx: 50 },
    });
    const [walls, roofs, caps] = partPlacementsOf(building, kit);
    const where = (matrix: Matrix4, x: number, y: number, z: number) => {
      const point = new Vector3(x, y, z).applyMatrix4(matrix);
      return [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000 + 0);
    };

    expect([walls.length, roofs.length, caps.length]).toEqual([12, 2, 6]);
    expect(where(walls[0], -0.5, 0, 0)).toEqual([50, 0, 225]);
    expect(where(walls[1], 0.5, 1, 0)).toEqual([100, 120, 225]);
    expect(where(walls[0], 0, 0, 1)).toEqual([75, 0, 275]);
    const sides = walls.map((matrix) => where(matrix, 0, 0, 0));
    expect(sides.filter(([, , z]) => z === 175).length).toBe(4);
    expect(sides.filter(([x]) => x === 150).length).toBe(2);
    expect(sides.filter(([x]) => x === 50).length).toBe(2);
    expect(roofs.map((matrix) => where(matrix, 0, 0, 0))).toEqual([
      [75, 120, 200],
      [125, 120, 200],
    ]);
    expect(caps.every((matrix) => where(matrix, 0, 0, 0)[1] === 120)).toBe(true);
  });

  it('lays a tile on every cell of a block, as tall as the block, along the way the block is turned', () => {
    const tile = { size: new Vector3(1, 1, 1), tile: true, parts: [{ within: new Matrix4() }] };
    const where = (matrix: Matrix4, x: number, y: number, z: number) => {
      const point = new Vector3(x, y, z).applyMatrix4(matrix);
      return [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000 + 0);
    };
    const run = knight({ heightPx: 125, pivotPx: 0, boxPx: { widthPx: 150, depthPx: 50, cellPx: 50 } });

    const [along] = partPlacementsOf(run, tile);
    expect(along.map((matrix) => where(matrix, 0, 0, 0))).toEqual([
      [50, 0, 200],
      [100, 0, 200],
      [150, 0, 200],
    ]);
    expect(where(along[0], 0, 1, 0.5)).toEqual([50, 125, 225]);
    expect(where(along[0], 0.5, 0, 0)).toEqual([75, 0, 200]);

    const down = knight({
      heightPx: 125,
      pivotPx: 0,
      model: { identifier: 'wall', scale: 1, turnDeg: 90, idle: '', walk: '' },
      boxPx: { widthPx: 50, depthPx: 150, cellPx: 50 },
    });
    const [turned] = partPlacementsOf(down, tile);
    const middles = turned.map((matrix) => where(matrix, 0, 0, 0));
    expect(middles.map(([x]) => x)).toEqual([100, 100, 100]);
    expect(middles.map(([, , z]) => z).sort((a, b) => a - b)).toEqual([150, 200, 250]);
  });

  it('stands a tile that keeps the height it was made at as tall as it was made in cells, on a block however thin', () => {
    const crop = { size: new Vector3(1, 0.7, 1), tile: true, madeHeight: true, parts: [{ within: new Matrix4() }] };
    const field = knight({ heightPx: 1, pivotPx: 0, boxPx: { widthPx: 100, depthPx: 50, cellPx: 50 } });

    const [cells] = partPlacementsOf(field, crop);
    const top = new Vector3(0.5, 0.7, 0).applyMatrix4(cells[0]);
    expect(cells).toHaveLength(2);
    expect([top.x, top.y].map((value) => Math.round(value * 1000) / 1000)).toEqual([100, 35]);
  });

  it('joins a wall to the walls beside it: its hub in the middle of each cell and an arm out to each side it reaches to', () => {
    const wall = {
      size: new Vector3(1, 1, 1),
      joined: true,
      parts: [{ within: new Matrix4() }, { within: new Matrix4(), hub: true }],
    };
    const where = (matrix: Matrix4, x: number, y: number, z: number) => {
      const point = new Vector3(x, y, z).applyMatrix4(matrix);
      return [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000 + 0);
    };
    const corner = knight({
      heightPx: 100,
      pivotPx: 0,
      boxPx: { widthPx: 50, depthPx: 50, cellPx: 50 },
      joins: [
        {
          x: 100,
          y: 200,
          arms: [
            { deg: 0, lengthPx: 25 },
            { deg: 90, lengthPx: 25 },
          ],
        },
      ],
    });

    const [arms, hubs] = partPlacementsOf(corner, wall);
    expect(arms.map((matrix) => where(matrix, 0.5, 1, 0))).toEqual([
      [125, 100, 200],
      [100, 100, 225],
    ]);
    expect(hubs.map((matrix) => where(matrix, 0.5, 0, 0.5))).toEqual([[125, 0, 225]]);

    const square = knight({
      heightPx: 100,
      pivotPx: 0,
      model: { identifier: 'wall', scale: 1, turnDeg: 90, idle: '', walk: '' },
      boxPx: { widthPx: 50, depthPx: 50, cellPx: 50 },
    });
    expect(partPlacementsOf(square, wall)[0].map((matrix) => where(matrix, 0.5, 0, 0))).toEqual([
      [100, 0, 225],
      [100, 0, 175],
    ]);

    const lone = knight({ heightPx: 100, pivotPx: 0, boxPx: { widthPx: 50, depthPx: 100, cellPx: 50 } });
    const [runs] = partPlacementsOf(lone, wall);
    expect(runs.map((matrix) => where(matrix, 0.5, 0, 0))).toEqual([
      [100, 0, 200],
      [100, 0, 150],
      [100, 0, 250],
      [100, 0, 200],
    ]);
  });

  it('lifts a model as high as its piece floats', () => {
    expect(drawnAt(knight({ altitudePx: 30 }), 0, 0, 0)).toEqual([100, 30, 200]);
  });

  it('tips a model over as its piece’s picture is tipped, about the point its picture is tipped over about', () => {
    const tipped = knight({ rollDeg: 90 });

    expect(drawnAt(tipped, 0, 0, 0)).toEqual([75, 25, 200]);
    expect(drawnAt(tipped, 0, 2, 0)).toEqual([175, 25, 200]);
  });

  it('tips a turned piece’s model over across the way it is turned to', () => {
    const tipped = knight({ rollDeg: 90, rotateDeg: 90 });

    expect(drawnAt(tipped, 0, 0, 0)).toEqual([100, 25, 175]);
    expect(drawnAt(tipped, 0, 2, 0)).toEqual([100, 25, 275]);
  });

  it('tips a floating piece’s model over at the height it floats', () => {
    expect(drawnAt(knight({ rollDeg: 90, altitudePx: 30 }), 0, 0, 0)).toEqual([75, 55, 200]);
  });
});

describe('ModelLayer', () => {
  /** A model of one mesh that plays the motions named, read at once in place of a file. */
  function layerOf(motions: readonly string[]): ModelLayer {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const scene = new Group();
    scene.add(new Mesh());
    const loaded = {
      gltf: { scene, animations: motions.map((name) => new AnimationClip(name, 1, [])) },
      size: new Vector3(1, 2, 1),
      foot: new Vector3(0, 0, 0),
      animated: true,
    };
    (layer as unknown as { loaded: Map<string, unknown> }).loaded.set('blob:knight', loaded);
    return layer;
  }

  it('plays the motions a piece names standing and walking, and the others it names once they are changed', () => {
    const layer = layerOf(['Idle', 'Guard', 'Walk', 'Run']);

    layer.set([knight()]);
    expect(layer.motionOf('knight')).toBe('Idle');

    layer.set([knight({ model: { identifier: 'knight-model', scale: 1, turnDeg: 0, idle: 'Guard', walk: '' } })]);
    expect(layer.motionOf('knight')).toBe('Guard');

    const running = { identifier: 'knight-model', scale: 1, turnDeg: 0, idle: 'Guard', walk: 'Run' };
    layer.set([knight({ model: running, walking: true })]);
    expect(layer.motionOf('knight')).toBe('Run');

    layer.set([knight({ model: { ...running, walk: 'Walk' }, walking: true })]);
    expect(layer.motionOf('knight')).toBe('Walk');

    layer.set([knight({ model: { ...running, idle: '' }, walking: false })]);
    expect(layer.motionOf('knight')).toBe('Idle');
  });

  it('lets go of a model read after the layer was, rather than standing it in the layer', async () => {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const geometry = new BufferGeometry();
    const scene = new Group();
    scene.add(new Mesh(geometry));
    const letGo = vi.spyOn(geometry, 'dispose');
    let read: (loaded: unknown) => void = () => undefined;
    vi.spyOn(layer as unknown as { parse(url: string): Promise<unknown> }, 'parse').mockReturnValue(
      new Promise((resolve) => (read = resolve))
    );

    layer.set([knight()]);
    layer.dispose();
    read({
      gltf: { scene, animations: [new AnimationClip('Idle', 1, [])] },
      size: MADE.size,
      foot: new Vector3(),
      animated: true,
    });
    await Promise.resolve();

    expect(layer.group.children).toHaveLength(0);
    expect((layer as unknown as { loaded: Map<string, unknown> }).loaded.size).toBe(0);
    expect(letGo).toHaveBeenCalledTimes(1);
  });

  it('stands a model a part is painted over as a copy of its own, leaving out the faces of the lost parts', () => {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const shape = new BufferGeometry();
    shape.setAttribute('position', new BufferAttribute(new Float32Array(4 * 9), 3));
    shape.setIndex([...Array(12).keys()]);
    const scene = new Group();
    scene.add(new Mesh(shape));
    (layer as unknown as { loaded: Map<string, unknown> }).loaded.set('blob:knight', {
      gltf: { scene, animations: [] },
      size: new Vector3(1, 2, 1),
      foot: new Vector3(0, 0, 0),
      animated: false,
    });
    const stood = () => (layer as unknown as { stood: Map<string, { root: Group }> }).stood.get('knight')?.root;
    const triangles = () => meshesOf(stood()!).map((mesh) => triangleCountOf(mesh.geometry));

    layer.set([knight({ ownCopy: true })]);
    expect(triangles()).toEqual([4]);
    expect(stood()!.userData['owner']).toBe('knight');

    layer.set([knight({ ownCopy: true, cutFaces: '0:1-2' })]);
    expect(triangles()).toEqual([2]);
    expect(triangleCountOf(shape)).toBe(4);

    layer.set([knight({ ownCopy: true })]);
    expect(triangles()).toEqual([4]);
  });

  describe('with a model a part of which turns', () => {
    /** A mill of a body and a wheel, read already, laid as two blocks drawn together. */
    function mill(): { layer: ModelLayer; wheelAt: (copy?: number) => number[] } {
      const layer = new ModelLayer(
        () => undefined,
        () => undefined,
        () => ({}) as WebGPURenderer
      );
      const body = new Mesh(new BufferGeometry());
      const wheel = new Mesh(new BufferGeometry());
      (layer as unknown as { loaded: Map<string, unknown> }).loaded.set('blob:knight', {
        gltf: { scene: new Group(), animations: [] },
        size: MADE.size,
        foot: new Vector3(),
        animated: false,
        parts: [
          { mesh: body, within: new Matrix4() },
          {
            mesh: wheel,
            within: new Matrix4(),
            spin: { at: new Vector3(0, 1, 0), axis: new Vector3(0, 0, 1), degPerSecond: 90 },
          },
        ],
      });
      layer.set([knight(), knight({ owner: 'second', foot: { x: 300, y: 200, z: 0 } })]);
      const wheelAt = (copy = 0) => {
        const drawn = layer.group.children[1] as InstancedMesh;
        const matrix = new Matrix4();
        drawn.getMatrixAt(copy, matrix);
        const point = new Vector3(0.5, 1, 0).applyMatrix4(matrix);
        return [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000 + 0);
      };
      return { layer, wheelAt };
    }

    it('turns the part to where it stands at each moment, asking for a frame now and then, and throws no shadow from it', () => {
      const { layer, wheelAt } = mill();
      layer.setTurning(true);
      layer.takeChanged();

      expect(layer.advance(1000)).toBe('slowly');

      expect(wheelAt()).toEqual([100, 75, 200]);
      expect(layer.takeChanged()).toBe(true);
      const [body, wheel] = layer.group.children as InstancedMesh[];
      expect(body.castShadow).toBe(true);
      expect(wheel.castShadow).toBe(false);
      layer.dispose();
    });

    it('stands the part as it was made for a reader who asks for less motion, and asks for no frame', () => {
      const { layer, wheelAt } = mill();

      expect(layer.advance(1000)).toBe(false);
      expect(wheelAt()).toEqual([125, 50, 200]);

      layer.setTurning(true);
      layer.advance(1000);
      layer.setTurning(false);

      expect(wheelAt()).toEqual([125, 50, 200]);
      expect(layer.advance(2000)).toBe(false);
      layer.dispose();
    });

    it('turns every copy where its own model stands, and leaves the parts that do not turn as they were laid', () => {
      const { layer, wheelAt } = mill();
      layer.setTurning(true);
      const [body] = layer.group.children as InstancedMesh[];
      const laid = body.instanceMatrix.version;

      layer.advance(1000);

      expect(wheelAt(0)).toEqual([100, 75, 200]);
      expect(wheelAt(1)).toEqual([300, 75, 200]);
      expect(body.instanceMatrix.version).toBe(laid);
      layer.dispose();
    });

    it('lays the models again as far turned as they stood', () => {
      const { layer, wheelAt } = mill();
      layer.setTurning(true);
      layer.advance(1000);

      layer.set([knight()]);

      expect(wheelAt()).toEqual([100, 75, 200]);
      layer.dispose();
    });
  });
});
