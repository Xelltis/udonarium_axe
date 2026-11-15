import { hexChannels } from '@axe/core/util/hex-color';
import { nothingStaged } from '@axe/domain/effect/scene/choreography';
import { isFlame, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import {
  FIRE_SHEETS,
  type Flame,
  layBillows,
  layFlames,
  roundMote,
  smokeColorOf,
} from '@axe/domain/effect/scene/fire/fire-body';

const RAMP = rampOf('#ffd166', '#ff4d2e', 7);

function flameOf(shape: Flame['shape'], heat: number, x = 0): Flame {
  return {
    shape,
    at: { x, y: 0, z: 10 },
    heading: { x: 0, y: 0, z: 1 },
    wide: 40,
    long: 90,
    heat,
    flowed: 1,
    variant: 2,
  };
}

describe('the body of a fire', () => {
  it('lays every flame’s rim before any flame’s body, and the hearts last, so the flames run into one fire', () => {
    const drawn = nothingStaged();

    layFlames(drawn, [flameOf('lick', 1, 0), flameOf('blaze', 1, 50), flameOf('lick', 1, 100)], RAMP, { forward: 5 });

    expect(drawn.motes).toHaveLength(3 * FIRE_SHEETS);
    const sizes = drawn.motes.map((mote) => mote.size);
    for (let sheet = 1; sheet < FIRE_SHEETS; sheet++) {
      const before = sizes.slice((sheet - 1) * 3, sheet * 3);
      const after = sizes.slice(sheet * 3, (sheet + 1) * 3);
      expect(Math.max(...after)).toBeLessThan(Math.min(...before));
    }
    expect(drawn.motes.every((mote) => mote.blend === 'color')).toBe(true);
    expect(drawn.motes.every((mote) => mote.shape === 'lick' || mote.shape === 'blaze')).toBe(true);
  });

  it('is white at the heart only while it is at its hottest, and loses its sheets from the heart out as it cools', () => {
    const sheetsAt = (heat: number) => {
      const drawn = nothingStaged();
      layFlames(drawn, [flameOf('blaze', heat)], RAMP, { forward: 5 });
      return drawn.motes;
    };

    expect(sheetsAt(1).at(-1)?.core).toBe('#ffffff');
    expect(sheetsAt(0.7)).toHaveLength(FIRE_SHEETS);
    expect(sheetsAt(0.7).at(-1)?.core).not.toBe('#ffffff');
    expect(sheetsAt(0.3)).toHaveLength(FIRE_SHEETS - 1);
    expect(sheetsAt(0.1)).toHaveLength(1);
    expect(sheetsAt(0.1)[0].core).toBeUndefined();
    expect(sheetsAt(0)).toHaveLength(0);
  });

  it('roots a lick where it is and reaches it out the way it is headed', () => {
    const drawn = nothingStaged();

    layFlames(drawn, [flameOf('lick', 0.1)], RAMP, { forward: 5 });

    const [rim] = drawn.motes;
    expect(rim.z).toBeCloseTo(10 + 90, 5);
    expect((rim.trail ?? 0) * 100 + rim.size).toBeCloseTo(90, 5);
  });

  it('sets a blaze about its middle, and holds what stands about a piece to its own depth', () => {
    const mote = roundMote(
      'blaze',
      { x: 0, y: 0, z: 100 },
      { x: 0, y: 0, z: 2 },
      40,
      60,
      0,
      { color: '#ff0000', alpha: 1, variant: 0 },
      { forward: 3, exact: true }
    );

    expect(mote.z).toBeCloseTo(130, 5);
    expect((mote.trail ?? 0) * 100 + mote.size).toBeCloseTo(60, 5);
    expect(mote.exactDepth).toBe(true);
  });

  it('leaves soot behind a flame and a haze of its own colour behind what is no flame', () => {
    const billow = {
      at: { x: 0, y: 0, z: 50 },
      heading: { x: 0, y: 0, z: 1 },
      wide: 60,
      long: 70,
      alpha: 0.6,
      flowed: 0,
      variant: 0,
    };
    const soot = nothingStaged();
    const haze = nothingStaged();
    const cold = rampOf('#dff6ff', '#39a7ff', 7);

    layBillows(soot, [billow, { ...billow, alpha: 0 }], RAMP, true, { forward: 5 });
    layBillows(haze, [billow], cold, false, { forward: 5 });

    expect(soot.motes).toHaveLength(1);
    expect(soot.motes[0].shape).toBe('billow');
    expect(isFlame(soot.motes[0].color)).toBe(false);
    expect(hexChannels(haze.motes[0].color)![2]).toBeGreaterThan(hexChannels(haze.motes[0].color)![0]);
    expect(smokeColorOf(RAMP, true, 1)).not.toBe(smokeColorOf(RAMP, true, 0));
  });
});
