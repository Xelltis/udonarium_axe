import {
  AS_MADE,
  isAsMade,
  materialKeyOf,
  materialLookIn,
  MAX_MODEL_GLOW,
  MODEL_AS_MADE,
  MODEL_LOOK_PRESET_NAMES,
  modelLookKeyOf,
  modelLookOf,
  presetModelLook,
  withMaterialLook,
  writeModelLook,
} from '@axe/domain/tabletop/model-look';

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

  it('tells a material by its name, or by where it stands among the model’s where it has none', () => {
    expect(materialKeyOf('Blade', 2)).toBe('Blade');
    expect(materialKeyOf(' ', 2)).toBe('#2');
    expect(materialKeyOf(undefined, 0)).toBe('#0');
    expect(materialKeyOf('#1', 4)).toBe('#4');
  });

  it('offers ready-made looks that each come back as stored', () => {
    for (const preset of MODEL_LOOK_PRESET_NAMES) {
      const look = presetModelLook(preset);
      expect(modelLookOf(writeModelLook(look))).toEqual(look);
    }
    expect(presetModelLook('stone')).toMatchObject({ plain: true, tint: '#a3a39b' });
  });
});
