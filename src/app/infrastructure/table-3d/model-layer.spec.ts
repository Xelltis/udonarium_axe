import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import { placementOf } from '@axe/infrastructure/table-3d/model-layer';
import { Vector3 } from 'three/webgpu';

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
