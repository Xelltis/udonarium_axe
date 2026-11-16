import { hexChannels } from '@axe/core/util/hex-color';
import { flameRampOf, isFlame, mixColor, rampOf, stepOf } from '@axe/domain/effect/scene/effect-ramp';

const brightness = (color: string) => hexChannels(color)!.reduce((sum, channel) => sum + channel, 0);

describe('rampOf()', () => {
  it('runs from a shadow deeper than the dark colour up through the light colour to white', () => {
    const ramp = rampOf('#ffd27f', '#ff5a33', 7);

    expect(ramp).toHaveLength(7);
    expect(ramp[6]).toBe('#ffffff');
    expect(brightness(ramp[0])).toBeLessThan(brightness('#ff5a33'));
    for (let index = 1; index < ramp.length; index++) {
      expect(brightness(ramp[index])).toBeGreaterThanOrEqual(brightness(ramp[index - 1]));
    }
  });

  it('makes do with the usual fire for colours that are not written in hex', () => {
    expect(rampOf('gold', 'red', 5)).toEqual(rampOf('#ffd27f', '#ff5a33', 5));
  });
});

describe('stepOf() and mixColor()', () => {
  it('picks a step by how far up the ramp, holding at either end', () => {
    const ramp = rampOf('#88ccff', '#2244aa', 5);

    expect(stepOf(ramp, 0)).toBe(ramp[0]);
    expect(stepOf(ramp, 1.4)).toBe('#ffffff');
    expect(stepOf(ramp, 0.5)).toBe(ramp[2]);
  });

  it('takes one colour towards another', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColor('#102030', '#ffffff', 0)).toBe('#102030');
  });
});

describe('isFlame() and flameRampOf()', () => {
  it('takes red and orange for the colour of flame, and gold, blue and grey for something else', () => {
    expect(isFlame('#ff4d2e')).toBe(true);
    expect(isFlame('#ff7a3d')).toBe(true);
    expect(isFlame('#ff2f14')).toBe(true);
    expect(isFlame('#ffc24a')).toBe(false);
    expect(isFlame('#ffb320')).toBe(false);
    expect(isFlame('#39a7ff')).toBe(false);
    expect(isFlame('#808080')).toBe(false);
  });

  it('takes the middle steps of a fire through orange and gold, with no blue to turn them to salmon', () => {
    const plain = rampOf('#fff0b8', '#ff3a12', 7);
    const fire = flameRampOf('#fff0b8', '#ff3a12');
    const blueOf = (color: string) => hexChannels(color)![2];

    expect(fire).toHaveLength(7);
    expect([fire[0], fire[1], fire[4], fire[5], fire[6]]).toEqual([plain[0], plain[1], plain[4], plain[5], plain[6]]);
    expect(blueOf(fire[2])).toBeLessThan(blueOf(plain[2]) / 2);
    expect(blueOf(fire[3])).toBeLessThan(blueOf(plain[3]) / 2);
    expect(brightness(fire[3])).toBeGreaterThan(brightness(fire[2]));
    expect(brightness(fire[2])).toBeGreaterThan(brightness(fire[1]));
  });

  it('leaves the steps of an effect that is no flame as they are', () => {
    expect(flameRampOf('#dff6ff', '#39a7ff')).toEqual(rampOf('#dff6ff', '#39a7ff', 7));
  });
});
