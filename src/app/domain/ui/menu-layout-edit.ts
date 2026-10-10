import { isMenuGroup, MenuGroup, MenuItem, MenuLayout, MenuNode } from '@axe/domain/ui/menu-layout';

/** Where an entry sits: on the menu itself, or inside one of its small menus. */
export type MenuParent = string | null;

function everyId(layout: MenuLayout): Set<string> {
  const held = new Set<string>();
  for (const node of layout.nodes) {
    held.add(node.id);
    if (isMenuGroup(node)) for (const item of node.items) held.add(item.id);
  }
  return held;
}

/** A name no entry of this menu goes by yet, counting up from the one asked for. */
function freeId(layout: MenuLayout, wanted: string): string {
  const taken = everyId(layout);
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; ; n++) {
    const tried = `${wanted}-${n}`;
    if (!taken.has(tried)) return tried;
  }
}

function mapNodes(layout: MenuLayout, change: (node: MenuNode) => MenuNode | null): MenuLayout {
  const nodes: MenuNode[] = [];
  for (const node of layout.nodes) {
    const held = change(node);
    if (held) nodes.push(held);
  }
  return { nodes };
}

/** The entry that goes by this name, wherever on the menu it sits. */
export function findMenuNode(layout: MenuLayout, id: string): MenuNode | null {
  for (const node of layout.nodes) {
    if (node.id === id) return node;
    if (isMenuGroup(node)) {
      const item = node.items.find((held) => held.id === id);
      if (item) return item;
    }
  }
  return null;
}

/** Which small menu an entry sits in, or null for one on the menu itself. */
export function parentOfMenuNode(layout: MenuLayout, id: string): MenuParent {
  for (const node of layout.nodes) {
    if (isMenuGroup(node) && node.items.some((held) => held.id === id)) return node.id;
  }
  return null;
}

/** Puts a command on the menu, on the end of the small menu named or of the menu itself. */
export function addMenuItem(layout: MenuLayout, command: string, into: MenuParent = null): MenuLayout {
  const item: MenuItem = { id: freeId(layout, command), command };
  if (into === null) return { nodes: [...layout.nodes, item] };
  return mapNodes(layout, (node) =>
    isMenuGroup(node) && node.id === into ? { ...node, items: [...node.items, item] } : node
  );
}

/** Puts a small menu of somebody's own on the end of the menu. */
export function addMenuGroup(layout: MenuLayout, label: string, icon = 'folder'): MenuLayout {
  const group: MenuGroup = { id: freeId(layout, 'group'), label, icon, items: [] };
  return { nodes: [...layout.nodes, group] };
}

/**
 * Takes an entry off the menu.
 *
 * Taking a small menu off takes what is in it with it, which is what somebody dragging it to the
 * bin means; anything they meant to keep is moved out of it first.
 */
export function removeMenuNode(layout: MenuLayout, id: string): MenuLayout {
  return mapNodes(layout, (node) => {
    if (node.id === id) return null;
    if (!isMenuGroup(node)) return node;
    const items = node.items.filter((item) => item.id !== id);
    return items.length === node.items.length ? node : { ...node, items };
  });
}

function withNode(layout: MenuLayout, id: string, change: (node: MenuNode) => MenuNode): MenuLayout {
  return mapNodes(layout, (node) => {
    if (node.id === id) return change(node);
    if (!isMenuGroup(node)) return node;
    if (!node.items.some((item) => item.id === id)) return node;
    return { ...node, items: node.items.map((item) => (item.id === id ? (change(item) as MenuItem) : item)) };
  });
}

/** Calls an entry something of somebody's own. An empty name leaves it to name itself again. */
export function renameMenuNode(layout: MenuLayout, id: string, label: string): MenuLayout {
  const named = label.trim();
  return withNode(layout, id, (node) => {
    const held = { ...node };
    if (named.length > 0) held.label = named;
    else delete held.label;
    return held;
  });
}

/** Gives an entry a mark of somebody's own. An empty mark leaves it to wear its own again. */
export function setMenuNodeIcon(layout: MenuLayout, id: string, icon: string): MenuLayout {
  const mark = icon.trim();
  return withNode(layout, id, (node) => {
    if (isMenuGroup(node)) return { ...node, icon: mark.length > 0 ? mark : 'folder' };
    const held = { ...node };
    if (mark.length > 0) held.icon = mark;
    else delete held.icon;
    return held;
  });
}

function reorder<T extends { id: string }>(order: readonly T[], id: string, delta: number): T[] | null {
  const from = order.findIndex((held) => held.id === id);
  if (from < 0) return null;
  const to = from + delta;
  if (to < 0 || to >= order.length) return null;
  const moved = [...order];
  const [held] = moved.splice(from, 1);
  moved.splice(to, 0, held);
  return moved;
}

/** Moves an entry a step up or down among the entries it sits with. */
export function moveMenuNode(layout: MenuLayout, id: string, delta: number): MenuLayout {
  const parent = parentOfMenuNode(layout, id);
  if (parent === null) {
    const moved = reorder(layout.nodes, id, delta);
    return moved ? { nodes: moved } : layout;
  }
  return mapNodes(layout, (node) => {
    if (!isMenuGroup(node) || node.id !== parent) return node;
    const moved = reorder(node.items, id, delta);
    return moved ? { ...node, items: moved } : node;
  });
}

/** Puts the entries of a menu, or of one of its small menus, in the order given. */
export function orderMenuNodes(layout: MenuLayout, parent: MenuParent, ids: readonly string[]): MenuLayout {
  if (parent === null) {
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    const nodes = ids.map((id) => byId.get(id)).filter((node): node is MenuNode => node !== undefined);
    return nodes.length === layout.nodes.length ? { nodes } : layout;
  }
  return mapNodes(layout, (node) => {
    if (!isMenuGroup(node) || node.id !== parent) return node;
    const byId = new Map(node.items.map((item) => [item.id, item]));
    const items = ids.map((id) => byId.get(id)).filter((item): item is MenuItem => item !== undefined);
    return items.length === node.items.length ? { ...node, items } : node;
  });
}

/**
 * Carries an entry into a small menu, or out onto the menu itself.
 *
 * A small menu cannot be carried into another, since one level is as deep as a menu goes, and
 * nothing is carried into itself.
 */
export function moveMenuNodeInto(layout: MenuLayout, id: string, into: MenuParent): MenuLayout {
  const node = findMenuNode(layout, id);
  if (!node || (isMenuGroup(node) && into !== null) || id === into) return layout;
  if (parentOfMenuNode(layout, id) === into) return layout;

  const without = removeMenuNode(layout, id);
  if (into === null) return { nodes: [...without.nodes, node] };
  return mapNodes(without, (held) =>
    isMenuGroup(held) && held.id === into ? { ...held, items: [...held.items, node as MenuItem] } : held
  );
}

/** Which half of an entry a drop landed on. */
export type MenuDropSide = 'before' | 'after';

/** Where an entry lands: which small menu, and which place among what is already there. */
export interface MenuDropSpot {
  parent: MenuParent;
  index: number;
}

/** Which place an entry holds among the entries it sits with, or -1 where it is on no menu. */
function placeOfMenuNode(layout: MenuLayout, id: string): number {
  const parent = parentOfMenuNode(layout, id);
  if (parent === null) return layout.nodes.findIndex((node) => node.id === id);
  const group = layout.nodes.find((node) => node.id === parent);
  return group && isMenuGroup(group) ? group.items.findIndex((item) => item.id === id) : -1;
}

function clamp(value: number, lowest: number, highest: number): number {
  return Math.max(lowest, Math.min(value, highest));
}

/**
 * Where an entry dropped beside another one lands.
 *
 * The gap just under the head of a small menu counts as being inside it, which is how an entry is
 * carried in by dragging; every other gap belongs to whatever already sits in it. A small menu
 * dropped beside something held in another lands beside that menu rather than inside it, one level
 * being as deep as a menu goes. Null where it cannot land there at all.
 */
export function menuDropSpot(layout: MenuLayout, id: string, over: string, side: MenuDropSide): MenuDropSpot | null {
  const held = findMenuNode(layout, id);
  const onto = findMenuNode(layout, over);
  if (!held || !onto || id === over) return null;

  if (isMenuGroup(held)) {
    if (held.items.some((item) => item.id === over)) return null;
    const beside = parentOfMenuNode(layout, over) ?? over;
    const at = layout.nodes.findIndex((node) => node.id === beside);
    if (at < 0) return null;
    return { parent: null, index: side === 'before' ? at : at + 1 };
  }

  const parent = parentOfMenuNode(layout, over);
  const at = placeOfMenuNode(layout, over);
  if (at < 0) return null;
  if (parent === null && isMenuGroup(onto)) {
    return side === 'before' ? { parent: null, index: at } : { parent: onto.id, index: 0 };
  }
  return { parent, index: side === 'before' ? at : at + 1 };
}

/**
 * Puts an entry in a given place, taking it out of wherever it stood.
 *
 * Where it moves within the entries it already sat with, the place it is given counts from before
 * it was lifted out, so dropping it one lower than it stood moves it one lower rather than leaving
 * it where it was. The menu itself comes back where nothing moves.
 */
export function placeMenuNode(layout: MenuLayout, id: string, spot: MenuDropSpot): MenuLayout {
  const node = findMenuNode(layout, id);
  if (!node || (isMenuGroup(node) && spot.parent !== null)) return layout;

  const from = parentOfMenuNode(layout, id);
  const was = placeOfMenuNode(layout, id);
  const index = from === spot.parent && was < spot.index ? spot.index - 1 : spot.index;
  if (from === spot.parent && index === was) return layout;

  const without = removeMenuNode(layout, id);
  if (spot.parent === null) {
    const nodes = [...without.nodes];
    nodes.splice(clamp(index, 0, nodes.length), 0, node);
    return { nodes };
  }
  return mapNodes(without, (held) => {
    if (!isMenuGroup(held) || held.id !== spot.parent) return held;
    const items = [...held.items];
    items.splice(clamp(index, 0, items.length), 0, node as MenuItem);
    return { ...held, items };
  });
}

/** The menu with an entry carried to where it was dropped, or the menu itself where nothing moves. */
export function dropMenuNode(layout: MenuLayout, id: string, over: string, side: MenuDropSide): MenuLayout {
  const spot = menuDropSpot(layout, id, over, side);
  return spot === null ? layout : placeMenuNode(layout, id, spot);
}
