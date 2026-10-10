import { MENU_SURFACES, MenuSurface } from '@axe/domain/ui/menu-command';

/** One press on a menu, naming a command and, where somebody has said so, what to call it. */
export interface MenuItem {
  /** Tells this entry apart from another entry of the same command elsewhere in the menu. */
  id: string;
  /** The key of the command in the table; an entry naming one this version has never heard of is dropped. */
  command: string;
  /** What somebody called it. Empty leaves the command to name itself. */
  label?: string;
  /** The mark somebody gave it. Empty leaves the command to wear its own. */
  icon?: string;
}

/** A small menu of its own, opened beside the one it sits on. */
export interface MenuGroup {
  id: string;
  /** Marks it apart from an entry; groups hold entries and entries do not hold anything. */
  items: readonly MenuItem[];
  icon: string;
  /** The translation key of the name a group that came with the program goes by. */
  labelKey?: string;
  /** What somebody called it, which wins over the key. */
  label?: string;
  /** What the tests reach its button by, where it is older than this and already had a name. */
  testId?: string;
  /** What the tests reach the menu it opens by, likewise. */
  menuTestId?: string;
}

export type MenuNode = MenuItem | MenuGroup;

/** How one menu is arranged: a list of entries and small menus, one level deep and no further. */
export interface MenuLayout {
  nodes: readonly MenuNode[];
}

export type MenuLayouts = Readonly<Record<MenuSurface, MenuLayout>>;

/** Whether the node is a small menu rather than a single press. */
export function isMenuGroup(node: MenuNode): node is MenuGroup {
  return Array.isArray((node as MenuGroup).items);
}

/** Every entry of a menu, the ones inside its small menus among them. */
export function menuItemsOf(layout: MenuLayout): MenuItem[] {
  return layout.nodes.flatMap((node) => (isMenuGroup(node) ? [...node.items] : [node]));
}

/** The arrangement as text, for the one place a screen keeps it. */
export function encodeMenuLayout(layout: MenuLayout): string {
  return JSON.stringify(layout.nodes);
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readItem(raw: unknown): MenuItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const held = raw as Record<string, unknown>;
  const command = readText(held['command']);
  if (!command) return null;
  return {
    id: readText(held['id']) ?? command,
    command,
    label: readText(held['label']),
    icon: readText(held['icon']),
  };
}

function readGroup(raw: Record<string, unknown>): MenuGroup | null {
  const items = (raw['items'] as unknown[]).map(readItem).filter((item): item is MenuItem => item !== null);
  const id = readText(raw['id']);
  if (!id) return null;
  return {
    id,
    items,
    icon: readText(raw['icon']) ?? 'folder',
    labelKey: readText(raw['labelKey']),
    label: readText(raw['label']),
    testId: readText(raw['testId']),
    menuTestId: readText(raw['menuTestId']),
  };
}

/**
 * Reads an arrangement back, or null where there is nothing readable to read.
 *
 * Forgiving throughout: a node it cannot make sense of is left out rather than taking the whole
 * arrangement down with it, and a small menu found inside a small menu is flattened away, since
 * one level is as deep as a menu goes. Nothing here asks whether a command exists — a screen may
 * be reading an arrangement written by a newer version, and the names it does not know are
 * dropped when the menu is drawn rather than when it is read, so going back to the newer version
 * finds them still there.
 */
export function parseMenuLayout(raw: string): MenuLayout | null {
  let held: unknown;
  try {
    held = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(held)) return null;

  const nodes: MenuNode[] = [];
  for (const entry of held) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (Array.isArray(record['items'])) {
      const group = readGroup(record);
      if (group) nodes.push(group);
      continue;
    }
    const item = readItem(record);
    if (item) nodes.push(item);
  }
  return { nodes };
}

/** Whether a value names one of the menus. */
export function isMenuSurface(value: unknown): value is MenuSurface {
  return typeof value === 'string' && (MENU_SURFACES as readonly string[]).includes(value);
}
