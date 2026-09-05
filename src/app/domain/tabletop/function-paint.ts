/**
 * What a painted cell does, and what it lays on the table.
 *
 * The map editor paints these, but what they mean belongs to the table rather than to the
 * editor: a cell closed to walking is closed however it came to be.
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

export interface CellChange {
  add: string[];
  remove: string[];
}

/** What has to change on the table for it to match what was painted. */
export interface FunctionPaintPlan {
  /** Every cell the table should be closed on, which replaces whatever it held before. */
  blocked: string[];
  terrain: CellChange;
  mask: CellChange;
  /** The settings each role's own layer carries, which the newly laid objects take. */
  terrainSpec: FunctionSpec;
  maskSpec: FunctionSpec;
}
