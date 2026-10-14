/** The number of pads on the DJ deck. */
export const DJ_PAD_COUNT = 8;

/** The sound on each pad, by identifier, empty where a pad has none. */
export type DjPads = readonly string[];

export const NO_DJ_PADS: DjPads = Array.from({ length: DJ_PAD_COUNT }, () => '');

/**
 * Reads the room's pads as they were sent or saved: every pad empty for text that is empty or
 * broken, a pad holding anything but text read as empty, and pads past the last there is dropped.
 */
export function readDjPads(raw: unknown): DjPads {
  if (typeof raw !== 'string' || raw === '') return NO_DJ_PADS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return NO_DJ_PADS;
    return Array.from({ length: DJ_PAD_COUNT }, (_, pad) => {
      const value: unknown = parsed[pad];
      return typeof value === 'string' ? value : '';
    });
  } catch {
    return NO_DJ_PADS;
  }
}

/** Writes the room's pads down as the text `readDjPads` reads back; empty while every pad is. */
export function writeDjPads(pads: DjPads): string {
  const slots = Array.from({ length: DJ_PAD_COUNT }, (_, pad) => pads[pad] ?? '');
  return slots.every((identifier) => identifier === '') ? '' : JSON.stringify(slots);
}

/** The pads with one given a sound, or emptied with an empty identifier. */
export function withPad(pads: DjPads, pad: number, identifier: string): DjPads {
  return Array.from({ length: DJ_PAD_COUNT }, (_, index) => (index === pad ? identifier : (pads[index] ?? '')));
}
