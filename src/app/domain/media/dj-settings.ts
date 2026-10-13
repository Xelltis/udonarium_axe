/** How the room's music is mixed, as the game master sets it for everyone. */
export interface DjSettings {
  /** Whether every sound is brought to the loudness of its kind. */
  readonly autoLevel: boolean;
  /** Whether the music goes down under sound effects and cut-ins. */
  readonly ducking: boolean;
  /** How long one track fades into the next, in seconds; 0 cuts straight across. */
  readonly crossfadeS: number;
  /**
   * How long the music fades out when paused or stopped, and back in when it goes on, in seconds;
   * 0 cuts at once.
   */
  readonly pauseFadeS: number;
  /** Whether a change of track or a jump to a marked place waits for the next bar or beat. */
  readonly quantize: boolean;
  /** Whether the edges of the screen glow with the beat. */
  readonly beatLight: boolean;
}

/** The longest fade from one track into the next, in seconds. */
export const MAX_CROSSFADE_S = 12;

/** The fades offered, in seconds. */
export const CROSSFADE_CHOICES: readonly number[] = [0, 1, 2, 4, 8, 12];

/** The longest fade for a pause, in seconds. */
export const MAX_PAUSE_FADE_S = 8;

/** The fades offered for a pause, in seconds. */
export const PAUSE_FADE_CHOICES: readonly number[] = [0, 0.4, 1, 2, 4, 8];

export const DEFAULT_DJ_SETTINGS: DjSettings = {
  autoLevel: true,
  ducking: true,
  crossfadeS: 2,
  pauseFadeS: 0.4,
  quantize: false,
  beatLight: false,
};

/**
 * Reads the room's mixing as it was sent or saved.
 *
 * Text that is empty or broken reads as the defaults, as does each setting that is missing or of
 * the wrong kind: only JSON `true` and `false` are taken for the switches, and only a number from
 * 0 to `MAX_CROSSFADE_S` or `MAX_PAUSE_FADE_S` for the fades, so a room from a version that knew
 * no such settings mixes as a new room does.
 */
export function readDjSettings(raw: unknown): DjSettings {
  if (typeof raw !== 'string' || raw === '') return DEFAULT_DJ_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_DJ_SETTINGS;
    const value = parsed as Record<string, unknown>;
    const flag = (key: keyof DjSettings): boolean =>
      typeof value[key] === 'boolean' ? (value[key] as boolean) : (DEFAULT_DJ_SETTINGS[key] as boolean);
    const seconds = (key: 'crossfadeS' | 'pauseFadeS', max: number): number => {
      const given = value[key];
      return typeof given === 'number' && Number.isFinite(given) && given >= 0 && given <= max
        ? given
        : DEFAULT_DJ_SETTINGS[key];
    };
    return {
      autoLevel: flag('autoLevel'),
      ducking: flag('ducking'),
      crossfadeS: seconds('crossfadeS', MAX_CROSSFADE_S),
      pauseFadeS: seconds('pauseFadeS', MAX_PAUSE_FADE_S),
      quantize: flag('quantize'),
      beatLight: flag('beatLight'),
    };
  } catch {
    return DEFAULT_DJ_SETTINGS;
  }
}

/** Writes the room's mixing down as the text `readDjSettings` reads back, naming only what differs from the defaults; empty when nothing does. */
export function writeDjSettings(settings: DjSettings): string {
  const changed = (Object.keys(DEFAULT_DJ_SETTINGS) as (keyof DjSettings)[]).filter(
    (key) => settings[key] !== DEFAULT_DJ_SETTINGS[key]
  );
  if (changed.length === 0) return '';
  return JSON.stringify(Object.fromEntries(changed.map((key) => [key, settings[key]])));
}
