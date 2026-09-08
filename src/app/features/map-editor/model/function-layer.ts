import { MAP_FUNCTION_ROLES, MapFunctionRole } from '@axe/domain/tabletop/function-paint';

export type {
  BlockChange,
  FunctionPaintPlan,
  FunctionSpec,
  MapFunctionRole,
} from '@axe/domain/tabletop/function-paint';
export {
  asFunctionRole,
  DEFAULT_FUNCTION_ROLE,
  DEFAULT_FUNCTION_SPEC,
  lookKey,
  MAP_FUNCTION_ROLES,
  sanitizeFunctionSpec,
} from '@axe/domain/tabletop/function-paint';

/** How each role is shown while it is being worked on, which is never how it is exported. */
export const FUNCTION_ROLE_INK: Record<MapFunctionRole, string> = {
  moveBlock: 'rgba(220, 60, 60, 0.38)',
  terrain: 'rgba(120, 100, 80, 0.45)',
  mask: 'rgba(70, 70, 90, 0.45)',
  trigger: 'rgba(200, 80, 40, 0.42)',
};

export function functionRoleLabelKey(role: MapFunctionRole): string {
  return `feature.mapEditor.function.role_${role}`;
}

export function everyFunctionRole(): readonly MapFunctionRole[] {
  return MAP_FUNCTION_ROLES;
}
