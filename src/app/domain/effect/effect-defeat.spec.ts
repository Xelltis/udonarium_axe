import { defeatPictureHeight, defeatReactionOf } from '@axe/domain/effect/effect-defeat';
import { EFFECT_KINDS } from '@axe/domain/effect/effect-kind';

describe('defeatReactionOf()', () => {
  it('answers back to the piece itself only for an effect that knocks it down', () => {
    // An effect around it does not read as falling.
    expect(defeatReactionOf('dissolve')).toBe('dissolve');
    expect(defeatReactionOf('bisect')).toBe('bisect');
    expect(defeatReactionOf('gore')).toBe('flinch');
  });

  it('leaves the piece alone otherwise', () => {
    for (const kind of EFFECT_KINDS) {
      if (kind === 'dissolve' || kind === 'bisect' || kind === 'gore') continue;
      expect(defeatReactionOf(kind)).toBe('');
    }
  });
});

describe('defeatPictureHeight()', () => {
  it('tells how tall the picture is drawn by the effects that cut it up', () => {
    expect(defeatPictureHeight('dissolve')).toBeCloseTo(2.04);
    expect(defeatPictureHeight('bisect')).toBeCloseTo(1.24);
  });

  it('answers 1 for an effect that leaves the picture alone', () => {
    expect(defeatPictureHeight('gore')).toBe(1);
    expect(defeatPictureHeight('slash')).toBe(1);
  });
});
