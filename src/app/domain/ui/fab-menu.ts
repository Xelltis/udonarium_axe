import { RoomPanelName } from '@axe/domain/ui/room-panel';

/** The small menus an entry of the drawer opens beside it, holding entries of their own. */
export type FabSubmenuName = 'table' | 'gameResources' | 'media';

/**
 * What choosing an entry does. Most open a panel; the novel mode and the hand are switched on and
 * off instead, and an entry that gathers several opens a small menu of them.
 */
export type FabAction =
  | { kind: 'panel'; panel: RoomPanelName }
  | { kind: 'visualNovel' }
  | { kind: 'handRail' }
  | { kind: 'submenu'; submenu: FabSubmenuName };

/**
 * Who an entry is offered to, when not to everyone: the game master alone, or everyone at the table
 * but those watching.
 */
export type FabAudience = 'gameMaster' | 'playing';

export interface FabEntry {
  /** Tells the entry apart from every other, in the drawer and in its menus. */
  key: string;
  icon: string;
  /** The translation key of its name. */
  labelKey: string;
  action: FabAction;
  /** Who it is offered to; everyone when left out. */
  audience?: FabAudience;
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
 * tools gathered under one entry, then what the game is played with, and what is put in front of
 * the table, the images, music, cut-ins and effects gathered under media. Saving and loading, the widgets
 * and this seat's display, the skin among it, follow in the menu itself, each as one button that
 * opens a small menu of its own beside the drawer.
 */
export const FAB_ENTRIES: readonly FabEntry[] = [
  panel('peerMenu', 'people', 'peerMenu'),
  panel('chat', 'speaker_notes', 'chatWindow'),
  panel('roomSettings', 'room_preferences', 'roomSettings'),
  submenu('table', 'table_restaurant'),
  submenu('gameResources', 'backpack'),
  submenu('media', 'movie'),
];

/** What each small menu opened from the drawer holds, in the order it is shown. */
export const FAB_SUBMENUS: Readonly<Record<FabSubmenuName, readonly FabEntry[]>> = {
  table: [
    panel('tableSetting', 'layers', 'tableSetting'),
    { ...panel('mapEditor', 'architecture', 'mapEditor', 'feature.mapEditor.title'), audience: 'gameMaster' },
    {
      ...panel('dungeonGenerator', 'map', 'dungeonGenerator', 'feature.tabletop.dungeonGenerator.title'),
      audience: 'gameMaster',
    },
    panel('tabletopDisplay', 'tablet', 'tabletopDisplay'),
    { key: 'visualNovel', icon: 'auto_stories', labelKey: 'app.fab.visualNovel', action: { kind: 'visualNovel' } },
  ],
  gameResources: [
    panel('inventory', 'folder_shared', 'inventory'),
    { ...panel('buffManager', 'timeline', 'buffManager', 'feature.buffManager.title'), audience: 'playing' },
    panel('statusAilment', 'list_alt', 'statusAilment', 'feature.statusAilment.title'),
    panel('diceTableSetting', 'casino', 'diceTableSetting', 'feature.dice.tableSetting.title'),
    { key: 'hand', icon: 'style', labelKey: 'app.fab.hand', action: { kind: 'handRail' }, audience: 'playing' },
  ],
  media: [
    panel('images', 'photo_library', 'fileStorage'),
    panel('jukebox', 'queue_music', 'jukebox'),
    panel('cutIn', 'slideshow', 'cutInList'),
    { ...panel('effectLibrary', 'auto_awesome', 'effectLibrary', 'feature.effect.title'), audience: 'playing' },
  ],
};
