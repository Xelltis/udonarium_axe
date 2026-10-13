import { NO_DJ_PADS, readDjPads, withPad, writeDjPads } from '@axe/domain/media/dj-pads';

describe('DJ pads', () => {
  it('writes nothing while every pad is empty, and reads empty text as every pad empty', () => {
    expect(writeDjPads(NO_DJ_PADS)).toBe('');
    expect(readDjPads('')).toEqual(NO_DJ_PADS);
    expect(NO_DJ_PADS).toHaveLength(8);
  });

  it('reads back what was written', () => {
    const pads = withPad(withPad(NO_DJ_PADS, 0, 'airhorn'), 7, 'applause');

    expect(readDjPads(writeDjPads(pads))).toEqual(pads);
  });

  it('reads broken text as every pad empty, and a pad holding anything but text as empty', () => {
    expect(readDjPads('[1,')).toEqual(NO_DJ_PADS);
    expect(readDjPads('{"0":"a"}')).toEqual(NO_DJ_PADS);
    expect(readDjPads(JSON.stringify(['a', 3, null]))).toEqual(['a', '', '', '', '', '', '', '']);
    expect(readDjPads(JSON.stringify(Array.from({ length: 10 }, (_, i) => `s${i}`)))).toHaveLength(8);
  });

  it('empties a pad given an empty identifier', () => {
    expect(withPad(withPad(NO_DJ_PADS, 3, 'drum'), 3, '')).toEqual(NO_DJ_PADS);
  });
});
