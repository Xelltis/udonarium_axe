import { DEFAULT_FUNCTION_SPEC, MAP_FUNCTION_ROLES } from '@axe/domain/tabletop/function-paint';
import {
  BLOCKED_INK,
  FUNCTION_ROLE_INK,
  functionInkOf,
  functionRoleLabelKey,
} from '@axe/features/map-editor/model/function-layer';

describe('FUNCTION_ROLE_INK', () => {
  it('shows every role in a colour of its own', () => {
    const inks = MAP_FUNCTION_ROLES.map((role) => FUNCTION_ROLE_INK[role]);

    expect(inks.every((ink) => typeof ink === 'string' && ink.length > 0)).toBe(true);
    expect(new Set(inks).size).toBe(MAP_FUNCTION_ROLES.length);
  });
});

describe('functionInkOf()', () => {
  const dear = DEFAULT_FUNCTION_SPEC;
  const shut = { ...DEFAULT_FUNCTION_SPEC, moveCost: { ...DEFAULT_FUNCTION_SPEC.moveCost, blocks: true } };

  it('inks ground nobody may enter apart from ground with a price on it', () => {
    expect(functionInkOf('moveCost', shut)).toBe(BLOCKED_INK);
    expect(functionInkOf('moveCost', dear)).toBe(FUNCTION_ROLE_INK.moveCost);
  });

  it('leaves the other roles the ink of their role', () => {
    for (const role of MAP_FUNCTION_ROLES.filter((held) => held !== 'moveCost')) {
      expect(functionInkOf(role, shut)).toBe(FUNCTION_ROLE_INK[role]);
    }
  });
});

describe('functionRoleLabelKey()', () => {
  it('names a key for every role', () => {
    const keys = MAP_FUNCTION_ROLES.map(functionRoleLabelKey);

    expect(new Set(keys).size).toBe(MAP_FUNCTION_ROLES.length);
    expect(keys.every((key) => key.startsWith('feature.mapEditor.function.role_'))).toBe(true);
  });
});
