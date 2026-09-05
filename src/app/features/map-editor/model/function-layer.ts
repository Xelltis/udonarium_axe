/**
 * What a painted cell does, as against how it looks.
 *
 * A cell layer is paint: it goes into the picture and is baked into the floor. A function
 * layer is not painted onto the map but onto the table underneath it - the cell is closed to
 * walking, or holds a wall, or is covered over - and so it never reaches the exported image.
 */

export const MAP_FUNCTION_ROLES = ['moveBlock', 'terrain', 'mask'] as const;

export type MapFunctionRole = (typeof MAP_FUNCTION_ROLES)[number];

export const DEFAULT_FUNCTION_ROLE: MapFunctionRole = 'moveBlock';

export function asFunctionRole(value: unknown): MapFunctionRole {
  return typeof value === 'string' && (MAP_FUNCTION_ROLES as readonly string[]).includes(value)
    ? (value as MapFunctionRole)
    : DEFAULT_FUNCTION_ROLE;
}

/** What a role lays on the table, the same for every cell the layer holds. */
export interface FunctionSpec {
  /** How tall a wall stands, in cells. */
  terrainHeight: number;
  terrainBlocksSight: boolean;
  terrainBlocksLight: boolean;
  maskColor: string;
  maskOpacity: number;
}

export const DEFAULT_FUNCTION_SPEC: FunctionSpec = {
  terrainHeight: 1,
  terrainBlocksSight: true,
  terrainBlocksLight: true,
  maskColor: '#555555',
  maskOpacity: 0.6,
};

export function sanitizeFunctionSpec(value: unknown): FunctionSpec {
  const held = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const count = (key: string, fallback: number, least: number, most: number): number => {
    const amount = Number(held[key]);
    if (!Number.isFinite(amount)) return fallback;
    return Math.min(most, Math.max(least, amount));
  };
  const flag = (key: string, fallback: boolean): boolean =>
    typeof held[key] === 'boolean' ? (held[key] as boolean) : fallback;

  return {
    terrainHeight: count('terrainHeight', DEFAULT_FUNCTION_SPEC.terrainHeight, 0, 99),
    terrainBlocksSight: flag('terrainBlocksSight', DEFAULT_FUNCTION_SPEC.terrainBlocksSight),
    terrainBlocksLight: flag('terrainBlocksLight', DEFAULT_FUNCTION_SPEC.terrainBlocksLight),
    maskColor: typeof held['maskColor'] === 'string' ? (held['maskColor'] as string) : DEFAULT_FUNCTION_SPEC.maskColor,
    maskOpacity: count('maskOpacity', DEFAULT_FUNCTION_SPEC.maskOpacity, 0, 1),
  };
}

/** How each role is shown while it is being worked on, which is never how it is exported. */
export const FUNCTION_ROLE_INK: Record<MapFunctionRole, string> = {
  moveBlock: 'rgba(220, 60, 60, 0.38)',
  terrain: 'rgba(120, 100, 80, 0.45)',
  mask: 'rgba(70, 70, 90, 0.45)',
};

export function functionRoleLabelKey(role: MapFunctionRole): string {
  return `feature.mapEditor.function.role_${role}`;
}
