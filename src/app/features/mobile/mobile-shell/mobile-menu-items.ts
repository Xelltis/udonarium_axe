export type MobileMenuAction =
  | 'peerMenu'
  | 'tableSetting'
  | 'roomSettings'
  | 'images'
  | 'jukebox'
  | 'cutIn'
  | 'effect'
  | 'inventory'
  | 'objectList'
  | 'party'
  | 'mapEditor'
  | 'dungeonGenerator'
  | 'createObject'
  | 'importCharacter'
  | 'roomSnapshot'
  | 'replay'
  | 'visualNovel'
  | 'hand'
  | 'darkness'
  | 'turnPrev'
  | 'turnNext'
  | 'activePalette'
  | 'zipLoad'
  | 'save';

export interface MobileMenuItem {
  readonly action: MobileMenuAction;
  readonly icon: string;
  readonly labelKey: string;
  readonly gameMasterOnly?: boolean;
}

export const MOBILE_MENU_ITEMS: readonly MobileMenuItem[] = [
  { action: 'peerMenu', icon: 'people', labelKey: 'app.fab.peerMenu' },
  { action: 'tableSetting', icon: 'layers', labelKey: 'app.fab.tableSetting' },
  { action: 'roomSettings', icon: 'tune', labelKey: 'app.fab.roomSettings', gameMasterOnly: true },
  { action: 'images', icon: 'photo_library', labelKey: 'app.fab.images' },
  { action: 'jukebox', icon: 'queue_music', labelKey: 'app.fab.jukebox' },
  { action: 'cutIn', icon: 'slideshow', labelKey: 'app.fab.cutIn' },
  { action: 'effect', icon: 'auto_awesome', labelKey: 'feature.effect.title' },
  { action: 'inventory', icon: 'folder_shared', labelKey: 'app.fab.inventory' },
  { action: 'objectList', icon: 'list_alt', labelKey: 'feature.mobile.objectList', gameMasterOnly: true },
  { action: 'party', icon: 'diversity_3', labelKey: 'feature.gmTools.party.title', gameMasterOnly: true },
  { action: 'darkness', icon: 'dark_mode', labelKey: 'feature.mobile.darkness', gameMasterOnly: true },
  { action: 'turnPrev', icon: 'skip_previous', labelKey: 'feature.mobile.turnPrev', gameMasterOnly: true },
  { action: 'turnNext', icon: 'skip_next', labelKey: 'feature.mobile.turnNext', gameMasterOnly: true },
  { action: 'mapEditor', icon: 'edit_square', labelKey: 'feature.mapEditor.title', gameMasterOnly: true },
  {
    action: 'dungeonGenerator',
    icon: 'map',
    labelKey: 'feature.tabletop.dungeonGenerator.title',
    gameMasterOnly: true,
  },
  { action: 'createObject', icon: 'add_circle', labelKey: 'app.fab.createObject' },
  { action: 'importCharacter', icon: 'person_add', labelKey: 'app.fab.importCharacter' },
  { action: 'roomSnapshot', icon: 'history', labelKey: 'app.fab.roomSnapshot' },
  { action: 'replay', icon: 'receipt_long', labelKey: 'app.fab.replay' },
  { action: 'visualNovel', icon: 'auto_stories', labelKey: 'app.fab.visualNovel' },
  { action: 'activePalette', icon: 'chat', labelKey: 'feature.mobile.activePalette' },
  { action: 'hand', icon: 'style', labelKey: 'app.fab.handCards' },
  { action: 'zipLoad', icon: 'open_in_browser', labelKey: 'app.fab.zipLoad' },
  { action: 'save', icon: 'sd_storage', labelKey: 'app.fab.save' },
];

export function sharedMobileMenuItems(): MobileMenuItem[] {
  return MOBILE_MENU_ITEMS.filter((item) => !item.gameMasterOnly);
}

export function gameMasterMobileMenuItems(): MobileMenuItem[] {
  return MOBILE_MENU_ITEMS.filter((item) => item.gameMasterOnly === true);
}
