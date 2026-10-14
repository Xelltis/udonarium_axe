/** The effects the room's music goes through, as the DJ deck sets them for everyone. */
export interface DjEffects {
  /** The filter: 0 lets everything through, below 0 cuts the treble down to a muffle, above 0 cuts the bass down to a thin line. */
  readonly filter: number;
  /** How much of the music echoes back on the beat, from 0 to 1. */
  readonly echo: number;
  /** How much of the music rings on as in a large hall, from 0 to 1. */
  readonly reverb: number;
}

export const NO_DJ_EFFECTS: DjEffects = { filter: 0, echo: 0, reverb: 0 };

/** How close to 0 the filter must be to let everything through, so a knob let go near the middle is not left a hair off. */
export const FILTER_DEAD_ZONE = 0.02;

function within(value: unknown, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;
}

/**
 * Reads the room's effects as they were sent, every effect off for text that is empty or broken
 * and for each effect missing or not a number. A number out of range is brought into it, and a
 * filter within the dead zone of the middle reads as off.
 */
export function readDjEffects(raw: unknown): DjEffects {
  if (typeof raw !== 'string' || raw === '') return NO_DJ_EFFECTS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return NO_DJ_EFFECTS;
    const value = parsed as Record<string, unknown>;
    const filter = within(value['filter'], -1, 1);
    return {
      filter: Math.abs(filter) < FILTER_DEAD_ZONE ? 0 : filter,
      echo: within(value['echo'], 0, 1),
      reverb: within(value['reverb'], 0, 1),
    };
  } catch {
    return NO_DJ_EFFECTS;
  }
}

/** Writes the room's effects down as the text `readDjEffects` reads back, naming only those on; empty when none is. */
export function writeDjEffects(effects: DjEffects): string {
  const on = (Object.keys(NO_DJ_EFFECTS) as (keyof DjEffects)[]).filter(
    (key) => Math.round(effects[key] * 1000) !== 0 && !(key === 'filter' && Math.abs(effects[key]) < FILTER_DEAD_ZONE)
  );
  if (on.length === 0) return '';
  return JSON.stringify(Object.fromEntries(on.map((key) => [key, Math.round(effects[key] * 1000) / 1000])));
}

/** Whether any effect is on. */
export function hasDjEffects(effects: DjEffects): boolean {
  return effects.filter !== 0 || effects.echo > 0 || effects.reverb > 0;
}

/** How long the echo waits before coming back: three quarters of a beat, or 0.375 s while the beat is unknown. */
export function echoDelayS(bpm: number | null): number {
  return bpm && bpm > 0 ? Math.min(2, (0.75 * 60) / bpm) : 0.375;
}
