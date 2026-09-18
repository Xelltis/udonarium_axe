/**
 * The items a room lets its remote controllers show, picked by name, or null where it has picked
 * none out and every item is shown.
 *
 * A room saved before there was anything to pick reads as null, so it goes on showing what it
 * always did. Once a room has picked, an item written onto a sheet afterwards stays out until it
 * is picked as well: what is not picked is not shown.
 */
export type ControllerResourcePick = readonly string[] | null;

/**
 * Reads the pick a room holds.
 *
 * Empty text is a room that never picked. Anything that is not a list of names, such as text an
 * older build or a damaged save left behind, is read the same way, so the remote shows everything
 * rather than nothing.
 */
export function readControllerResourcePick(held: unknown): ControllerResourcePick {
  const text = `${held ?? ''}`;
  if (text.length < 1) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return uniqueNames(parsed.filter((name): name is string => typeof name === 'string'));
}

/** Writes a pick the way {@link readControllerResourcePick} reads it, with empty for no pick. */
export function writeControllerResourcePick(pick: ControllerResourcePick): string {
  return pick === null ? '' : JSON.stringify(uniqueNames(pick));
}

/** Whether the remote shows the item with this name. */
export function controllerShowsResource(pick: ControllerResourcePick, name: string): boolean {
  return pick === null || pick.includes(name.trim());
}

/**
 * The pick after one item is shown or hidden.
 *
 * A room that has not picked yet shows everything it offers, so hiding one item starts from all
 * of those; a name picked before that no longer turns up on any sheet is kept, for the piece that
 * brings it back.
 */
export function pickControllerResource(
  pick: ControllerResourcePick,
  name: string,
  shown: boolean,
  offered: readonly string[]
): string[] {
  const wanted = name.trim();
  const names = uniqueNames(pick ?? offered).filter((picked) => picked !== wanted);
  return shown ? [...names, wanted] : names;
}

function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return [...seen];
}
