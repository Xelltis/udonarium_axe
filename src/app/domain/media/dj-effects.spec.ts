import { echoDelayS, hasDjEffects, NO_DJ_EFFECTS, readDjEffects, writeDjEffects } from '@axe/domain/media/dj-effects';

describe('DJ effects', () => {
  it('writes nothing while every effect is off, and reads empty text as all off', () => {
    expect(writeDjEffects(NO_DJ_EFFECTS)).toBe('');
    expect(readDjEffects('')).toEqual(NO_DJ_EFFECTS);
    expect(hasDjEffects(NO_DJ_EFFECTS)).toBe(false);
  });

  it('writes only the effects that are on, and reads them back', () => {
    const effects = { filter: -0.4567, echo: 0, reverb: 0.25 };
    const text = writeDjEffects(effects);

    expect(JSON.parse(text)).toEqual({ filter: -0.457, reverb: 0.25 });
    expect(readDjEffects(text)).toEqual({ filter: -0.457, echo: 0, reverb: 0.25 });
    expect(hasDjEffects(readDjEffects(text))).toBe(true);
  });

  it('reads broken text, or an effect that is not a number, as off', () => {
    expect(readDjEffects('{"filter":')).toEqual(NO_DJ_EFFECTS);
    expect(readDjEffects('[0.5]')).toEqual(NO_DJ_EFFECTS);
    expect(readDjEffects(JSON.stringify({ filter: '', echo: '0.5', reverb: null }))).toEqual(NO_DJ_EFFECTS);
  });

  it('brings an effect out of range into it, and a filter near the middle to none', () => {
    expect(readDjEffects(JSON.stringify({ filter: -3, echo: 2, reverb: -1 }))).toEqual({
      filter: -1,
      echo: 1,
      reverb: 0,
    });
    expect(readDjEffects(JSON.stringify({ filter: 0.01 })).filter).toBe(0);
    expect(writeDjEffects({ filter: 0.01, echo: 0, reverb: 0 })).toBe('');
  });

  it('times the echo to three quarters of a beat, or 0.375 s without one', () => {
    expect(echoDelayS(120)).toBeCloseTo(0.375, 9);
    expect(echoDelayS(100)).toBeCloseTo(0.45, 9);
    expect(echoDelayS(null)).toBe(0.375);
  });
});
