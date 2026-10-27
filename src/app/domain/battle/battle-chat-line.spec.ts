import { lineChangesResources, lineIsSecret } from '@axe/domain/battle/battle-chat-line';

describe('lineChangesResources()', () => {
  it('finds the resource commands in either width and secret', () => {
    expect(lineChangesResources('2d6 t:HP-10 《vs》')).toBe(true);
    expect(lineChangesResources(':MP-2 《vs》')).toBe(true);
    expect(lineChangesResources('st:HP-3 《vs》')).toBe(true);
    expect(lineChangesResources('ｔ：HP-3 《vs》')).toBe(true);
  });

  it('finds none in a line without one', () => {
    expect(lineChangesResources('斬りかかる《vs》')).toBe(false);
    expect(lineChangesResources('時刻は 12:30')).toBe(false);
  });
});

describe('lineIsSecret()', () => {
  it('finds a resource command kept secret', () => {
    expect(lineIsSecret('st:HP-3 《vs》')).toBe(true);
    expect(lineIsSecret('2d6 s:MP-1')).toBe(true);
    expect(lineIsSecret('ｓｔ：HP-3')).toBe(true);
  });

  it('finds none in an open line', () => {
    expect(lineIsSecret('t:HP-3 《vs》')).toBe(false);
    expect(lineIsSecret('statues:3')).toBe(false);
  });
});
