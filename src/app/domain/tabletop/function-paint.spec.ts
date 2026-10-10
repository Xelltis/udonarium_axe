import {
  asFunctionRole,
  DEFAULT_FUNCTION_ROLE,
  DEFAULT_FUNCTION_SPEC,
  MAP_FUNCTION_ROLES,
  sanitizeFunctionLayerLook,
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

describe('sanitizeFunctionLayerLook()', () => {
  it('reads a layer saved under the old name for shut ground as ground nothing gets through', () => {
    const look = sanitizeFunctionLayerLook('moveBlock', {});

    expect(look.role).toBe('moveCost');
    expect(look.spec.moveCost.blocks).toBe(true);
  });

  it('leaves a layer that only puts a price on the ground open', () => {
    const look = sanitizeFunctionLayerLook('moveCost', { moveCost: { extraCost: 2 } });

    expect(look.spec.moveCost.blocks).toBe(false);
    expect(look.spec.moveCost.extraCost).toBe(2);
  });

  it('reads a role it does not know as the one a new layer starts on', () => {
    expect(sanitizeFunctionLayerLook('damage', {}).role).toBe(DEFAULT_FUNCTION_ROLE);
  });

  it('keeps the other roles as they were saved', () => {
    expect(sanitizeFunctionLayerLook('terrain', { terrain: { height: 3 } }).role).toBe('terrain');
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

  it('keeps whether a stretch of ground lets anything through', () => {
    expect(sanitizeFunctionSpec({ moveCost: { blocks: true } }).moveCost.blocks).toBe(true);
    expect(sanitizeFunctionSpec({}).moveCost.blocks).toBe(false);
  });

  it('keeps what a stretch of dear ground was painted with', () => {
    const spec = sanitizeFunctionSpec({ moveCost: { extraCost: 3, color: '#445566' } });

    expect(spec.moveCost.extraCost).toBe(3);
    expect(spec.moveCost.color).toBe('#445566');
  });

  it('holds what dear ground charges to a whole step worth charging', () => {
    expect(sanitizeFunctionSpec({ moveCost: { extraCost: 0 } }).moveCost.extraCost).toBe(1);
    expect(sanitizeFunctionSpec({ moveCost: { extraCost: -2 } }).moveCost.extraCost).toBe(1);
    expect(sanitizeFunctionSpec({ moveCost: { extraCost: 40 } }).moveCost.extraCost).toBe(9);
    expect(sanitizeFunctionSpec({ moveCost: { extraCost: 'deep' } }).moveCost.extraCost).toBe(1);
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
