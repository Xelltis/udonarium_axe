/** How the round decides whose turn it is. */
export const TURN_ORDER_MODES = ['initiative', 'faction'] as const;

export type TurnOrderMode = (typeof TURN_ORDER_MODES)[number];

export const DEFAULT_TURN_ORDER_MODE: TurnOrderMode = 'initiative';

export function asTurnOrderMode(value: unknown): TurnOrderMode {
  return typeof value === 'string' && (TURN_ORDER_MODES as readonly string[]).includes(value)
    ? (value as TurnOrderMode)
    : DEFAULT_TURN_ORDER_MODE;
}

/** How a side gets through its own phase. */
export const FACTION_PHASE_MODES = ['free', 'initiative'] as const;

export type FactionPhaseMode = (typeof FACTION_PHASE_MODES)[number];

export const DEFAULT_FACTION_PHASE_MODE: FactionPhaseMode = 'free';

export function asFactionPhaseMode(value: unknown): FactionPhaseMode {
  return typeof value === 'string' && (FACTION_PHASE_MODES as readonly string[]).includes(value)
    ? (value as FactionPhaseMode)
    : DEFAULT_FACTION_PHASE_MODE;
}
