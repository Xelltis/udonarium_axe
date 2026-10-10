import { MENU_SURFACES, MenuSurface } from '@axe/domain/ui/menu-command';
import { encodeMenuLayout, MenuLayout, parseMenuLayout } from '@axe/domain/ui/menu-layout';

/** What the version stamp reads while this is the shape of the file. */
export const MENU_LAYOUT_FILE_VERSION = 1;

/** The arrangements a file carries, which is only those the screen it came from had made. */
export type MenuLayoutFile = Partial<Record<MenuSurface, MenuLayout>>;

interface WrittenFile {
  axeMenus: number;
  layouts: Partial<Record<MenuSurface, unknown>>;
}

/** The name a saved arrangement goes by. */
export const MENU_LAYOUT_FILE_NAME = 'axe-menus.json';

/** Writes out the arrangements a screen has made. A menu left the way it came is not written. */
export function encodeMenuLayoutFile(layouts: MenuLayoutFile): string {
  const written: WrittenFile = { axeMenus: MENU_LAYOUT_FILE_VERSION, layouts: {} };
  for (const surface of MENU_SURFACES) {
    const layout = layouts[surface];
    if (layout) written.layouts[surface] = JSON.parse(encodeMenuLayout(layout));
  }
  return JSON.stringify(written, null, 2);
}

/**
 * Reads arrangements out of a file, or null where the file is not one of ours.
 *
 * Each menu is read on its own, so a file holding one this version cannot make sense of still
 * hands over the rest. A file naming no menu at all reads as nothing rather than as a file to
 * take, since reading it would otherwise empty every menu it did not mention.
 */
export function parseMenuLayoutFile(raw: string): MenuLayoutFile | null {
  let held: unknown;
  try {
    held = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof held !== 'object' || held === null) return null;
  const written = (held as Record<string, unknown>)['layouts'];
  if (typeof written !== 'object' || written === null) return null;

  const layouts: MenuLayoutFile = {};
  for (const surface of MENU_SURFACES) {
    const nodes = (written as Record<string, unknown>)[surface];
    if (nodes === undefined) continue;
    const layout = parseMenuLayout(JSON.stringify(nodes));
    if (layout) layouts[surface] = layout;
  }
  return Object.keys(layouts).length > 0 ? layouts : null;
}
