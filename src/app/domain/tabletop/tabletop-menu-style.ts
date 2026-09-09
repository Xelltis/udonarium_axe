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
 * Reads the style, taking the switch it replaced as the answer where there is no style yet.
 *
 * `radialMenuEnabled` chose between the ring and the four lists and had no way of saying
 * "neither", so a room that turned it on meant the ring and nothing else can be read from it.
 */
export function asTabletopMenuStyle(value: unknown, legacyRadial?: unknown): TabletopMenuStyle {
  if (typeof value === 'string' && (TABLETOP_MENU_STYLES as readonly string[]).includes(value)) {
    return value as TabletopMenuStyle;
  }
  if (legacyRadial === true || legacyRadial === 'true') return 'radial';
  return DEFAULT_TABLETOP_MENU_STYLE;
}
