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
  'modelLibrary',
  'jukebox',
  'cutInList',
  'characterGenerator',
  'characterImport',
  'ownedCharacters',
  'partyList',
  'buffManager',
  'statusAilment',
  'diceTableSetting',
  'myDice',
  'effectLibrary',
  'battleCutIn',
  'boardScene',
  'scenarioText',
  'mapEditor',
  'dungeonGenerator',
  'roomSnapshot',
  'replay',
  'tabletopDisplay',
  'skin',
  'soundSettings',
  'menuEditor',
  'aiLink',
  'aiGm',
] as const;

export type CharacterPanelName = (typeof CHARACTER_PANELS)[number];
export type RoomPanelName = (typeof ROOM_PANELS)[number];
export type PanelName = CharacterPanelName | RoomPanelName;

/**
 * The names a panel of the room used to be asked for by, each with the panel that took it over and
 * the half of that panel the name meant. A menu kept from before still asks by them.
 */
const FORMER_ROOM_PANELS = {
  aiGm: { panel: 'aiLink', half: 'gm' },
} as const satisfies Partial<Record<RoomPanelName, { panel: RoomPanelName; half: string }>>;

type FormerRoomPanelName = keyof typeof FORMER_ROOM_PANELS;
/** A panel of the room by the name it goes by now. */
export type StandingRoomPanelName = Exclude<RoomPanelName, FormerRoomPanelName>;
/** The half of a panel a name it used to go by meant. */
export type RoomPanelHalf = (typeof FORMER_ROOM_PANELS)[FormerRoomPanelName]['half'];

/**
 * The panel a name of the room's panels asks for, and the half of it where the name is one a panel
 * used to go by. Everything that takes a panel's name reads it through here, so a former name means
 * the same wherever it is asked by.
 */
export function roomPanelNamed(name: RoomPanelName): {
  readonly panel: StandingRoomPanelName;
  readonly half?: RoomPanelHalf;
} {
  return name in FORMER_ROOM_PANELS
    ? FORMER_ROOM_PANELS[name as FormerRoomPanelName]
    : { panel: name as StandingRoomPanelName };
}

export const DEFAULT_CHARACTER_PANEL: CharacterPanelName = 'chatPalette';

export const STATUS_AILMENT_PANEL = 'status-ailment';

const LABEL_KEYS: Record<CharacterPanelName | StandingRoomPanelName, string> = {
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
  modelLibrary: 'feature.media.modelLibrary.title',
  jukebox: 'common.panel.jukebox',
  cutInList: 'common.panel.cutInList',
  characterGenerator: 'common.panel.characterGenerator',
  characterImport: 'common.panel.characterImport',
  ownedCharacters: 'common.panel.ownedCharacters',
  partyList: 'feature.gmTools.party.title',
  buffManager: 'feature.buffManager.title',
  statusAilment: 'feature.statusAilment.title',
  diceTableSetting: 'feature.dice.tableSetting.title',
  myDice: 'feature.dice.myDice.title',
  effectLibrary: 'feature.effect.panelTitle',
  battleCutIn: 'feature.battleCutIn.title',
  boardScene: 'feature.scene.title',
  scenarioText: 'feature.scenarioText.title',
  mapEditor: 'feature.mapEditor.title',
  dungeonGenerator: 'feature.tabletop.dungeonGenerator.title',
  roomSnapshot: 'common.panel.roomSnapshot',
  replay: 'common.panel.replay',
  tabletopDisplay: 'feature.tabletop.displaySetting.title',
  skin: 'feature.skin.title',
  soundSettings: 'common.panel.soundSettings',
  menuEditor: 'feature.menuEditor.title',
  aiLink: 'feature.aiLink.title',
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
  const character = (CHARACTER_PANELS as readonly string[]).includes(panel);
  return LABEL_KEYS[character ? (panel as CharacterPanelName) : roomPanelNamed(panel as RoomPanelName).panel];
}
