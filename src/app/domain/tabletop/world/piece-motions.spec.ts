import {
  eased,
  motionEndPose,
  motionLengthMs,
  motionPoseAt,
  movedSprite,
} from '@axe/domain/tabletop/world/piece-motions';
import { spriteAxes, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

const EAST = { x: 1, y: 0, z: 0 };
const SOUTH = { x: 0, y: 1, z: 0 };
const PIVOT = { point: { x: 100, y: 100, z: 0 }, across: EAST, down: SOUTH };

function sprite(overrides: Partial<TableWorldSprite> = {}): TableWorldSprite {
  return {
    id: 'die#picture',
    owner: 'die',
    kind: 'dice-symbol',
    centre: { x: 100, y: 100, z: 25 },
    widthPx: 50,
    heightPx: 50,
    facing: 'eye',
    look: { kind: 'picture', url: 'face.png' },
    brightness: 1,
    twoSided: true,
    ...overrides,
  };
}

function near(actual: { x: number; y: number; z: number }, expected: { x: number; y: number; z: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
}

describe('eased', () => {
  it('follows a straight curve straight', () => {
    expect(eased([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 6);
  });

  it('eases as CSS eases, half way through `ease` being about four fifths of the way', () => {
    expect(eased([0.25, 0.1, 0.25, 1], 0.5)).toBeCloseTo(0.8024, 3);
  });

  it('starts at nothing and ends at all of it', () => {
    expect(eased([0.22, 0.9, 0.3, 1], 0)).toBe(0);
    expect(eased([0.22, 0.9, 0.3, 1], 1)).toBe(1);
  });
});

describe('motionPoseAt', () => {
  it('starts a tumble small and unturned, and comes to its first keyframe where the page does', () => {
    expect(motionPoseAt('dice-tumble-a', 0)).toEqual({
      across: 0,
      down: 0,
      out: 0,
      scale: 0.85,
      turnDeg: 0,
      flipDeg: 0,
      shown: 1,
    });
    const first = motionPoseAt('dice-tumble-a', 0.35 * motionLengthMs('dice-tumble-a'))!;
    expect(first.across).toBeCloseTo(20, 6);
    expect(first.down).toBeCloseTo(-16, 6);
    expect(first.scale).toBeCloseTo(1.18, 6);
    expect(first.turnDeg).toBeCloseTo(240, 6);
  });

  it('eases each stretch between keyframes on its own', () => {
    const half = motionPoseAt('bounce-in', 0.25 * motionLengthMs('bounce-in'))!;
    expect(half.scale).toBeCloseTo(1.5 * eased([0.25, 0.1, 0.25, 1], 0.5), 6);
  });

  it('lifts a flipping coin off its face and turns it over the line down its face', () => {
    const pose = motionPoseAt('coin-flip', 0.35 * motionLengthMs('coin-flip'))!;
    expect(pose.out).toBeCloseTo(90, 6);
    expect(pose.flipDeg).toBeCloseTo(720, 6);
  });

  it('shakes a struck piece side to side across its face, and brings it back to rest', () => {
    expect(motionPoseAt('hit-shake', 0.12 * motionLengthMs('hit-shake'))!.across).toBeCloseTo(-5, 6);
    expect(motionPoseAt('hit-shake', 0.28 * motionLengthMs('hit-shake'))!.across).toBeCloseTo(4.5, 6);
    expect(motionPoseAt('hit-shake', motionLengthMs('hit-shake') - 1)!.across).toBeCloseTo(0, 1);
  });

  it('shows less of a piece as it falls, and nothing of it once it has fallen', () => {
    expect(motionPoseAt('defeat-bisect', 0.1 * motionLengthMs('defeat-bisect'))!.shown).toBe(1);
    expect(motionPoseAt('defeat-bisect', 0.5 * motionLengthMs('defeat-bisect'))!.shown).toBe(0);
    expect(motionEndPose('defeat-dissolve').shown).toBe(0);
    expect(motionEndPose('shuffle')).toEqual({
      across: 0,
      down: 0,
      out: 0,
      scale: 1,
      turnDeg: 720,
      flipDeg: 0,
      shown: 1,
    });
  });

  it('has nothing to say once the move has played through', () => {
    expect(motionPoseAt('shuffle', motionLengthMs('shuffle'))).toBeNull();
  });
});

describe('movedSprite', () => {
  it('turns a picture turned to the eye in the face, about the middle of where its piece stands', () => {
    const moved = movedSprite(
      sprite(),
      { across: 0, down: 0, out: 0, scale: 1, turnDeg: 90, flipDeg: 0, shown: 1 },
      PIVOT
    );

    near(moved.centre, { x: 100, y: 100, z: 25 });
    expect(moved.facing).toBe('eye');
    const axes = spriteAxes(moved, { right: EAST, up: { x: 0, y: 0, z: 1 } });
    near(axes.across, SOUTH);
    near(axes.down, { x: 0, y: 0, z: -1 });
  });

  it('turns a sprite lying a fixed way with the piece, across towards down', () => {
    const lying = sprite({ centre: { x: 120, y: 100, z: 1 }, facing: { across: EAST, down: SOUTH } });
    const moved = movedSprite(
      lying,
      { across: 0, down: 0, out: 0, scale: 1, turnDeg: 90, flipDeg: 0, shown: 1 },
      PIVOT
    );

    near(moved.centre, { x: 100, y: 120, z: 1 });
    expect(moved.facing).not.toBe('eye');
    if (moved.facing === 'eye') return;
    near(moved.facing.across, SOUTH);
    near(moved.facing.down, { x: -1, y: 0, z: 0 });
  });

  it('grows a sprite about the pivot and shifts it across, down and out of the face', () => {
    const moved = movedSprite(
      sprite(),
      { across: 10, down: -5, out: 3, scale: 2, turnDeg: 0, flipDeg: 0, shown: 1 },
      PIVOT
    );

    near(moved.centre, { x: 110, y: 95, z: 53 });
    expect(moved.widthPx).toBe(100);
    expect(moved.heightPx).toBe(100);
    expect(moved.turn).toBeUndefined();
  });
});
