import { MODEL_FACE_AS_MADE, modelFaceOf, NO_SHAPE, writeModelFace } from '@axe/domain/tabletop/model-face';
import {
  blinkAt,
  faceMoves,
  mouthAt,
  seedOf,
  shapesFor,
  shapeWeightsAt,
  swayAt,
} from '@axe/domain/tabletop/model-face-motion';

describe('what a piece does with its model’s shapes', () => {
  it('keeps the weight of a shape by its name whatever it is named, `constructor` and `__proto__` too', () => {
    const face = modelFaceOf(JSON.stringify({ weights: { constructor: 0.5, ['__proto__']: 0.25 } }));

    expect(Object.keys(face.weights).sort()).toEqual(['__proto__', 'constructor']);
    expect(modelFaceOf(writeModelFace(face)).weights['constructor']).toBe(0.5);
    expect(Object.hasOwn(MODEL_FACE_AS_MADE.weights, 'constructor')).toBe(false);
    expect('constructor' in MODEL_FACE_AS_MADE.weights).toBe(false);
  });

  it('is the model’s own where nothing was stored, or what was cannot be read', () => {
    for (const value of ['', undefined, null, 'Joy', '[]', '{"weights":']) {
      expect(modelFaceOf(value)).toEqual(MODEL_FACE_AS_MADE);
    }
    expect(writeModelFace(MODEL_FACE_AS_MADE)).toBe('');
  });

  it('comes back as it was stored', () => {
    const face = {
      blink: NO_SHAPE,
      mouth: 'Fcl_MTH_A',
      breath: '',
      weights: { Joy: 0.6, Angry: 0.25 },
      sways: [{ name: 'Chest', periodMs: 4000, amount: 0.8 }],
    };

    expect(modelFaceOf(writeModelFace(face))).toEqual(face);
  });

  it('keeps weights and sways within what they may be, and drops what names no shape', () => {
    const face = modelFaceOf(
      JSON.stringify({
        weights: { Joy: 4, Sad: -1, '': 1, Odd: 'much' },
        sways: [
          { name: 'Chest', periodMs: 1, amount: 9 },
          { name: '', periodMs: 1000 },
          { name: 'Tail', periodMs: 'slow' },
          { name: 'Ear', periodMs: 900 },
        ],
      })
    );

    expect(face.weights).toEqual({ Joy: 1 });
    expect(face.sways).toEqual([
      { name: 'Chest', periodMs: 200, amount: 1 },
      { name: 'Ear', periodMs: 900, amount: 1 },
    ]);
  });
});

describe('the shapes a model blinks, speaks and breathes with', () => {
  const vroid = ['Fcl_ALL_Joy', 'Fcl_EYE_Close', 'Fcl_EYE_Close_R', 'Fcl_EYE_Close_L', 'Fcl_MTH_A', 'Fcl_MTH_I'];

  it('are the model’s own, told by their names', () => {
    expect(shapesFor('blink', vroid, '')).toEqual(['Fcl_EYE_Close']);
    expect(shapesFor('mouth', vroid, '')).toEqual(['Fcl_MTH_A']);
    expect(shapesFor('breath', vroid, '')).toEqual([]);
    expect(shapesFor('blink', ['blink', 'aa', 'Breath'], '')).toEqual(['blink']);
    expect(shapesFor('mouth', ['blink', 'aa', 'Breath'], '')).toEqual(['aa']);
    expect(shapesFor('breath', ['blink', 'aa', 'Breath'], '')).toEqual(['Breath']);
  });

  it('shut both eyes together where each has a shape of its own and there is none for both', () => {
    expect(shapesFor('blink', ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen'], '')).toEqual([
      'eyeBlinkLeft',
      'eyeBlinkRight',
    ]);
    expect(shapesFor('mouth', ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen'], '')).toEqual(['jawOpen']);
  });

  it('are the one asked for by name, and none where that is turned off', () => {
    expect(shapesFor('blink', vroid, 'Fcl_ALL_Joy')).toEqual(['Fcl_ALL_Joy']);
    expect(shapesFor('blink', vroid, NO_SHAPE)).toEqual([]);
    expect(shapesFor('blink', vroid, 'Missing')).toEqual(['Fcl_EYE_Close']);
  });

  it('do not take a shape that only ends in a letter of a side for one side’s', () => {
    expect(shapesFor('blink', ['Blink_Normal', 'Blink_L'], '')).toEqual(['Blink_Normal']);
  });
});

describe('how a face moves', () => {
  it('blinks now and then, the same at the same moment, and not as another seed does', () => {
    const moments = Array.from({ length: 3000 }, (_, index) => index * 10);
    const shut = moments.filter((ms) => blinkAt(ms, 7) > 0);

    expect(shut.length).toBeGreaterThan(20);
    expect(shut.length).toBeLessThan(400);
    expect(moments.every((ms) => blinkAt(ms, 7) === blinkAt(ms, 7))).toBe(true);
    expect(moments.some((ms) => blinkAt(ms, 7) > 0 !== blinkAt(ms, 8) > 0)).toBe(true);
    expect(Math.max(...moments.map((ms) => blinkAt(ms, 7)))).toBeLessThanOrEqual(1);
  });

  it('sways a shape from nothing to its amount and back once a period', () => {
    const sway = { periodMs: 2000, amount: 0.8 };

    expect(swayAt(0, sway)).toBeCloseTo(0);
    expect(swayAt(1000, sway)).toBeCloseTo(0.8);
    expect(swayAt(2000, sway)).toBeCloseTo(0);
  });

  it('opens a mouth no further than all the way', () => {
    for (let ms = 0; ms < 3000; ms += 37) {
      expect(mouthAt(ms, 3)).toBeGreaterThanOrEqual(0);
      expect(mouthAt(ms, 3)).toBeLessThanOrEqual(1);
    }
  });

  it('holds an expression, and moves the mouth only while the piece speaks', () => {
    const names = ['Joy', 'aa', 'blink'];
    const face = { ...MODEL_FACE_AS_MADE, blink: NO_SHAPE, weights: { Joy: 0.5, Gone: 1 } };
    const speaking = Array.from({ length: 50 }, (_, index) =>
      shapeWeightsAt(face, names, { timeMs: index * 31, seed: 1, speaking: true })
    );

    expect(shapeWeightsAt(face, names, { timeMs: 100, seed: 1 })).toEqual(new Map([['Joy', 0.5]]));
    expect(speaking.some((weights) => (weights.get('aa') ?? 0) > 0.3)).toBe(true);
    expect(speaking.every((weights) => weights.get('Joy') === 0.5 && !weights.has('Gone'))).toBe(true);
  });

  it('holds the expression alone for a reader who asks for less motion', () => {
    const face = { ...MODEL_FACE_AS_MADE, weights: { Joy: 1 }, sways: [{ name: 'Chest', periodMs: 1000, amount: 1 }] };

    expect(
      shapeWeightsAt(face, ['Joy', 'Chest', 'blink'], { timeMs: 500, seed: 1, speaking: true, still: true })
    ).toEqual(new Map([['Joy', 1]]));
  });

  it('takes the most of what moves one shape', () => {
    const face = {
      ...MODEL_FACE_AS_MADE,
      blink: NO_SHAPE,
      weights: { Chest: 0.4 },
      sways: [{ name: 'Chest', periodMs: 1000, amount: 1 }],
    };

    const weights = Array.from(
      { length: 100 },
      (_, index) => shapeWeightsAt(face, ['Chest'], { timeMs: index * 10, seed: 0 }).get('Chest') ?? 0
    );

    expect(Math.min(...weights)).toBeCloseTo(0.4);
    expect(Math.max(...weights)).toBeCloseTo(1, 1);
  });

  it('moves as it stands only where it blinks, breathes or sways', () => {
    expect(faceMoves(MODEL_FACE_AS_MADE, [])).toBe(false);
    expect(faceMoves(MODEL_FACE_AS_MADE, ['Joy'])).toBe(false);
    expect(faceMoves(MODEL_FACE_AS_MADE, ['blink'])).toBe(true);
    expect(faceMoves({ ...MODEL_FACE_AS_MADE, blink: NO_SHAPE }, ['blink'])).toBe(false);
    expect(faceMoves({ ...MODEL_FACE_AS_MADE, weights: { Joy: 1 } }, ['Joy'])).toBe(false);
    expect(faceMoves({ ...MODEL_FACE_AS_MADE, sways: [{ name: 'Joy', periodMs: 900, amount: 1 }] }, ['Joy'])).toBe(
      true
    );
  });

  it('tells a seed by a text, the same for the same text', () => {
    expect(seedOf('piece-1')).toBe(seedOf('piece-1'));
    expect(seedOf('piece-1')).not.toBe(seedOf('piece-2'));
  });
});
