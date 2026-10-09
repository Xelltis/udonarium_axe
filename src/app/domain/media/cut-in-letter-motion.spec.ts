import {
  LETTER_AT_REST,
  letterFrames,
  letterMotionOf,
  letterPoseAt,
  lettersOf,
  letterTimingOf,
} from '@axe/domain/media/cut-in-letter-motion';

describe('letters coming on one at a time', () => {
  it('reads an empty or unknown motion as none', () => {
    expect(letterMotionOf('pop')).toBe('pop');
    expect(letterMotionOf('')).toBeNull();
    expect(letterMotionOf('from-a-newer-version')).toBeNull();
    expect(letterMotionOf(undefined)).toBeNull();
  });

  it('takes the motion’s own timing for 0, and holds what was set to its bounds', () => {
    expect(letterTimingOf('fade', 0, 0)).toEqual({ staggerMs: 60, durationMs: 400 });
    expect(letterTimingOf('fade', 5000, 9999)).toEqual({ staggerMs: 1000, durationMs: 3000 });
    expect(letterTimingOf('fade', 'x', 10)).toEqual({ staggerMs: 60, durationMs: 50 });
    expect(letterTimingOf('type', 30, 500).durationMs).toBe(0);
  });

  it('numbers the letters in the order they come on, across lines, keeping emoji whole', () => {
    expect(lettersOf('あ👍\nい').map((line) => line.map((letter) => [letter.text, letter.rank]))).toEqual([
      [
        ['あ', 0],
        ['👍', 1],
      ],
      [['い', 2]],
    ]);
  });

  it('types each letter down at its turn, and fades each in over its while', () => {
    const typed = letterTimingOf('type', 100, 0);
    expect(letterPoseAt('type', 2, 199, 40, typed).opacity).toBe(0);
    expect(letterPoseAt('type', 2, 200, 40, typed).opacity).toBe(1);

    const faded = letterTimingOf('fade', 100, 400);
    expect(letterPoseAt('fade', 1, 300, 40, faded).opacity).toBeCloseTo(0.5);
  });

  it('settles every letter at rest once it has come on', () => {
    for (const motion of ['type', 'fade', 'pop', 'slide'] as const) {
      expect(letterPoseAt(motion, 3, 10_000, 40, letterTimingOf(motion, 0, 0)), motion).toEqual(LETTER_AT_REST);
    }
  });

  it('keeps waving and shaking letters within a small reach, the same on every screen', () => {
    const wave = letterTimingOf('wave', 0, 0);
    for (let at = 0; at < 2000; at += 37) expect(Math.abs(letterPoseAt('wave', 2, at, 40, wave).dy)).toBeLessThan(5);

    const shake = letterTimingOf('shake', 0, 0);
    expect(letterPoseAt('shake', 1, 123, 40, shake)).toEqual(letterPoseAt('shake', 1, 123, 40, shake));
    expect(Math.abs(letterPoseAt('shake', 1, 123, 40, shake).dx)).toBeLessThan(2.5);
  });

  it('spans the whole scene in its keyframes, with a letter’s first and last moments among them', () => {
    const frames = letterFrames('fade', 1, { startMs: 1000, endMs: 3000 }, 4000, 40, letterTimingOf('fade', 100, 400));

    expect(frames[0].offset).toBe(0);
    expect(frames.at(-1)!.offset).toBe(1);
    expect(frames.map((frame) => frame.offset)).toEqual(expect.arrayContaining([1100 / 4000, 1500 / 4000]));
    expect(frames.find((frame) => frame.offset === 1100 / 4000)!.opacity).toBe(0);
    expect(frames.find((frame) => frame.offset === 1500 / 4000)!.opacity).toBe(1);
  });

  it('samples a letter that keeps moving no more than it is allowed', () => {
    const frames = letterFrames(
      'wave',
      0,
      { startMs: 0, endMs: 60_000 },
      60_000,
      40,
      letterTimingOf('wave', 0, 0),
      100
    );

    expect(frames.length).toBeLessThanOrEqual(104);
  });
});
