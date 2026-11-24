import {
  AS_MADE,
  isAsMade,
  materialLookIn,
  MAX_MODEL_GLOW,
  MAX_MODEL_LOOK_MATERIALS,
  mayChangeMaterial,
  MODEL_AS_MADE,
  modelLookKeyOf,
  modelLookOf,
  withMaterialLook,
  writeModelLook,
} from '@axe/domain/tabletop/model-look';
import { MODEL_LOOK_PRESET_NAMES, presetModelLook } from '@axe/domain/tabletop/model-look-presets';

describe('how a model is drawn', () => {
  it('is as the model was made where nothing was stored, or what was cannot be read', () => {
    for (const value of ['', undefined, null, 0, 'toon', '[]', '{"tint":', '"#ff0000"']) {
      expect(modelLookOf(value)).toEqual(MODEL_AS_MADE);
    }
  });

  it('is stored as nothing while it is as the model was made', () => {
    expect(writeModelLook(MODEL_AS_MADE)).toBe('');
    expect(writeModelLook(presetModelLook('made'))).toBe('');
    expect(writeModelLook(modelLookOf('{"finish":"","materials":{"Cloak":{}}}'))).toBe('');
  });

  it('comes back as it was stored', () => {
    const look = withMaterialLook(
      { ...MODEL_AS_MADE, finish: 'toon', tint: '#336699', metalness: 0.2, opacity: 0.5 },
      'Cloak',
      { ...AS_MADE, glow: '#ff8800', glowStrength: 2, hidden: true }
    );

    expect(modelLookOf(writeModelLook(look))).toEqual(look);
  });

  it('keeps a number within what it may be, and drops a colour or a finish that is none', () => {
    const look = modelLookOf(
      JSON.stringify({
        finish: 'chrome',
        tint: 'red',
        glow: '#FFAA00',
        metalness: 7,
        roughness: -1,
        glowStrength: 100,
        opacity: '0.5',
        plain: 'yes',
      })
    );

    expect(look).toMatchObject({
      finish: '',
      tint: '',
      glow: '#ffaa00',
      metalness: 1,
      roughness: 0,
      glowStrength: MAX_MODEL_GLOW,
      opacity: null,
      plain: false,
    });
  });

  it('never leaves the whole model undrawn, though one of its materials may be', () => {
    const look = modelLookOf('{"hidden":true,"materials":{"Hood":{"hidden":true}}}');

    expect(look.hidden).toBe(false);
    expect(look.materials['Hood'].hidden).toBe(true);
  });

  it('is kept by the same text however its fields and its materials were ordered', () => {
    const one = '{"tint":"#102030","finish":"toon","materials":{"B":{"plain":true},"A":{"opacity":0.5}}}';
    const other = '{"materials":{"A":{"opacity":0.5},"B":{"plain":true}},"finish":"toon","tint":"#102030"}';

    expect(modelLookKeyOf(one)).toBe(modelLookKeyOf(other));
    expect(modelLookKeyOf(one)).not.toBe(modelLookKeyOf('{"tint":"#102031"}'));
    expect(modelLookKeyOf('')).toBe('');
  });

  it('draws a material by what is set for it alone over what is set for the whole model', () => {
    const look = withMaterialLook({ ...MODEL_AS_MADE, tint: '#111111', roughness: 0.9, opacity: 0.5 }, 'Blade', {
      ...AS_MADE,
      tint: '#eeeeee',
      roughness: 0,
    });

    expect(materialLookIn(look, 'Blade')).toMatchObject({ tint: '#eeeeee', roughness: 0, opacity: 0.5 });
    expect(materialLookIn(look, 'Hilt')).toMatchObject({ tint: '#111111', roughness: 0.9, opacity: 0.5 });
  });

  it('takes a material’s own look back once nothing is changed of it', () => {
    const changed = withMaterialLook(MODEL_AS_MADE, 'Blade', { ...AS_MADE, plain: true });

    expect(withMaterialLook(changed, 'Blade', AS_MADE).materials).toEqual({});
    expect(isAsMade(AS_MADE)).toBe(true);
    expect(isAsMade({ ...AS_MADE, metalness: 0 })).toBe(false);
  });

  it('sets apart no more materials than it keeps, so that none set apart is lost once it is stored', () => {
    let look = MODEL_AS_MADE;
    for (let index = 0; index < MAX_MODEL_LOOK_MATERIALS; index++) {
      look = withMaterialLook(look, `M${String(index).padStart(2, '0')}`, { ...AS_MADE, plain: true });
    }

    expect(mayChangeMaterial(look, 'A-first')).toBe(false);
    expect(mayChangeMaterial(look, 'M00')).toBe(true);
    expect(withMaterialLook(look, 'A-first', { ...AS_MADE, plain: true })).toBe(look);
    expect(withMaterialLook(look, 'M00', { ...AS_MADE, hidden: true }).materials['M00']).toMatchObject({
      hidden: true,
    });
    expect(Object.keys(modelLookOf(writeModelLook(look)).materials)).toHaveLength(MAX_MODEL_LOOK_MATERIALS);

    const freed = withMaterialLook(look, 'M00', AS_MADE);
    expect(mayChangeMaterial(freed, 'A-first')).toBe(true);
  });

  it('keeps a material by its name whatever it is named, `constructor` and `__proto__` too', () => {
    expect(mayChangeMaterial(MODEL_AS_MADE, 'constructor')).toBe(true);
    expect(materialLookIn(MODEL_AS_MADE, 'constructor')).toBe(MODEL_AS_MADE);

    const look = withMaterialLook(
      withMaterialLook(MODEL_AS_MADE, '__proto__', { ...AS_MADE, hidden: true }),
      'constructor',
      { ...AS_MADE, plain: true }
    );
    const read = modelLookOf(writeModelLook(look));

    expect(Object.keys(read.materials).sort()).toEqual(['__proto__', 'constructor']);
    expect(materialLookIn(read, '__proto__').hidden).toBe(true);
    expect(materialLookIn(read, 'constructor').plain).toBe(true);
    expect(Object.getPrototypeOf(read.materials)).toBeNull();
  });

  it('offers ready-made looks that each come back as stored', () => {
    for (const preset of MODEL_LOOK_PRESET_NAMES) {
      const look = presetModelLook(preset);
      expect(modelLookOf(writeModelLook(look))).toEqual(look);
    }
    expect(presetModelLook('stone')).toMatchObject({ plain: true, tint: '#a3a39b' });
  });
});
