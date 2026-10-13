import { NO_CUE_POINTS, readCuePoints, withCuePoint, writeCuePoints } from '@axe/domain/media/cue-points';

describe('cue points', () => {
  it('reads back what was written', () => {
    const points = [12.5, null, 64.25, null];

    expect(readCuePoints(writeCuePoints(points))).toEqual(points);
  });

  it('writes nothing when every slot is empty', () => {
    expect(writeCuePoints(NO_CUE_POINTS)).toBe('');
    expect(writeCuePoints([])).toBe('');
  });

  it('reads empty or broken text as every slot empty', () => {
    expect(readCuePoints('')).toEqual(NO_CUE_POINTS);
    expect(readCuePoints(undefined)).toEqual(NO_CUE_POINTS);
    expect(readCuePoints('[1,')).toEqual(NO_CUE_POINTS);
    expect(readCuePoints('{"a":1}')).toEqual(NO_CUE_POINTS);
  });

  it('reads a slot that holds no point at or after the start as empty, and fills missing slots', () => {
    expect(readCuePoints(JSON.stringify([3, '', -1, 'x', 9]))).toEqual([3, null, null, null]);
    expect(readCuePoints(JSON.stringify([7]))).toEqual([7, null, null, null]);
  });

  it('sets or empties one slot, leaving the others', () => {
    const points = withCuePoint(NO_CUE_POINTS, 2, 30);

    expect(points).toEqual([null, null, 30, null]);
    expect(withCuePoint(points, 2, null)).toEqual(NO_CUE_POINTS);
  });
});
