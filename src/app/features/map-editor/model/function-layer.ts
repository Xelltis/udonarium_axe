import { FunctionSpec, MAP_FUNCTION_ROLES, MapFunctionRole } from '@axe/domain/tabletop/function-paint';

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
  sanitizeFunctionLayerLook,
  sanitizeFunctionSpec,
} from '@axe/domain/tabletop/function-paint';

/** How each role is shown while it is being worked on, which is never how it is exported. */
export const FUNCTION_ROLE_INK: Record<MapFunctionRole, string> = {
  moveCost: 'rgba(110, 155, 90, 0.42)',
  hazard: 'rgba(150, 90, 150, 0.42)',
  terrain: 'rgba(120, 100, 80, 0.45)',
  mask: 'rgba(70, 70, 90, 0.45)',
  trigger: 'rgba(200, 80, 40, 0.42)',
};

/** What ground nobody may enter is inked in, which is the one value a role's own ink cannot say. */
export const BLOCKED_INK = 'rgba(220, 60, 60, 0.38)';

/**
 * The ink a layer is drawn in while it is being worked on.
 *
 * One brush paints everything movement has to reckon with, so what a layer costs decides its
 * colour rather than its role alone: shut ground reads red, and ground with a price on it reads
 * in the colour of the role.
 */
export function functionInkOf(role: MapFunctionRole, spec: FunctionSpec): string {
  if (role === 'moveCost' && spec.moveCost.blocks) return BLOCKED_INK;
  return FUNCTION_ROLE_INK[role];
}

/** The i18n key naming a function role in the layer drawer. */
export function functionRoleLabelKey(role: MapFunctionRole): string {
  return `feature.mapEditor.function.role_${role}`;
}

/** Every role a function layer can be painted for, in the order the layer drawer offers them. */
export function everyFunctionRole(): readonly MapFunctionRole[] {
  return MAP_FUNCTION_ROLES;
}
