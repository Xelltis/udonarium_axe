import {
  asFunctionRole,
  DEFAULT_FUNCTION_ROLE,
  DEFAULT_FUNCTION_SPEC,
  MAP_FUNCTION_ROLES,
  sanitizeFunctionSpec,
  TERRAIN_FACE_KEYS,
} from '@axe/domain/tabletop/function-paint';

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
    const spec = sanitizeFunctionSpec({
      terrain: { height: 3, blocksSight: false },
      mask: { color: '#112233' },
    });

    expect(spec.terrain.height).toBe(3);
    expect(spec.terrain.blocksSight).toBe(false);
    expect(spec.mask.color).toBe('#112233');
  });

  it('holds a wall to a height a table can draw', () => {
    expect(sanitizeFunctionSpec({ terrain: { height: -4 } }).terrain.height).toBe(0);
    expect(sanitizeFunctionSpec({ terrain: { height: 1000 } }).terrain.height).toBe(99);
    expect(sanitizeFunctionSpec({ terrain: { height: 'tall' } }).terrain.height).toBe(
      DEFAULT_FUNCTION_SPEC.terrain.height
    );
  });

  it('keeps a mask between see-through and solid', () => {
    expect(sanitizeFunctionSpec({ mask: { opacity: 2 } }).mask.opacity).toBe(1);
    expect(sanitizeFunctionSpec({ mask: { opacity: -1 } }).mask.opacity).toBe(0);
  });

  it('keeps the picture on every face it is told about', () => {
    const spec = sanitizeFunctionSpec({ terrain: { images: { wall: 'stone', north: 'mural', nonsense: 'x' } } });

    expect(spec.terrain.images.wall).toBe('stone');
    expect(spec.terrain.images.north).toBe('mural');
    expect(spec.terrain.images.south).toBe('');
    expect(Object.keys(spec.terrain.images).sort()).toEqual(TERRAIN_FACE_KEYS.slice().sort());
  });

  it('reads a spec written before it had a shape as the defaults', () => {
    expect(sanitizeFunctionSpec({ terrainHeight: 3, maskColor: '#112233' })).toEqual(DEFAULT_FUNCTION_SPEC);
  });
});
