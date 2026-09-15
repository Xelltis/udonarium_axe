/**
 * The recent exchanges shown on the streaming overlay.
 *
 * A stream runs on, so the screen keeps **only the newest few**.
 * The older ones can be read at the table but scroll past unread on the stream, so they go.
 *
 * Private lines and hidden rolls stay off. The overlay goes somewhere that belongs to
 * nobody, where what is hidden at the table would be plain to the audience.
 */

export interface OverlaySource {
  readonly identifier: string;
  readonly name: string;
  readonly text: string;
  readonly timestamp: number;
  /** The order, taken from the same measure as the chat so two lines of one moment read as they do at the table. */
  readonly order: number;
  readonly color: string;
  readonly isDice: boolean;
  readonly isDirect: boolean;
  readonly isSecret: boolean;
  readonly isDisplayable: boolean;
}

export interface OverlayLine {
  readonly identifier: string;
  readonly name: string;
  readonly text: string;
  readonly color: string;
  readonly isDice: boolean;
}

export interface OverlayFeedOptions {
  /** How many stay on the screen. */
  readonly limit: number;
  /** Anything older goes. At zero nothing is dropped for its age. */
  readonly maxAgeMs: number;
}

export const DEFAULT_OVERLAY_FEED_OPTIONS: OverlayFeedOptions = { limit: 6, maxAgeMs: 120_000 };

/**
 * The lines the streaming overlay shows at the given moment.
 *
 * Whispers, secret rolls, messages that are not for display and blank ones are left out, and so
 * are those past the age limit. Of the rest only the last `limit` stay, in the order given.
 */
export function buildOverlayFeed(
  sources: readonly OverlaySource[],
  now: number,
  options: OverlayFeedOptions = DEFAULT_OVERLAY_FEED_OPTIONS
): OverlayLine[] {
  if (options.limit < 1) return [];

  const lines: OverlayLine[] = [];
  for (const source of sources) {
    if (!source.isDisplayable || source.isDirect || source.isSecret) continue;
    if (source.text.trim().length < 1) continue;
    if (options.maxAgeMs > 0 && now - source.timestamp > options.maxAgeMs) continue;

    lines.push({
      identifier: source.identifier,
      name: source.name,
      text: source.text,
      color: source.color,
      isDice: source.isDice,
    });
  }

  return lines.slice(-options.limit);
}
