import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import { ModelLayer, partPlacementsOf, placementOf } from '@axe/infrastructure/table-3d/model-layer';
import { meshesOf, triangleCountOf } from '@axe/infrastructure/three-kit/model-faces';
import {
  AnimationClip,
  BufferAttribute,
  BufferGeometry,
  Group,
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
});
