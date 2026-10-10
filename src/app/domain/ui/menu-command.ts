import { PeerRole } from '@axe/domain/peer/peer-role';
import { RoomPanelName } from '@axe/domain/ui/room-panel';

/** The menus somebody can arrange: the drawer, and the two toolbars. */
export const MENU_SURFACES = ['fab', 'gmToolbar', 'plToolbar'] as const;

export type MenuSurface = (typeof MENU_SURFACES)[number];

/**
 * Whether a menu on this surface can hold small menus of its own.
 *
 * Only the drawer has room to open one beside itself. A bar of buttons draws what a small menu
 * holds in the bar instead, so putting one there gains nothing and loses the grouping.
 */
export function menuSurfaceTakesGroups(surface: MenuSurface): boolean {
  return surface === 'fab';
}

/**
 * Who a command is offered to.
 *
 * `playing` is everyone at the table but those watching; `player` is the players alone, for the
 * things a master has their own of.
 */
export type MenuAudience = 'anyone' | 'playing' | 'player' | 'gameMaster';

/** The things switched on and off, each named by what it switches. */
export const MENU_TOGGLES = [
  'visualNovel',
  'handRail',
  'darkness',
  'fog',
  'resourceBars',
  'buffs',
  'speechBubbles',
  'npcBar',
  'widgetPlToolbar',
  'widgetGmToolbar',
  'widgetClock',
  'widgetCompass',
  'widgetRecording',
  'widgetConnectionQuality',
  'widgetMiniPlayer',
  'widgetHotbar',
] as const;

export type MenuToggleName = (typeof MENU_TOGGLES)[number];

/** The settings that move on to their next choice when pressed, rather than having an off. */
export const MENU_CYCLES = ['viewMode', 'theme', 'motion', 'renderLite', 'language', 'buffView'] as const;

export type MenuCycleName = (typeof MENU_CYCLES)[number];

/** The things that simply happen when pressed. */
export const MENU_ACTS = [
  'save',
  'zipLoad',
  'importCharacter',
  'useMobileLayout',
  'turnNext',
  'turnPrev',
  'releaseOwnership',
  'buttonGuide',
] as const;

export type MenuActName = (typeof MENU_ACTS)[number];

/**
 * The entries that are not buttons at all and draw their own thing: the round and whose turn it is,
 * the master's borrowed eyes, the shelf of non-player pieces, the piece being moved, and the reach
 * shapes.
 */
export const MENU_CUSTOMS = ['turnIndicator', 'persona', 'npcBarShelf', 'activeCharacter', 'rangeShortcut'] as const;

export type MenuCustomName = (typeof MENU_CUSTOMS)[number];

/** What pressing an entry does. */
export type MenuAction =
  | { kind: 'panel'; panel: RoomPanelName }
  | { kind: 'toggle'; toggle: MenuToggleName }
  | { kind: 'cycle'; cycle: MenuCycleName }
  | { kind: 'act'; act: MenuActName }
  | { kind: 'custom'; custom: MenuCustomName };

export interface MenuCommand {
  /** Tells the command apart from every other, and is what an arrangement writes down. */
  key: string;
  /** The mark it wears where nothing about the room changes it. */
  icon: string;
  /** The translation key of its name, likewise. */
  labelKey: string;
  action: MenuAction;
  audience: MenuAudience;
  /** The menus it may be put on. */
  surfaces: readonly MenuSurface[];
  /** What the tests reach for it by, where it is older than the table and already had a name there. */
  testId?: string;
  /** Whether it is drawn faintly while it stands off, which only the switches over the table do. */
  dims?: boolean;
  /**
   * Whether pressing it leaves the small menu it sits in open: a switch of how this seat draws, or
   * of what floats over the table, which is pressed in turn to see each choice it moves through.
   * Anything that opens something or acts on the room closes the menu behind it.
   */
  stays?: boolean;
}

const EVERYWHERE: readonly MenuSurface[] = MENU_SURFACES;
const TOOLBARS: readonly MenuSurface[] = ['gmToolbar', 'plToolbar'];

type CommandOptions = {
  audience?: MenuAudience;
  surfaces?: readonly MenuSurface[];
  testId?: string;
  dims?: boolean;
  stays?: boolean;
};

function make(
  key: string,
  icon: string,
  labelKey: string,
  action: MenuAction,
  { audience = 'anyone', surfaces = EVERYWHERE, testId, dims, stays }: CommandOptions = {}
): MenuCommand {
  return {
    key,
    icon,
    labelKey,
    action,
    audience,
    surfaces,
    ...(testId ? { testId } : {}),
    ...(dims ? { dims } : {}),
    ...(stays ? { stays } : {}),
  };
}

function panel(
  key: string,
  icon: string,
  name: RoomPanelName,
  labelKey: string,
  options: CommandOptions = {}
): MenuCommand {
  return make(key, icon, labelKey, { kind: 'panel', panel: name }, options);
}

function toggle(key: MenuToggleName, icon: string, labelKey: string, options: CommandOptions = {}): MenuCommand {
  return make(key, icon, labelKey, { kind: 'toggle', toggle: key }, options);
}

function cycle(key: MenuCycleName, icon: string, labelKey: string, options: CommandOptions = {}): MenuCommand {
  return make(key, icon, labelKey, { kind: 'cycle', cycle: key }, { stays: true, ...options });
}

/** A widget shown or hidden over the table, which a small menu stays open over to set the rest. */
function widget(key: MenuToggleName, icon: string, labelKey: string, options: CommandOptions = {}): MenuCommand {
  return toggle(key, icon, labelKey, { stays: true, ...options });
}

function act(key: MenuActName, icon: string, labelKey: string, options: CommandOptions = {}): MenuCommand {
  return make(key, icon, labelKey, { kind: 'act', act: key }, options);
}

function custom(key: MenuCustomName, icon: string, labelKey: string, options: CommandOptions): MenuCommand {
  return make(key, icon, labelKey, { kind: 'custom', custom: key }, options);
}

/**
 * Everything a menu can be told to do, each under one name.
 *
 * The table belongs to the program, not to whoever arranges the menus: an arrangement writes down
 * a `key` and nothing else, so no amount of editing what a screen has stored can conjure up a
 * command that is not here, or hand somebody one this table does not offer them.
 *
 * The names shown are borrowed from wherever each thing is already named, so arranging the menus
 * adds no second wording to keep in step with the first.
 */
export const MENU_COMMANDS: readonly MenuCommand[] = [
  panel('peerMenu', 'people', 'peerMenu', 'app.fab.peerMenu'),
  panel('chat', 'speaker_notes', 'chatWindow', 'app.fab.chat'),
  panel('roomSettings', 'room_preferences', 'roomSettings', 'app.fab.roomSettings'),
  panel('tableSetting', 'layers', 'tableSetting', 'app.fab.tableSetting'),
  panel('mapEditor', 'architecture', 'mapEditor', 'feature.mapEditor.title', { audience: 'gameMaster' }),
  panel('dungeonGenerator', 'map', 'dungeonGenerator', 'feature.tabletop.dungeonGenerator.title', {
    audience: 'gameMaster',
  }),
  panel('tabletopDisplay', 'tablet', 'tabletopDisplay', 'app.fab.tabletopDisplay'),
  panel('inventory', 'folder_shared', 'inventory', 'app.fab.inventory'),
  panel('buffManager', 'timeline', 'buffManager', 'feature.buffManager.title', { audience: 'playing' }),
  panel('statusAilment', 'list_alt', 'statusAilment', 'feature.statusAilment.title'),
  panel('diceTableSetting', 'casino', 'diceTableSetting', 'feature.dice.tableSetting.title'),
  panel('myDice', 'format_paint', 'myDice', 'feature.dice.myDice.title', { audience: 'playing' }),
  panel('images', 'photo_library', 'fileStorage', 'app.fab.images'),
  panel('jukebox', 'queue_music', 'jukebox', 'app.fab.jukebox'),
  panel('cutIn', 'slideshow', 'cutInList', 'app.fab.cutIn'),
  panel('effectLibrary', 'auto_awesome', 'effectLibrary', 'feature.effect.title', { audience: 'playing' }),
  panel('skin', 'palette', 'skin', 'app.fab.skin', { testId: 'seat-skin' }),
  panel('soundSettings', 'volume_up', 'soundSettings', 'app.fab.soundSettings', { testId: 'seat-sound-settings' }),
  panel('objectList', 'category', 'objectList', 'app.fab.objectList', { audience: 'gameMaster' }),
  panel('partyList', 'group_work', 'partyList', 'feature.gmTools.party.title', { audience: 'gameMaster' }),
  panel('ownedCharacters', 'groups', 'ownedCharacters', 'app.fab.ownedCharacters', { audience: 'playing' }),
  panel('characterGenerator', 'person_add_alt', 'characterGenerator', 'common.panel.characterGenerator', {
    audience: 'playing',
  }),
  panel('roomSnapshot', 'history', 'roomSnapshot', 'app.fab.roomSnapshot'),
  panel('replay', 'movie_filter', 'replay', 'app.fab.replay'),
  panel('menuEditor', 'tune', 'menuEditor', 'feature.menuEditor.title'),

  toggle('visualNovel', 'auto_stories', 'app.fab.visualNovel'),
  toggle('handRail', 'style', 'app.fab.hand', { audience: 'playing', testId: 'fab-entry-hand' }),
  toggle('darkness', 'bedtime', 'app.fab.darknessOn', { audience: 'gameMaster', dims: true }),
  toggle('fog', 'foggy', 'app.fab.fogOn', { audience: 'gameMaster', dims: true }),
  toggle('resourceBars', 'align_horizontal_left', 'app.fab.resourceBarsShown', {
    testId: 'toolbar-resource-bars',
    dims: true,
  }),
  toggle('buffs', 'auto_fix_high', 'app.fab.buffsShown', { testId: 'toolbar-buffs', dims: true }),
  toggle('speechBubbles', 'chat_bubble', 'app.fab.speechShown', { testId: 'toolbar-speech', dims: true }),
  toggle('npcBar', 'groups', 'app.fab.npcBar', { audience: 'gameMaster' }),
  widget('widgetPlToolbar', 'person', 'app.fab.plTools', { audience: 'player', testId: 'seat-widget-plToolbar' }),
  widget('widgetGmToolbar', 'shield', 'app.fab.gmTools', {
    audience: 'gameMaster',
    testId: 'seat-widget-gmToolbar',
  }),
  widget('widgetClock', 'schedule', 'app.fab.clock', { testId: 'seat-widget-clock' }),
  widget('widgetCompass', 'explore', 'app.fab.compass', { testId: 'seat-widget-compass' }),
  widget('widgetRecording', 'radio_button_checked', 'app.fab.recording', {
    testId: 'seat-widget-recording',
  }),
  widget('widgetConnectionQuality', 'network_check', 'app.fab.connectionQuality', {
    testId: 'seat-widget-connectionQuality',
  }),
  widget('widgetMiniPlayer', 'play_circle', 'app.fab.miniPlayer', { testId: 'seat-widget-miniPlayer' }),
  widget('widgetHotbar', 'apps', 'feature.hotbar.toggle', { audience: 'playing', testId: 'seat-widget-hotbar' }),

  cycle('viewMode', 'view_in_ar', 'app.fab.viewPerspective', { testId: 'seat-view' }),
  cycle('theme', 'brightness_auto', 'common.theme.auto', { testId: 'seat-theme' }),
  cycle('motion', 'motion_photos_auto', 'common.motion.auto', { testId: 'seat-motion' }),
  cycle('renderLite', 'blur_circular', 'common.renderLite.auto', { testId: 'seat-render-lite' }),
  cycle('language', 'translate', 'common.language.switchTooltip', { testId: 'seat-lang' }),
  cycle('buffView', 'auto_fix_high', 'feature.plTools.buffView', {
    audience: 'playing',
    testId: 'buff-view-cycle',
  }),

  act('save', 'save', 'app.fab.save', { testId: 'save-load-save' }),
  act('zipLoad', 'open_in_browser', 'app.fab.zipLoad', { audience: 'playing', testId: 'save-load-load' }),
  act('importCharacter', 'person_add', 'app.fab.importCharacter', {
    audience: 'playing',
    testId: 'save-load-import-character',
  }),
  act('useMobileLayout', 'smartphone', 'feature.mobile.useMobile', { testId: 'seat-use-mobile' }),
  act('turnNext', 'chevron_right', 'feature.turnOrder.next', { audience: 'gameMaster' }),
  act('turnPrev', 'chevron_left', 'feature.turnOrder.prev', { audience: 'gameMaster' }),
  act('releaseOwnership', 'key_off', 'app.fab.releaseOwnership', { audience: 'gameMaster' }),
  act('buttonGuide', 'help_outline', 'app.fab.buttonGuide'),

  custom('turnIndicator', 'hourglass_top', 'feature.turnOrder.title', { surfaces: TOOLBARS }),
  custom('persona', 'visibility', 'feature.gmTools.persona.title', {
    audience: 'gameMaster',
    surfaces: ['gmToolbar'],
  }),
  custom('npcBarShelf', 'groups', 'app.fab.npcBar', { audience: 'gameMaster', surfaces: ['gmToolbar'] }),
  custom('activeCharacter', 'account_circle', 'feature.plTools.active.title', {
    audience: 'player',
    surfaces: ['plToolbar'],
  }),
  custom('rangeShortcut', 'radar', 'feature.plTools.range.title', { audience: 'player', surfaces: ['plToolbar'] }),
];

const BY_KEY: ReadonlyMap<string, MenuCommand> = new Map(MENU_COMMANDS.map((command) => [command.key, command]));

/** The command that goes by this name, or null where no such command exists in this version. */
export function menuCommandOf(key: string): MenuCommand | null {
  return BY_KEY.get(key) ?? null;
}

/** Whether a role is offered this command at all. What it is not offered never draws and never runs. */
export function isMenuCommandOffered(command: MenuCommand, role: PeerRole): boolean {
  switch (command.audience) {
    case 'anyone':
      return true;
    case 'playing':
      return role !== PeerRole.Guest;
    case 'player':
      return role === PeerRole.Player;
    case 'gameMaster':
      return role === PeerRole.GameMaster;
  }
}

/** Whether a command may be put on this menu. */
export function menuCommandFits(command: MenuCommand, surface: MenuSurface): boolean {
  return command.surfaces.includes(surface);
}

/** The commands a role may put on a menu, in the order the table lists them. */
export function menuCommandsFor(surface: MenuSurface, role: PeerRole): MenuCommand[] {
  return MENU_COMMANDS.filter((command) => menuCommandFits(command, surface) && isMenuCommandOffered(command, role));
}
