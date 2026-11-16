import { STAGE_FIELD_OF_VIEW, stageCameraPlace, stageLampOf } from '@axe/infrastructure/table-3d/effect-stage-view';
import { PerspectiveCamera, Vector3 } from 'three';

/** The stage as the preview lays it out: a board of ten cells by seven, the struck stand-in in the middle. */
const STAGE = {
  cellPx: 50,
  across: 10,
  figures: [
    { x: 0, y: 0, dim: false },
    { x: -150, y: 75, dim: true },
  ],
};

/** Where a point of the stage, given across the board, along it and up, falls in a box of this shape, from -1 to 1 each way. */
function seenAt(aspect: number, zoomOut: number, across: number, along: number, up: number): { x: number; y: number } {
  const place = stageCameraPlace(STAGE, aspect, zoomOut);
  const camera = new PerspectiveCamera(STAGE_FIELD_OF_VIEW, aspect, 1, 10000);
  camera.position.set(...place.position);
  camera.lookAt(...place.lookAt);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const seen = new Vector3(across, up, along).project(camera);
  return { x: seen.x, y: seen.y };
}

/** How far off the camera stands from the point it looks at. */
function distanceOf(aspect: number, zoomOut: number): number {
  const { position, lookAt } = stageCameraPlace(STAGE, aspect, zoomOut);
  return Math.hypot(position[0] - lookAt[0], position[1] - lookAt[1], position[2] - lookAt[2]);
}

describe('stageCameraPlace', () => {
  it('keeps the stand-in an aimed effect leaves from inside a wide, short box', () => {
    for (const across of [-165, -135]) {
      for (const up of [0, 45]) {
        expect(Math.abs(seenAt(352 / 113, 1, across, 90, up).x)).toBeLessThan(0.95);
      }
    }
  });

  it('keeps two cells of air over the struck stand-in inside a wide, short box', () => {
    expect(seenAt(352 / 113, 1, 0, 0, 100).y).toBeLessThan(0.95);
    expect(seenAt(500 / 113, 1, 0, 0, 100).y).toBeLessThan(0.95);
  });

  it('stands off as far as fits the board where the box is as tall as the board shows', () => {
    const halfView = Math.tan(((STAGE_FIELD_OF_VIEW / 2) * Math.PI) / 180);
    const boardFit = (250 * 0.85) / halfView / (126 / 88);
    expect(distanceOf(126 / 88, 1)).toBeGreaterThanOrEqual(boardFit);
    expect(distanceOf(126 / 88, 1)).toBeLessThan(boardFit * 1.1);
  });

  it('stands further off for a larger effect', () => {
    expect(distanceOf(352 / 113, 2)).toBeCloseTo(distanceOf(352 / 113, 1) * 2, 6);
  });
});

describe('stageLampOf', () => {
  it('lights to its reach and no further, without falling off on the way', () => {
    expect(stageLampOf({ strength: 1, reachPx: 140 })).toEqual(expect.objectContaining({ distance: 140, decay: 0 }));
  });

  it('lights as much more strongly as it is told', () => {
    const weak = stageLampOf({ strength: 0.5, reachPx: 100 }).intensity;
    const strong = stageLampOf({ strength: 2, reachPx: 100 }).intensity;
    expect(strong).toBeCloseTo(weak * 4, 6);
    expect(strong).toBeLessThan(10);
  });
});
