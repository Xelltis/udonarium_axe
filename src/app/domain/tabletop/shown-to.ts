/**
 * Who is shown a piece of painted ground.
 *
 * A trap the room can see is no trap, and a bank of fog nobody can see is no landmark, so the
 * same ground is worth hiding from some tables and worth showing on others. The middle answer
 * is the one worth having: shown to whoever's eyes reach it, which is a trap being spotted and
 * a swamp coming into view.
 */
export const SHOWN_TO = ['master', 'sight', 'room'] as const;

export type ShownTo = (typeof SHOWN_TO)[number];

/**
 * Reads who a stored answer shows ground to, falling back to what the ground used to say.
 *
 * Ground painted before there was a third answer carries a plain yes or no, so the fallback is
 * worked out from that rather than guessed at.
 */
export function asShownTo(value: unknown, fallback: ShownTo): ShownTo {
  return typeof value === 'string' && (SHOWN_TO as readonly string[]).includes(value) ? (value as ShownTo) : fallback;
}
