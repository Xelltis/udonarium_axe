import { RoomPanelName } from '@axe/domain/ui/room-panel';

/** What choosing an entry does. Most open a panel; the novel mode is switched on and off instead. */
export type FabAction = { kind: 'panel'; panel: RoomPanelName } | { kind: 'visualNovel' };

export interface FabEntry {
  /** Names the label under app.fab. */
  key: string;
  icon: string;
  action: FabAction;
}

function panel(key: string, icon: string, name: RoomPanelName): FabEntry {
  return { key, icon, action: { kind: 'panel', panel: name } };
}

/**
 * The menu, in the order its entries are reached for.
 *
 * Who is here and what is being said come first, then the room and the table, then what is
 * put in front of the table. Saving and loading, the widgets and this seat's display follow in
 * the menu itself, each as one button that opens a small menu of its own beside the drawer.
 */
export const FAB_ENTRIES: readonly FabEntry[] = [
  panel('peerMenu', 'people', 'peerMenu'),
  panel('chat', 'speaker_notes', 'chatWindow'),
  panel('roomSettings', 'room_preferences', 'roomSettings'),
  panel('tableSetting', 'layers', 'tableSetting'),
  panel('inventory', 'folder_shared', 'inventory'),
  panel('images', 'photo_library', 'fileStorage'),
  panel('jukebox', 'queue_music', 'jukebox'),
  panel('cutIn', 'slideshow', 'cutInList'),
  { key: 'visualNovel', icon: 'auto_stories', action: { kind: 'visualNovel' } },
  panel('tabletopDisplay', 'table_restaurant', 'tabletopDisplay'),
  panel('skin', 'palette', 'skin'),
];
