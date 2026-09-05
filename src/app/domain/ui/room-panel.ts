import { MapFunctionRole } from '@axe/domain/tabletop/function-paint';

/**
 * A panel that can be opened already holding a brush.
 *
 * The map editor is where a cell's job is painted, and the toolbar wants to hand a game
 * master straight to it rather than leaving them to find the tool themselves.
 */
export interface FunctionPaintPanel {
  beginFunctionPaint(role: MapFunctionRole): void;
}

/** The panels that belong to one character, which cannot be opened without saying whose. */
export const CHARACTER_PANELS = ['chatPalette', 'sheet', 'remoteController'] as const;

/** The panels that belong to the room itself, which anyone can open at any time. */
export const ROOM_PANELS = [
  'chatWindow',
  'peerMenu',
  'tableSetting',
  'roomSettings',
  'inventory',
  'objectList',
  'fileStorage',
  'jukebox',
  'cutInList',
  'characterGenerator',
  'characterImport',
  'ownedCharacters',
  'partyList',
  'buffManager',
  'statusAilment',
  'effectLibrary',
  'mapEditor',
  'dungeonGenerator',
  'roomSnapshot',
  'replay',
] as const;

export type CharacterPanelName = (typeof CHARACTER_PANELS)[number];
export type RoomPanelName = (typeof ROOM_PANELS)[number];
export type PanelName = CharacterPanelName | RoomPanelName;

export const PANEL_NAMES: readonly PanelName[] = [...CHARACTER_PANELS, ...ROOM_PANELS];

export const DEFAULT_CHARACTER_PANEL: CharacterPanelName = 'chatPalette';

export const STATUS_AILMENT_PANEL = 'status-ailment';

const LABEL_KEYS: Record<PanelName, string> = {
  chatPalette: 'feature.hotbar.panelName.chatPalette',
  sheet: 'feature.hotbar.panelName.sheet',
  remoteController: 'feature.hotbar.panelName.remoteController',
  chatWindow: 'common.panel.chatWindow',
  peerMenu: 'common.panel.peerMenu',
  tableSetting: 'common.panel.gameTableSetting',
  roomSettings: 'common.panel.roomSettings',
  inventory: 'common.panel.inventory',
  objectList: 'common.panel.objectList',
  fileStorage: 'common.panel.fileStorage',
  jukebox: 'common.panel.jukebox',
  cutInList: 'common.panel.cutInList',
  characterGenerator: 'common.panel.characterGenerator',
  characterImport: 'common.panel.characterImport',
  ownedCharacters: 'common.panel.ownedCharacters',
  partyList: 'feature.gmTools.party.title',
  buffManager: 'feature.buffManager.title',
  statusAilment: 'feature.statusAilment.title',
  effectLibrary: 'feature.effect.panelTitle',
  mapEditor: 'feature.mapEditor.title',
  dungeonGenerator: 'feature.tabletop.dungeonGenerator.title',
  roomSnapshot: 'common.panel.roomSnapshot',
  replay: 'common.panel.replay',
};

/** Anything unknown reads as the chat palette, which is where a panel slot starts. */
export function toCharacterPanelName(value: unknown): CharacterPanelName {
  const held = typeof value === 'string' ? value : '';
  return (CHARACTER_PANELS as readonly string[]).includes(held)
    ? (held as CharacterPanelName)
    : DEFAULT_CHARACTER_PANEL;
}

/** What the panel is called on screen, borrowed from wherever it is already named. */
export function panelLabelKey(panel: PanelName): string {
  return LABEL_KEYS[panel];
}
