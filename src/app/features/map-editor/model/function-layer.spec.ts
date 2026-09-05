import {
  asFunctionRole,
  DEFAULT_FUNCTION_ROLE,
  DEFAULT_FUNCTION_SPEC,
  FUNCTION_ROLE_INK,
  MAP_FUNCTION_ROLES,
  sanitizeFunctionSpec,
} from '@axe/features/map-editor/model/function-layer';

describe('asFunctionRole()', () => {
  it('reads the roles it knows', () => {
    for (const role of MAP_FUNCTION_ROLES) expect(asFunctionRole(role)).toBe(role);
  });

  it('reads anything else as the one a new layer starts on', () => {
    expect(asFunctionRole('damage')).toBe(DEFAULT_FUNCTION_ROLE);
    expect(asFunctionRole(undefined)).toBe(DEFAULT_FUNCTION_ROLE);
  });
});

describe('sanitizeFunctionSpec()', () => {
  it('hands back the defaults for a layer that carries nothing', () => {
    expect(sanitizeFunctionSpec(undefined)).toEqual(DEFAULT_FUNCTION_SPEC);
    expect(sanitizeFunctionSpec({})).toEqual(DEFAULT_FUNCTION_SPEC);
  });

  it('keeps what it is given', () => {
    const spec = sanitizeFunctionSpec({ terrainHeight: 3, terrainBlocksSight: false, maskColor: '#112233' });

    expect(spec.terrainHeight).toBe(3);
    expect(spec.terrainBlocksSight).toBe(false);
    expect(spec.maskColor).toBe('#112233');
  });

  it('holds a wall to a height a table can draw', () => {
    expect(sanitizeFunctionSpec({ terrainHeight: -4 }).terrainHeight).toBe(0);
    expect(sanitizeFunctionSpec({ terrainHeight: 1000 }).terrainHeight).toBe(99);
    expect(sanitizeFunctionSpec({ terrainHeight: 'tall' }).terrainHeight).toBe(DEFAULT_FUNCTION_SPEC.terrainHeight);
  });

  it('keeps a mask between see-through and solid', () => {
    expect(sanitizeFunctionSpec({ maskOpacity: 2 }).maskOpacity).toBe(1);
    expect(sanitizeFunctionSpec({ maskOpacity: -1 }).maskOpacity).toBe(0);
  });
});

describe('FUNCTION_ROLE_INK', () => {
  it('shows every role in a colour of its own', () => {
    const inks = MAP_FUNCTION_ROLES.map((role) => FUNCTION_ROLE_INK[role]);

    expect(inks.every((ink) => typeof ink === 'string' && ink.length > 0)).toBe(true);
    expect(new Set(inks).size).toBe(MAP_FUNCTION_ROLES.length);
  });
});
