import { hexChannels } from '@axe/core/util/hex-color';
import { mixColor, rampOf, stepOf } from '@axe/domain/effect/scene/effect-ramp';

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
