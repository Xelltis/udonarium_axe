import { nothingStaged } from '@axe/domain/effect/scene/choreography';
import { layShockRing, laySoot } from '@axe/domain/effect/scene/fire/fire-parts';

const CELL = 50;
const FLOOR = { x: 0, y: 0, z: 0 };

describe('a shock ring on the floor', () => {
  const ringAt = (t: number, lifeS = 0.4) => {
    const drawn = nothingStaged();
    layShockRing(drawn, FLOOR, CELL * 0.3, CELL * 2.6, CELL * 0.16, '#9fd0ff', t, lifeS);
    return drawn.floor;
  };
  const lineOf = (t: number) => ringAt(t).find((mark) => mark.blend === 'light')!;

  it('is a thin line of light over a band of its own colour', () => {
    const marks = ringAt(0.1);
    const line = lineOf(0.1);
    const band = marks.find((mark) => mark.blend === 'color')!;

    expect(marks.every((mark) => mark.shape === 'ring')).toBe(true);
    expect(band.color).toBe(line.color);
    expect(band.radius).toBe(line.radius);
    expect(band.width).toBeGreaterThan(line.width);
  });

  it('is never drawn as thick as a tenth of a cell', () => {
    for (const t of [0, 0.02, 0.1, 0.2, 0.3, 0.39]) {
      const line = lineOf(t);
      expect(line.width * line.radius).toBeLessThan(CELL * 0.1);
      expect(line.width * line.radius).toBeGreaterThan(0.5);
    }
  });

  it('races out fast at first and fades all the way as it goes', () => {
    const [early, half, late] = [lineOf(0.04), lineOf(0.2), lineOf(0.36)];

    expect(early.radius - CELL * 0.3).toBeGreaterThan((CELL * 2.3) / 4);
    expect(half.alpha).toBeLessThan(early.alpha * 0.7);
    expect(late.alpha).toBeLessThan(half.alpha * 0.4);
    expect(late.alpha).toBeLessThan(0.1);
  });

  it('is not drawn before it sets out or once it has run its course', () => {
    expect(ringAt(-0.01)).toEqual([]);
    expect(ringAt(0.4)).toEqual([]);
  });
});

describe('soot burnt into the floor', () => {
  const sootAt = (t: number, clearing = 1) => {
    const drawn = nothingStaged();
    laySoot(drawn, FLOOR, CELL * 0.7, t, 1.2, clearing);
    return drawn.floor;
  };

  it('is a soft-edged smudge of the colour of soot, with no ragged plate in it', () => {
    const marks = sootAt(2);

    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((mark) => mark.shape === 'disc' && mark.blend === 'color')).toBe(true);
    for (const mark of marks) {
      const [red, green, blue] = [1, 3, 5].map((at) => parseInt(mark.color.slice(at, at + 2), 16));
      expect(Math.max(red, green, blue)).toBeLessThan(0x40);
    }
  });

  it('glows like embers at once and cools to soot alone', () => {
    const glowOf = (t: number) => sootAt(t).find((mark) => mark.blend === 'light');

    expect(glowOf(0.1)!.alpha).toBeGreaterThan(glowOf(0.6)!.alpha);
    expect(glowOf(0.1)!.radius).toBeGreaterThan(glowOf(0.6)!.radius);
    expect(glowOf(1.2)).toBeUndefined();
  });

  it('clears as it is told to, and is not there before it is burnt', () => {
    const darkest = (clearing: number) => Math.max(...sootAt(2, clearing).map((mark) => mark.alpha));

    expect(darkest(0.5)).toBeCloseTo(darkest(1) / 2);
    expect(sootAt(2, 0)).toEqual([]);
    expect(sootAt(-0.01)).toEqual([]);
  });
});
