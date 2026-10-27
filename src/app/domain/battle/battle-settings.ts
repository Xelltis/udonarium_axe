/**
 * What the room says about its battle stage, held in one attribute of its settings.
 *
 * Only what differs from the defaults is written, so a room that never touched the stage holds
 * nothing, and a room written before the stage existed reads exactly as one that never touched it.
 */
export interface BattleSettings {
  /** The picture behind the stage, by image identifier. Empty is the stage's own. */
  background: string;
  /** Whether a fighter brought down goes down on the stage. */
  defeat: boolean;
  /** The resource whose fall to nothing brings a fighter down. */
  defeatResource: string;
  /** The effect a fighter brought down goes with, by name. Empty is the built-in crumbling. */
  defeatEffect: string;
}

export const DEFAULT_BATTLE_SETTINGS: Readonly<BattleSettings> = {
  background: '',
  defeat: true,
  defeatResource: 'HP',
  defeatEffect: '',
};

/** The built-in effect a fighter brought down goes with where the room names none. */
export const DEFAULT_DEFEAT_EFFECT_IDENTIFIER = 'EffectPreset_defeat_dissolve';

/**
 * Reads what the room holds. Anything missing, unreadable or of the wrong kind is the default; a
 * resource name of nothing but spaces is the default too, as a stage that brought nobody down by
 * a nameless resource would only look broken.
 */
export function readBattleSettings(raw: string): BattleSettings {
  const held = parse(raw);
  const resource = typeof held['defeatResource'] === 'string' ? held['defeatResource'].trim() : '';
  return {
    background: typeof held['background'] === 'string' ? held['background'] : DEFAULT_BATTLE_SETTINGS.background,
    defeat: typeof held['defeat'] === 'boolean' ? held['defeat'] : DEFAULT_BATTLE_SETTINGS.defeat,
    defeatResource: resource.length > 0 ? resource : DEFAULT_BATTLE_SETTINGS.defeatResource,
    defeatEffect:
      typeof held['defeatEffect'] === 'string' ? held['defeatEffect'].trim() : DEFAULT_BATTLE_SETTINGS.defeatEffect,
  };
}

/** Writes the settings the way the room holds them: only what differs from the defaults, or nothing at all. */
export function writeBattleSettings(settings: BattleSettings): string {
  const written: Partial<BattleSettings> = {};
  const read = readBattleSettings(JSON.stringify(settings));
  for (const key of Object.keys(DEFAULT_BATTLE_SETTINGS) as (keyof BattleSettings)[]) {
    if (read[key] !== DEFAULT_BATTLE_SETTINGS[key]) Object.assign(written, { [key]: read[key] });
  }
  return Object.keys(written).length > 0 ? JSON.stringify(written) : '';
}

function parse(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
