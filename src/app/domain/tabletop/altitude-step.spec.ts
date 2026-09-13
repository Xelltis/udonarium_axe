import { ALTITUDE_LIMIT_CELLS, altitudeRungs, steppedAltitude } from '@axe/domain/tabletop/altitude-step';

describe('steppedAltitude', () => {
  it('goes up a cell at a time', () => {
    expect(steppedAltitude(0, true)).toBe(1);
    expect(steppedAltitude(1, true)).toBe(2);
  });

  it('comes back down the same way', () => {
    expect(steppedAltitude(2, false)).toBe(1);
    expect(steppedAltitude(1, false)).toBe(0);
  });

  it('goes on below the ground, which is where a pit is', () => {
    expect(steppedAltitude(0, false)).toBe(-1);
    expect(steppedAltitude(-1, false)).toBe(-2);
    expect(steppedAltitude(-1, true)).toBe(0);
  });

  it('takes a height set by hand onto the step it is heading for', () => {
    expect(steppedAltitude(0.5, true)).toBe(1);
    expect(steppedAltitude(0.5, false)).toBe(0);
    expect(steppedAltitude(2.75, true)).toBe(3);
    expect(steppedAltitude(-0.5, true)).toBe(0);
    expect(steppedAltitude(-0.5, false)).toBe(-1);
  });

  it('goes no further than the slider reaches', () => {
    expect(steppedAltitude(ALTITUDE_LIMIT_CELLS, true)).toBe(ALTITUDE_LIMIT_CELLS);
    expect(steppedAltitude(-ALTITUDE_LIMIT_CELLS, false)).toBe(-ALTITUDE_LIMIT_CELLS);
  });

  it('takes half cells when it is asked for them', () => {
    expect(steppedAltitude(0, true, 0.5)).toBe(0.5);
    expect(steppedAltitude(0.5, true, 0.5)).toBe(1);
    expect(steppedAltitude(1, false, 0.5)).toBe(0.5);
  });

  it('falls back on whole cells rather than standing still', () => {
    expect(steppedAltitude(0, true, 0)).toBe(1);
  });
});

describe('altitudeRungs', () => {
  it('marks every cell between the ground and the piece', () => {
    expect(altitudeRungs(3)).toEqual([1, 2, 3]);
  });

  it('marks them going down as well, counted from the ground', () => {
    expect(altitudeRungs(-2)).toEqual([1, 2]);
  });

  it('marks none where the piece is on the ground', () => {
    expect(altitudeRungs(0)).toEqual([]);
  });

  it('leaves off the part of a cell that a piece stops partway up', () => {
    expect(altitudeRungs(2.5)).toEqual([1, 2]);
  });
});
