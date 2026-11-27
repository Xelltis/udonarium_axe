import { MODEL_AS_MADE } from '@axe/domain/tabletop/model-look';
import { faceOf, lookKeyOf, lookOf, motionsOf } from '@axe/domain/tabletop/piece-model-setup';

describe('what draws a piece’s model reads of how it is set up', () => {
  it('reads each as it was stored, the same reading for the same text', () => {
    const model = { look: '{"finish":"toon"}', motions: '{"made":false}', face: '{"blink":"-"}' };

    expect(lookOf(model)).toMatchObject({ finish: 'toon' });
    expect(lookOf(model)).toBe(lookOf({ ...model }));
    expect(motionsOf(model).made).toBe(false);
    expect(faceOf(model).blink).toBe('-');
  });

  it('writes looks alike alike, and a look as made as nothing', () => {
    expect(lookKeyOf({ look: '{"tint":"#ABCDEF","finish":"toon"}' })).toBe(
      lookKeyOf({ look: '{"finish":"toon","tint":"#abcdef"}' })
    );
    expect(lookKeyOf({ look: '' })).toBe('');
    expect(lookKeyOf({ look: 'not json' })).toBe('');
    expect(lookOf({ look: '' })).toEqual(MODEL_AS_MADE);
  });

  it('reads afresh a text read long ago, once many others have been read since', () => {
    const first = lookOf({ look: '{"finish":"matte"}' });
    for (let index = 0; index < 300; index++) lookOf({ look: `{"opacity":${index / 1000}}` });

    expect(lookOf({ look: '{"finish":"matte"}' })).toEqual(first);
  });
});
