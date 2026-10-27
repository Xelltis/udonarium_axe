/** What a stage of the tool's own shows: a castle, a city, a haunted place, a neon city or a robot base. */
export const BATTLE_GENRES = ['fantasy', 'modern', 'horror', 'cyberpunk', 'mecha'] as const;

export type BattleGenre = (typeof BATTLE_GENRES)[number];

/** When a stage is set: each genre comes at night and by day. */
export const BATTLE_TIMES = ['night', 'day'] as const;

export type BattleTime = (typeof BATTLE_TIMES)[number];

/**
 * A stage the tool draws for itself. A genre alone is its night, the name it had before the day
 * came, so a stage chosen then still reads as the same one.
 */
export type BattleTheme = BattleGenre | `${BattleGenre}-day`;

/** The stage of a genre at a time. */
export function battleThemeOf(genre: BattleGenre, time: BattleTime): BattleTheme {
  return time === 'night' ? genre : `${genre}-day`;
}

/** Every stage the tool draws, the nights first. */
export const BATTLE_THEMES: readonly BattleTheme[] = BATTLE_TIMES.flatMap((time) =>
  BATTLE_GENRES.map((genre) => battleThemeOf(genre, time))
);

/** The stage a room that never chose one plays on: the castle by day. */
export const DEFAULT_BATTLE_THEME: BattleTheme = 'fantasy-day';

/** Reads a stage as it is held or sent; anything else is the default. */
export function asBattleTheme(value: unknown): BattleTheme {
  return typeof value === 'string' && (BATTLE_THEMES as readonly string[]).includes(value)
    ? (value as BattleTheme)
    : DEFAULT_BATTLE_THEME;
}

/** How many pictures of its own a room keeps to fight on. */
export const BATTLE_PICTURE_LIMIT = 24;

/**
 * What the room says about its battle stage, held in one attribute of its settings.
 *
 * Only what differs from the defaults is written, so a room that never touched the stage holds
 * nothing, and a room written before the stage existed reads exactly as one that never touched it.
 */
export interface BattleSettings {
  /** Which of the tool's own stages is drawn. A picture of the room's own takes its place. */
  theme: BattleTheme;
  /** The picture of the room's own the stage is drawn on, by image identifier. Empty draws the theme. */
  background: string;
  /**
   * The pictures the room keeps to fight on, by image identifier, in the order they were added.
   * The picture drawn is always among them.
   */
  pictures: string[];
  /** Whether a fighter brought down goes down on the stage. */
  defeat: boolean;
  /** The resource whose fall to nothing brings a fighter down. */
  defeatResource: string;
  /** The effect a fighter brought down goes with, by name. Empty is the built-in crumbling. */
  defeatEffect: string;
}

export const DEFAULT_BATTLE_SETTINGS: Readonly<BattleSettings> = {
  theme: DEFAULT_BATTLE_THEME,
  background: '',
  pictures: [],
  defeat: true,
  defeatResource: 'HP',
  defeatEffect: '',
};

/** The built-in effect a fighter brought down goes with where the room names none. */
export const DEFAULT_DEFEAT_EFFECT_IDENTIFIER = 'EffectPreset_defeat_dissolve';

/**
 * Reads what the room holds. Anything missing, unreadable or of the wrong kind is the default; a
 * resource name of nothing but spaces is the default too, as a stage that brought nobody down by
 * a nameless resource would only look broken. The picture drawn is always among those kept; past
 * the limit the last added go, never the one drawn.
 */
export function readBattleSettings(raw: string): BattleSettings {
  const held = parse(raw);
  const resource = typeof held['defeatResource'] === 'string' ? held['defeatResource'].trim() : '';
  const background = typeof held['background'] === 'string' ? held['background'] : DEFAULT_BATTLE_SETTINGS.background;
  return {
    theme: asBattleTheme(held['theme']),
    background,
    pictures: readPictures(held['pictures'], background),
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
    if (key === 'pictures') continue;
    if (read[key] !== DEFAULT_BATTLE_SETTINGS[key]) Object.assign(written, { [key]: read[key] });
  }
  if (read.pictures.length > 0) written.pictures = read.pictures;
  return Object.keys(written).length > 0 ? JSON.stringify(written) : '';
}

function readPictures(value: unknown, background: string): string[] {
  const listed = Array.isArray(value) ? value : [];
  const pictures = [...new Set(listed.filter((one): one is string => typeof one === 'string' && one.length > 0))];
  const kept = pictures.slice(0, BATTLE_PICTURE_LIMIT);
  if (background.length < 1 || kept.includes(background)) return kept;
  return [...kept.slice(0, BATTLE_PICTURE_LIMIT - 1), background];
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
