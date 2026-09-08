import { RoomPanelName } from '@axe/domain/ui/room-panel';

/** What choosing an entry does. Most open a panel; two do something of their own. */
export type FabAction = { kind: 'panel'; panel: RoomPanelName } | { kind: 'zipLoad' } | { kind: 'visualNovel' };

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
 * put in front of the table, then what is taken in and out of it. Saving, the theme, the
 * effects and the language follow in the menu itself: they belong to this seat rather than
 * to the room, and they carry a state of their own to show.
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
  panel('replay', 'receipt_long', 'replay'),
  { key: 'zipLoad', icon: 'open_in_browser', action: { kind: 'zipLoad' } },
];
