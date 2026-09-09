/**
 * Which menu a right-click opens on a table that is being looked straight down on.
 *
 * A table drawn flat is not the same thing as a screen laid on a table. Reading them as one
 * gave everyone looking at a 2D table the menu built for four readers sitting around it, so
 * the menu is asked for by name instead: the ordinary list unless this screen says otherwise.
 */
export const TABLETOP_MENU_STYLES = ['standard', 'four-way', 'radial'] as const;

export type TabletopMenuStyle = (typeof TABLETOP_MENU_STYLES)[number];

export const DEFAULT_TABLETOP_MENU_STYLE: TabletopMenuStyle = 'standard';

/**
 * Reads the style, taking the switch it replaced as the answer where none has been chosen.
 *
 * `radialMenuEnabled` chose between the ring and the four lists and had no way of saying
 * "neither", so a room that turned it on meant the ring and nothing else can be read from it.
 *
 * The ordinary menu counts as "none has been chosen": a table carries the style at its
 * default from the moment it is made, so a table that answered under the old switch would
 * never be heard if the default were taken for an answer. What a screen has chosen for itself
 * is laid over this afterwards, so choosing the ordinary menu still holds.
 */
export function asTabletopMenuStyle(value: unknown, legacyRadial?: unknown): TabletopMenuStyle {
  const named =
    typeof value === 'string' && (TABLETOP_MENU_STYLES as readonly string[]).includes(value)
      ? (value as TabletopMenuStyle)
      : null;
  if (named !== null && named !== DEFAULT_TABLETOP_MENU_STYLE) return named;
  if (legacyRadial === true || legacyRadial === 'true') return 'radial';
  return named ?? DEFAULT_TABLETOP_MENU_STYLE;
}
