import { CUT_IN_MODEL_ACTS, CUT_IN_MODEL_STANDS, cutInModelDoing } from '@axe/domain/media/cut-in-model';

describe('what the model a cut-in shows does', () => {
  it('only stands where the cut-in keeps nothing for it', () => {
    expect(cutInModelDoing('', 'cut-1', 500)).toBe(CUT_IN_MODEL_STANDS);
    expect(cutInModelDoing('  ', 'cut-1', 500)).toBe(CUT_IN_MODEL_STANDS);
  });

  it('walks for as long as the cut-in is shown', () => {
    expect(cutInModelDoing('walk', 'cut-1', 500)).toEqual({ act: null, walking: true });
  });

  it('acts a role in a fight once, from the moment the cut-in is shown', () => {
    for (const role of ['attack', 'cast', 'hit', 'defeat'] as const) {
      expect(cutInModelDoing(role, 'cut-1', 500)).toEqual({
        act: { key: 'cut-in:cut-1:500', role, atMs: 500 },
        walking: false,
      });
    }
  });

  it('plays the model’s own motion of any other name', () => {
    expect(cutInModelDoing(' Victory ', 'cut-1', 500).act).toEqual({
      key: 'cut-in:cut-1:500',
      role: 'named',
      name: 'Victory',
      atMs: 500,
    });
  });

  it('tells one showing of a cut-in from another, so the act plays each time', () => {
    expect(cutInModelDoing('attack', 'cut-1', 500).act?.key).not.toBe(cutInModelDoing('attack', 'cut-1', 900).act?.key);
  });

  it('offers standing first, then walking and the roles', () => {
    expect(CUT_IN_MODEL_ACTS).toEqual(['', 'walk', 'attack', 'cast', 'hit', 'defeat']);
  });
});
