import type { ReplayBoardPiece, ReplayBoardScene } from '@axe/domain/replay/replay-board-view';
import { blendReplayCamera, easeInOutCubic, replayCameraTarget } from '@axe/domain/replay/video/replay-video-camera';

function piece(identifier: string, x: number, y: number): ReplayBoardPiece {
  return {
    identifier,
    aliasName: 'character',
    x,
    y,
    z: 0,
    size: 1,
    rotate: 0,
    name: '',
    imageIdentifier: '',
    shape: 'figure',
    width: 1,
    height: 1,
    showsName: true,
    isConcealed: false,
    color: '',
    title: '',
    text: '',
    count: 0,
    openCells: [],
    tiled: false,
    elevation: 0,
    view: 3,
    door: null,
    sideImageIdentifier: '',
  };
}

function scene(pieces: ReplayBoardPiece[], cells = 60): ReplayBoardScene {
  return {
    width: cells,
    height: cells,
    gridSize: 50,
    gridType: 0,
    gridShow: false,
    gridColor: '',
    imageIdentifier: '',
    backgroundImageIdentifier: '',
    pieces,
    overlay: null,
  };
}

const wide = 16 / 9;

describe('where the camera comes to rest', () => {
  it('frames the piece being watched with room round it, in the shape of the picture', () => {
    const frame = replayCameraTarget(scene([piece('a', 1000, 1000), piece('b', 2500, 2500)]), ['a'], wide, 'speaker');

    expect(frame.width / frame.height).toBeCloseTo(wide, 5);
    expect(frame.width).toBe(16 * 50);
    expect(frame.x).toBeLessThan(1000);
    expect(frame.x + frame.width).toBeGreaterThan(1050);
    expect(frame.x + frame.width).toBeLessThan(2500);
  });

  it('frames every piece in a wide shot', () => {
    const frame = replayCameraTarget(scene([piece('a', 1000, 1000), piece('b', 2500, 1000)]), [], wide, 'wide');

    expect(frame.x).toBeLessThanOrEqual(1000);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(2550);
  });

  it('falls back to every piece when the one watched is not on the table', () => {
    const board = scene([piece('a', 1000, 1000), piece('b', 2500, 1000)]);

    expect(replayCameraTarget(board, ['gone'], wide, 'speaker')).toEqual(replayCameraTarget(board, [], wide, 'wide'));
  });

  it('takes in the way a piece went as well as where it is', () => {
    const frame = replayCameraTarget(scene([piece('a', 2000, 1000)]), ['a'], wide, 'action', [
      { x: 200, y: 1000, z: 0 },
    ]);

    expect(frame.x).toBeLessThanOrEqual(200);
  });

  it('keeps the frame on the table', () => {
    const frame = replayCameraTarget(scene([piece('a', 0, 0)]), ['a'], wide, 'speaker');

    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
  });

  it('centres a table smaller than the frame', () => {
    const frame = replayCameraTarget(scene([], 4), [], wide, 'wide');

    expect(frame.x + frame.width / 2).toBeCloseTo(100, 5);
    expect(frame.y + frame.height / 2).toBeCloseTo(100, 5);
  });
});

describe('moving the camera', () => {
  const near = { x: 0, y: 0, width: 400, height: 225 };
  const far = { x: 0, y: 0, width: 1600, height: 900 };

  it('starts where it was and ends where it is going', () => {
    expect(blendReplayCamera(near, far, 0)).toEqual(near);
    expect(blendReplayCamera(near, far, 1)).toEqual(far);
  });

  it('zooms by ratio, so halfway between four times apart is twice as wide', () => {
    expect(blendReplayCamera(near, far, 0.5).width).toBeCloseTo(800, 5);
  });

  it('eases in and out', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
  });
});
