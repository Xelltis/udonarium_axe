import { BOARD_TO_SCENE, sceneDirection } from '@axe/infrastructure/three-kit/board-space';
import { Vector3 } from 'three/webgpu';

describe('the board’s space as the scene’s', () => {
  it('carries the board’s south into the scene’s z and its up into the scene’s y', () => {
    expect(sceneDirection({ x: 1, y: 2, z: 3 }).toArray()).toEqual([1, 3, 2]);
  });

  it('carries a point the same way through the matrix, and back again through it', () => {
    const point = new Vector3(1, 2, 3);

    expect(point.clone().applyMatrix4(BOARD_TO_SCENE).toArray()).toEqual([1, 3, 2]);
    expect(point.clone().applyMatrix4(BOARD_TO_SCENE).applyMatrix4(BOARD_TO_SCENE).toArray()).toEqual([1, 2, 3]);
  });
});
