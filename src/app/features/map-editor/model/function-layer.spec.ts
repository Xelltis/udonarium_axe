import { MAP_FUNCTION_ROLES } from '@axe/domain/tabletop/function-paint';
import { FUNCTION_ROLE_INK, functionRoleLabelKey } from '@axe/features/map-editor/model/function-layer';

describe('FUNCTION_ROLE_INK', () => {
  it('shows every role in a colour of its own', () => {
    const inks = MAP_FUNCTION_ROLES.map((role) => FUNCTION_ROLE_INK[role]);

    expect(inks.every((ink) => typeof ink === 'string' && ink.length > 0)).toBe(true);
    expect(new Set(inks).size).toBe(MAP_FUNCTION_ROLES.length);
  });
});

describe('functionRoleLabelKey()', () => {
  it('names a key for every role', () => {
    const keys = MAP_FUNCTION_ROLES.map(functionRoleLabelKey);

    expect(new Set(keys).size).toBe(MAP_FUNCTION_ROLES.length);
    expect(keys.every((key) => key.startsWith('feature.mapEditor.function.role_'))).toBe(true);
  });
});
