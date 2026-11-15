import { nothingStaged } from '@axe/domain/effect/scene/choreography';
import { flameRampOf } from '@axe/domain/effect/scene/effect-ramp';
import { drawFireShot, type FireFlight } from '@axe/domain/effect/scene/shot/fire-shot';

const RAMP = flameRampOf('#ffe08a', '#ff4a1f');
const CELL = 50;

function flightOf(grade: 1 | 2 | 3, share = 0.5): FireFlight {
  const pathAt = (along: number) => ({ x: 100 + along * 400, y: 300, z: 30 });
  return {
    at: pathAt(share),
    way: { x: 1, y: 0, z: 0 },
    cell: CELL,
    share,
    pathAt,
    seconds: share * 0.4,
    seed: 5,
    grade,
    forward: 20,
  };
}

function drawnOf(grade: 1 | 2 | 3, share = 0.5) {
  const drawn = nothingStaged();
  drawFireShot(drawn, flightOf(grade, share), RAMP);
  return drawn;
}

describe('a shot of fire in flight', () => {
  it('flies as a head of fire with a tail of flame torn out behind it, and no ball of light', () => {
    const drawn = drawnOf(2);
    const head = drawn.motes.filter((mote) => mote.shape === 'blaze');
    const tail = drawn.motes.filter((mote) => mote.shape === 'lick');

    expect(head.length).toBeGreaterThan(0);
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every((mote) => (mote.velocity?.x ?? 0) < 0)).toBe(true);
    expect(drawn.motes.some((mote) => mote.shape === 'puff')).toBe(false);
    expect(drawn.ribbons).toHaveLength(0);
    expect(drawn.lights).toHaveLength(1);
  });

  it('is a dart at the lowest grade and a ball of fire that leaves smoke above it', () => {
    const widthOf = (grade: 1 | 2 | 3) =>
      Math.max(
        ...drawnOf(grade)
          .motes.filter((mote) => mote.shape === 'blaze')
          .map((mote) => mote.size)
      );
    const tailOf = (grade: 1 | 2 | 3) =>
      Math.max(
        ...drawnOf(grade)
          .motes.filter((mote) => mote.shape === 'lick')
          .map((mote) => (mote.trail ?? 0) * 100 + mote.size)
      );

    expect(widthOf(2)).toBeGreaterThan(widthOf(1) * 1.4);
    expect(tailOf(2)).toBeGreaterThan(tailOf(1) * 1.2);
    expect(drawnOf(1).motes.some((mote) => mote.shape === 'billow')).toBe(false);
    expect(drawnOf(2).motes.some((mote) => mote.shape === 'billow')).toBe(true);
  });

  it('sheds nothing behind where it was thrown from', () => {
    const drawn = drawnOf(3, 0.01);

    expect(drawn.motes.filter((mote) => mote.shape === 'spark')).toHaveLength(0);
    expect(drawn.motes.filter((mote) => mote.shape === 'billow')).toHaveLength(0);
  });
});
