import { RoomPanelName } from '@axe/domain/ui/room-panel';

/** The small menus an entry of the drawer opens beside it, holding entries of their own. */
export type FabSubmenuName = 'table' | 'media';

/**
 * What choosing an entry does. Most open a panel; the novel mode is switched on and off instead, and
 * an entry that gathers several opens a small menu of them.
 */
export type FabAction =
  { kind: 'panel'; panel: RoomPanelName } | { kind: 'visualNovel' } | { kind: 'submenu'; submenu: FabSubmenuName };

export interface FabEntry {
  /** Tells the entry apart from every other, in the drawer and in its menus. */
  key: string;
  icon: string;
  /** The translation key of its name. */
  labelKey: string;
  action: FabAction;
  /** Offered to the game master alone, as the tools for building the table are. */
  gameMasterOnly?: boolean;
}

function panel(key: string, icon: string, name: RoomPanelName, labelKey = `app.fab.${key}`): FabEntry {
  return { key, icon, labelKey, action: { kind: 'panel', panel: name } };
}

function submenu(key: FabSubmenuName, icon: string): FabEntry {
  return { key, icon, labelKey: `app.fab.${key}`, action: { kind: 'submenu', submenu: key } };
}

/**
 * The menu, in the order its entries are reached for.
 *
 * Who is here and what is being said come first, then the room and the table, the table's own
 * tools gathered under one entry, then what is put in front of the table, the images, music and
 * cut-ins gathered under media. Saving and loading, the widgets and this seat's display follow in
 * the menu itself, each as one button that opens a small menu of its own beside the drawer.
 */
export const FAB_ENTRIES: readonly FabEntry[] = [
  panel('peerMenu', 'people', 'peerMenu'),
  panel('chat', 'speaker_notes', 'chatWindow'),
  panel('roomSettings', 'room_preferences', 'roomSettings'),
  submenu('table', 'grid_on'),
  panel('inventory', 'folder_shared', 'inventory'),
  submenu('media', 'perm_media'),
  panel('skin', 'palette', 'skin'),
];

/** What each small menu opened from the drawer holds, in the order it is shown. */
export const FAB_SUBMENUS: Readonly<Record<FabSubmenuName, readonly FabEntry[]>> = {
  table: [
    panel('tableSetting', 'layers', 'tableSetting'),
    { ...panel('mapEditor', 'architecture', 'mapEditor', 'feature.mapEditor.title'), gameMasterOnly: true },
    {
      ...panel('dungeonGenerator', 'map', 'dungeonGenerator', 'feature.tabletop.dungeonGenerator.title'),
      gameMasterOnly: true,
    },
    panel('tabletopDisplay', 'table_restaurant', 'tabletopDisplay'),
    { key: 'visualNovel', icon: 'auto_stories', labelKey: 'app.fab.visualNovel', action: { kind: 'visualNovel' } },
  ],
  media: [
    panel('images', 'photo_library', 'fileStorage'),
    panel('jukebox', 'queue_music', 'jukebox'),
    panel('cutIn', 'slideshow', 'cutInList'),
  ],
};
