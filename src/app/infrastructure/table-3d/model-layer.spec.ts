import { modelLookOf, presetModelLook } from '@axe/domain/tabletop/model-look';
import { MADE_MOTION_MS } from '@axe/domain/tabletop/model-motions';
import { PIECE_MODEL_AS_MADE } from '@axe/domain/tabletop/piece-model';
import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import {
  ModelLayer,
  modelPartsOf,
  modelReadKeyOf,
  partPlacementsOf,
  placedPartsOf,
  placementOf,
  senseInCurrent,
  spinOf,
  spinPlacedAt,
  spoutsOf,
  standingBoxOf,
  UNUSED_MODEL_KEEP_MS,
} from '@axe/infrastructure/table-3d/model-layer';
import { meshesOf, triangleCountOf } from '@axe/infrastructure/three-kit/model-faces';
import {
  AnimationClip,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  type InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertNodeMaterial,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
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
    model: { identifier: 'knight-model', scale: 1, turnDeg: 0, idle: '', walk: '', ...PIECE_MODEL_AS_MADE },
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
      {
        within: new Matrix4(),
        spin: { at: new Vector3(0, 1, 0), axis: new Vector3(0, 0, 1), degPerSecond: 90, reach: 0.5 },
      },
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

  it('turns the other way round where its lowest point dips into water running against the way it turns as made', () => {
    /** The water under the knight: running so, its surface 30 up, over the wheel's lowest point 25 up. */
    const flowing = (towardX: number, towardY: number, surfacePx = 30) =>
      knight({ current: { towardX, towardY, surfacePx } });

    expect(placedPartsOf(flowing(1, 0), wheel).spins[0].degPerSecond).toBe(90);
    expect(placedPartsOf(flowing(-1, 0), wheel).spins[0].degPerSecond).toBe(-90);
    const [, [turned]] = partPlacementsOf(flowing(-1, 0), wheel, 1000);
    expect(drawn(turned, 0.5, 1, 0)).toEqual([100, 25, 200]);
    expect(drawn(turned, 0, 0.5, 0)).toEqual([75, 50, 200]);

    expect(placedPartsOf(flowing(-1, 0, 20), wheel).spins[0].degPerSecond).toBe(90);
    expect(placedPartsOf(flowing(0, 1), wheel).spins[0].degPerSecond).toBe(90);
  });

  it('reaches as deep as it is stretched upright, however wide it is stretched', () => {
    const model = knight({
      boxPx: { widthPx: 150, depthPx: 50 },
      heightPx: 100,
      current: { towardX: -1, towardY: 0, surfacePx: 20 },
    });

    expect(placedPartsOf(model, { ...wheel, stretch: true }).spins[0].degPerSecond).toBe(90);
    expect(
      placedPartsOf({ ...model, current: { ...model.current!, surfacePx: 30 } }, { ...wheel, stretch: true }).spins[0]
        .degPerSecond
    ).toBe(-90);
  });

  it('turns with the water whichever way its model is turned', () => {
    const current = { towardX: 1, towardY: 0, surfacePx: 30 };
    for (const turnDeg of [0, 180]) {
      const model = knight({ current, model: { ...knight().model, turnDeg } });
      const [, [turned]] = partPlacementsOf(model, wheel, 1000);
      const [, [still]] = partPlacementsOf(model, wheel, 0);
      const lowest = (matrix: Matrix4) => new Vector3(0, 0.5, 0).applyMatrix4(matrix);
      expect(lowest(still).y, `${turnDeg}`).toBeCloseTo(25);
      expect(lowest(turned).x - lowest(still).x, `${turnDeg}`).toBeGreaterThan(0);
    }
  });

  it('is turned by no water about an upright axis', () => {
    const current = { towardX: 1, towardY: 0, surfacePx: 1000 };
    expect(senseInCurrent(current, new Vector3(0, 50, 0), new Vector3(0, 1, 0), 25, 90)).toBe(1);
    expect(senseInCurrent(current, new Vector3(0, 50, 0), new Vector3(0, 0, -1), 25, 90)).toBe(-1);
    expect(senseInCurrent(current, new Vector3(0, 50, 0), new Vector3(0, 0, -1), 25, -90)).toBe(1);
  });

  it('reaches out from its axis as far as the farthest of the meshes turning with it', () => {
    const shaped = (points: number[]) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
      return new Mesh(geometry);
    };
    const scene = new Group();
    scene.add(shaped([-1, 0, -1, 1, 2, 1]));
    const wheel = new Group();
    wheel.userData = { spin: [1, 0, 0, 30], spinAt: [1, 1, 0] };
    wheel.add(shaped([1, 1, 1.2, 1, -0.2, 0, 1.2, 1, 0]));
    wheel.add(shaped([0.9, 1.1, 0, 1.1, 0.9, 0]));
    scene.add(wheel);
    scene.updateMatrixWorld(true);

    const { parts } = modelPartsOf(scene, new Matrix4(), undefined);

    expect(parts[0].spin).toBeUndefined();
    for (const part of parts.slice(1)) expect(part.spin!.reach).toBeCloseTo(1.2, 6);
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
      model: { identifier: 'wall', scale: 1, turnDeg: 90, idle: '', walk: '', ...PIECE_MODEL_AS_MADE },
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
      model: { identifier: 'wall', scale: 1, turnDeg: 90, idle: '', walk: '', ...PIECE_MODEL_AS_MADE },
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
  it('makes the copy for a piece of the one read for a block, reading the bytes once and sharing their shapes', async () => {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const geometry = new BoxGeometry();
    const scene = new Group();
    scene.add(new Mesh(geometry, new MeshStandardMaterial()));
    const internals = layer as unknown as {
      reader: { read: (url: string) => Promise<unknown> };
      loaded: Map<string, { gltf: { scene: Group } } | null>;
      letGoOf: (key: string, loaded: unknown) => void;
    };
    const reads = vi.spyOn(internals.reader, 'read').mockResolvedValue({ scene, animations: [] });

    layer.set([knight({ owner: 'tower', kind: 'terrain' }), knight()]);
    await vi.waitFor(() => expect(internals.loaded.size).toBe(2));

    expect(reads).toHaveBeenCalledTimes(1);
    const meshOf = (key: string) => internals.loaded.get(key)!.gltf.scene.children[0] as Mesh;
    const [block, piece] = [meshOf('blob:knight'), meshOf(modelReadKeyOf(knight()))];
    expect(piece.geometry).toBe(block.geometry);
    expect(piece.material).not.toBe(block.material);
    const letGo = vi.spyOn(geometry, 'dispose');
    internals.letGoOf('blob:knight', internals.loaded.get('blob:knight'));
    expect(letGo).not.toHaveBeenCalled();
    layer.dispose();
  });

  it('measures the copy for a piece as its twin was read, each part its own mesh, however the twin stands posed since', async () => {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const scene = new Group();
    scene.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
    type Loaded = { gltf: { scene: Group }; size: Vector3; foot: Vector3; parts: { mesh: Mesh; within: Matrix4 }[] };
    const internals = layer as unknown as {
      reader: { read: (url: string) => Promise<unknown> };
      loaded: Map<string, Loaded | null>;
      variantOf: (other: Loaded, moonlit: boolean) => Loaded;
    };
    vi.spyOn(internals.reader, 'read').mockResolvedValue({ scene, animations: [] });
    layer.set([knight({ owner: 'tower', kind: 'terrain' })]);
    await vi.waitFor(() => expect(internals.loaded.get('blob:knight')).toBeTruthy());
    const block = internals.loaded.get('blob:knight')!;
    block.gltf.scene.children[0].position.set(3, 1, 0);
    block.gltf.scene.updateMatrixWorld(true);

    const piece = internals.variantOf(block, false);

    expect([piece.size, piece.foot]).toEqual([block.size, block.foot]);
    expect(piece.parts.map((part) => part.within)).toEqual(block.parts.map((part) => part.within));
    expect(piece.parts[0].mesh).toBe(piece.gltf.scene.children[0]);
    expect(piece.parts[0].mesh).not.toBe(block.parts[0].mesh);
    layer.dispose();
  });

  it('reads a model drawn for a piece apart from one drawn for a block, greying only the block by moonlight', () => {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const read = vi
      .spyOn(layer as unknown as { read: (...args: unknown[]) => void }, 'read')
      .mockImplementation(() => undefined);

    layer.set([knight(), knight({ owner: 'tower', kind: 'terrain' })]);

    expect(read.mock.calls.map(([key, url, , moonlit]) => [key, url, moonlit])).toEqual([
      ['blob:knight#piece', 'blob:knight', false],
      ['blob:knight', 'blob:knight', true],
    ]);
    layer.dispose();
  });

  it('keeps a model drawn another way apart, making its materials afresh from what the model was made of', async () => {
    const dressed: unknown[] = [];
    const layer = new ModelLayer(
      (material) => dressed.push(material),
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const geometry = new BoxGeometry();
    const scene = new Group();
    scene.add(new Mesh(geometry, new MeshStandardMaterial({ color: '#ffffff', metalness: 0.1, roughness: 0.6 })));
    const internals = layer as unknown as {
      reader: { read: (url: string) => Promise<unknown> };
      loaded: Map<string, { gltf: { scene: Group } } | null>;
    };
    const reads = vi.spyOn(internals.reader, 'read').mockResolvedValue({ scene, animations: [] });
    const golden = knight({ owner: 'idol', model: { ...knight().model, look: presetModelLook('gold') } });

    layer.set([knight(), golden]);
    await vi.waitFor(() => expect(internals.loaded.size).toBe(2));

    expect(reads).toHaveBeenCalledTimes(1);
    expect(modelReadKeyOf(golden)).not.toBe(modelReadKeyOf(knight()));
    const meshOf = (model: TableWorldModel) => internals.loaded.get(modelReadKeyOf(model))!.gltf.scene.children[0];
    const [plain, gold] = [meshOf(knight()), meshOf(golden)] as Mesh[];
    expect(gold.geometry).toBe(plain.geometry);
    expect((plain.material as MeshStandardNodeMaterial).metalness).toBeCloseTo(0.1);
    expect((gold.material as MeshStandardNodeMaterial).metalness).toBe(1);
    expect((gold.material as MeshStandardNodeMaterial).color.getHexString()).toBe('ffcf5a');
    expect(dressed).toEqual([plain.material, gold.material]);
    layer.dispose();
  });

  it('says a model is drawn once it has been read, and not one it could not read or was never laid', async () => {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const scene = new Group();
    scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    const internals = layer as unknown as { reader: { read: (url: string) => Promise<unknown> } };
    vi.spyOn(internals.reader, 'read').mockImplementation((url) =>
      url === 'blob:knight' ? Promise.resolve({ scene, animations: [] }) : Promise.resolve(null)
    );

    layer.set([knight(), knight({ owner: 'ghost', url: 'blob:unreadable' })]);
    expect(layer.draws('knight')).toBe(false);
    await vi.waitFor(() => expect(layer.draws('knight')).toBe(true));

    expect(layer.draws('ghost')).toBe(false);
    expect(layer.draws('nobody')).toBe(false);
    layer.dispose();
  });

  it('keeps a model whose look reads as made with the model as made', () => {
    const asMade = knight({ model: { ...knight().model, look: modelLookOf('{"materials":{}}') } });

    expect(modelReadKeyOf(asMade)).toBe(modelReadKeyOf(knight()));
  });

  it('draws a model lit evenly at plain detail, reading afresh what it had read at full', async () => {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const internals = layer as unknown as {
      reader: { read: (url: string) => Promise<unknown> };
      loaded: Map<string, { gltf: { scene: Group } } | null>;
    };
    const made = () => {
      const scene = new Group();
      scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ metalness: 1 })));
      return { scene, animations: [] };
    };
    const reads = vi.spyOn(internals.reader, 'read').mockImplementation(() => Promise.resolve(made()));
    const materialOf = () => (internals.loaded.get(modelReadKeyOf(knight()))!.gltf.scene.children[0] as Mesh).material;

    layer.set([knight()]);
    await vi.waitFor(() => expect(internals.loaded.get(modelReadKeyOf(knight()))).toBeTruthy());
    expect(materialOf()).toBeInstanceOf(MeshStandardNodeMaterial);

    layer.setDetail('plain');
    expect(internals.loaded.get(modelReadKeyOf(knight()))).toBeUndefined();
    await vi.waitFor(() => expect(internals.loaded.get(modelReadKeyOf(knight()))).toBeTruthy());

    expect(reads).toHaveBeenCalledTimes(2);
    expect(materialOf()).toBeInstanceOf(MeshLambertNodeMaterial);
    layer.dispose();
  });

  it('lets go of a model that comes after the detail changed, and stands the one read afresh', async () => {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const internals = layer as unknown as {
      reader: { read: (url: string) => Promise<unknown> };
      loaded: Map<string, { gltf: { scene: Group } } | null>;
    };
    const coming: ((read: unknown) => void)[] = [];
    vi.spyOn(internals.reader, 'read').mockImplementation(() => new Promise((resolve) => coming.push(resolve)));
    const made = () => {
      const scene = new Group();
      const geometry = new BoxGeometry();
      scene.add(new Mesh(geometry, new MeshStandardMaterial()));
      return { read: { scene, animations: [] }, letGo: vi.spyOn(geometry, 'dispose') };
    };
    const [first, second] = [made(), made()];

    layer.set([knight()]);
    layer.setDetail('plain');
    await vi.waitFor(() => expect(coming).toHaveLength(2));
    coming[0](first.read);
    coming[1](second.read);
    await vi.waitFor(() => expect(internals.loaded.get(modelReadKeyOf(knight()))).toBeTruthy());

    expect(first.letGo).toHaveBeenCalledTimes(1);
    expect(second.letGo).not.toHaveBeenCalled();
    expect(internals.loaded.get(modelReadKeyOf(knight()))!.gltf.scene).toBe(second.read.scene);
    layer.dispose();
  });

  it('leaves a mesh undrawn whose one material its piece has left undrawn', async () => {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const scene = new Group();
    const hood = new MeshStandardMaterial();
    hood.name = 'Hood';
    scene.add(new Mesh(new BoxGeometry(), hood), new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    const internals = layer as unknown as {
      reader: { read: (url: string) => Promise<unknown> };
      loaded: Map<string, { gltf: { scene: Group } } | null>;
    };
    vi.spyOn(internals.reader, 'read').mockResolvedValue({ scene, animations: [] });
    const bare = knight({
      model: { ...knight().model, look: modelLookOf('{"materials":{"Hood":{"hidden":true}}}') },
    });

    layer.set([bare]);
    await vi.waitFor(() => expect(internals.loaded.get(modelReadKeyOf(bare))).toBeTruthy());

    const meshes = internals.loaded.get(modelReadKeyOf(bare))!.gltf.scene.children;
    expect(meshes.map((mesh) => mesh.visible)).toEqual([false, true]);
    layer.dispose();
  });

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
      made: [],
      ownGlow: false,
    };
    (layer as unknown as { loaded: Map<string, unknown> }).loaded.set(modelReadKeyOf(knight()), loaded);
    return layer;
  }

  it('plays the motions a piece names standing and walking, and the others it names once they are changed', () => {
    const layer = layerOf(['Idle', 'Guard', 'Walk', 'Run']);

    layer.set([knight()]);
    expect(layer.motionOf('knight')).toBe('Idle');

    layer.set([
      knight({
        model: { identifier: 'knight-model', scale: 1, turnDeg: 0, idle: 'Guard', walk: '', ...PIECE_MODEL_AS_MADE },
      }),
    ]);
    expect(layer.motionOf('knight')).toBe('Guard');

    const running = {
      identifier: 'knight-model',
      scale: 1,
      turnDeg: 0,
      idle: 'Guard',
      walk: 'Run',
      ...PIECE_MODEL_AS_MADE,
    };
    layer.set([knight({ model: running, walking: true })]);
    expect(layer.motionOf('knight')).toBe('Run');

    layer.set([knight({ model: { ...running, walk: 'Walk' }, walking: true })]);
    expect(layer.motionOf('knight')).toBe('Walk');

    layer.set([knight({ model: { ...running, idle: '' }, walking: false })]);
    expect(layer.motionOf('knight')).toBe('Idle');
  });

  it('lets go of a model it could not read once it has gone unused, as of one it read', async () => {
    const layer = new ModelLayer(
      () => undefined,
      () => undefined,
      () => ({}) as WebGPURenderer
    );
    const internals = layer as unknown as {
      reader: { read: (url: string) => Promise<unknown> };
      loaded: Map<string, unknown>;
      readUrls: Map<string, string>;
      sweep: () => void;
    };
    vi.spyOn(internals.reader, 'read').mockRejectedValue(new Error('unreadable'));
    layer.set([knight()]);
    await vi.waitFor(() => expect(internals.loaded.get(modelReadKeyOf(knight()))).toBeNull());

    layer.set([]);
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + UNUSED_MODEL_KEEP_MS + 1);
    internals.sweep();

    expect([internals.loaded.size, internals.readUrls.size]).toEqual([0, 0]);
    vi.restoreAllMocks();
    layer.dispose();
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
      made: [],
      ownGlow: false,
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
    (layer as unknown as { loaded: Map<string, unknown> }).loaded.set(modelReadKeyOf(knight()), {
      gltf: { scene, animations: [] },
      size: new Vector3(1, 2, 1),
      foot: new Vector3(0, 0, 0),
      animated: false,
      made: [],
      ownGlow: false,
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

  describe('with a piece’s model that has no motion of its own', () => {
    /** Two figures of one model, read already, which move of themselves as a reader who lets them does. */
    function figures() {
      const layer = new ModelLayer(
        () => undefined,
        () => undefined,
        () => ({}) as WebGPURenderer
      );
      const scene = new Group();
      const body = new Mesh(new BufferGeometry());
      scene.add(body);
      (layer as unknown as { loaded: Map<string, unknown> }).loaded.set(modelReadKeyOf(knight()), {
        gltf: { scene, animations: [] },
        size: MADE.size,
        foot: new Vector3(),
        animated: false,
        made: [],
        ownGlow: false,
        parts: [{ mesh: body, within: new Matrix4() }],
      });
      layer.setTurning(true);
      const internals = layer as unknown as {
        stood: Map<string, { root: Group }>;
        herds: Map<string, { copies: number }>;
      };
      const other = knight({ owner: 'second', foot: { x: 300, y: 200, z: 0 } });
      return {
        layer,
        other,
        apart: () => [...internals.stood.keys()],
        together: () => [...internals.herds.values()].reduce((sum, herd) => sum + herd.copies, 0),
        footOf: (owner: string) => {
          const point = new Vector3(0, 0, 0).applyMatrix4(internals.stood.get(owner)!.root.matrixWorld);
          return [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000 + 0);
        },
      };
    }

    it('is drawn with the other copies while it stands, and apart while a hand walks it, hopping', () => {
      const { layer, other, apart, together, footOf } = figures();
      layer.set([knight(), other]);
      expect([apart(), together()]).toEqual([[], 2]);
      expect(layer.advance(0)).toBe(false);

      layer.set([knight({ walking: true }), other]);
      expect([apart(), together()]).toEqual([['knight'], 1]);
      expect(layer.advance(MADE_MOTION_MS.walk / 2)).toBe(true);
      expect(footOf('knight')[1]).toBeGreaterThan(5);

      layer.set([knight(), other]);
      expect([apart(), together()]).toEqual([[], 2]);
    });

    it('is stood apart for an act, carried towards the other in it, and drawn with the others again once it is through', () => {
      const { layer, other, apart, together, footOf } = figures();
      const blow = { key: 'blow', role: 'attack', atMs: 0, toward: { x: 1, y: 0 } } as const;
      layer.advance(0);

      layer.set([knight({ act: blow }), other]);
      expect([apart(), together()]).toEqual([['knight'], 1]);
      expect(layer.advance(MADE_MOTION_MS.attack * 0.46)).toBe(true);
      expect(footOf('knight')[0]).toBeGreaterThan(120);
      expect(footOf('knight')[2]).toBe(200);

      expect(layer.advance(MADE_MOTION_MS.attack + 1)).toBe(false);
      expect([apart(), together()]).toEqual([[], 2]);
      expect(layer.takeChanged()).toBe(true);

      layer.set([knight({ act: blow, rotateDeg: 90 }), other]);
      expect([apart(), together()]).toEqual([[], 2]);

      layer.set([knight({ act: { ...blow, key: 'another', atMs: 2000 } }), other]);
      expect(apart()).toEqual(['knight']);
    });

    it('keeps it apart until an act is through, though the act is asked for no more', () => {
      const { layer, other, apart, together } = figures();
      layer.advance(0);
      layer.set([knight({ act: { key: 'blow', role: 'attack', atMs: 0 } }), other]);
      layer.advance(100);

      layer.set([knight(), other]);
      expect([apart(), together()]).toEqual([['knight'], 1]);
      expect(layer.advance(200)).toBe(true);

      expect(layer.advance(MADE_MOTION_MS.attack + 1)).toBe(false);
      expect([apart(), together()]).toEqual([[], 2]);
    });

    it('keeps one down apart, as its going down left it, even for a reader who asks for less motion', () => {
      const { layer, other, apart, together } = figures();
      const down = { key: 'down', role: 'defeat', atMs: 0 } as const;

      layer.set([knight({ act: down }), other]);
      layer.advance(MADE_MOTION_MS.defeat * 3);
      expect([apart(), together()]).toEqual([['knight'], 1]);
      expect(layer.advance(MADE_MOTION_MS.defeat * 4)).toBe(false);

      layer.setTurning(false);
      expect([apart(), together()]).toEqual([['knight'], 1]);

      layer.set([knight(), other]);
      expect([apart(), together()]).toEqual([[], 2]);
    });

    it('is drawn with the others throughout for a reader who asks for less motion, and where its piece has turned being moved by hand off', () => {
      const still = figures();
      still.layer.setTurning(false);
      still.layer.set([knight({ walking: true }), still.other]);
      expect([still.apart(), still.together()]).toEqual([[], 2]);

      const unmoved = figures();
      const fixed = { ...knight().model, motions: { ...knight().model.motions, made: false } };
      unmoved.layer.set([
        knight({ walking: true, model: fixed, act: { key: 'down', role: 'defeat', atMs: 0 } }),
        unmoved.other,
      ]);
      expect([unmoved.apart(), unmoved.together()]).toEqual([[], 2]);
    });
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
      (layer as unknown as { loaded: Map<string, unknown> }).loaded.set(modelReadKeyOf(knight()), {
        gltf: { scene: new Group(), animations: [] },
        size: MADE.size,
        foot: new Vector3(),
        animated: false,
        made: [],
        ownGlow: false,
        parts: [
          { mesh: body, within: new Matrix4() },
          {
            mesh: wheel,
            within: new Matrix4(),
            spin: { at: new Vector3(0, 1, 0), axis: new Vector3(0, 0, 1), degPerSecond: 90, reach: 0.5 },
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
