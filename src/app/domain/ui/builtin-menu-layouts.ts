import { MenuSurface } from '@axe/domain/ui/menu-command';
import { MenuGroup, MenuItem, MenuLayout, MenuLayouts } from '@axe/domain/ui/menu-layout';

function item(command: string): MenuItem {
  return { id: command, command };
}

function group(
  id: string,
  icon: string,
  labelKey: string,
  commands: readonly string[],
  named: { testId?: string; menuTestId?: string } = {}
): MenuGroup {
  return { id, icon, labelKey, items: commands.map(item), ...named };
}

/**
 * The drawer as it has always been.
 *
 * Who is here and what is being said come first, then the room, the table's own tools gathered
 * under one entry, what the game is played with, and what is put in front of the table. Saving and
 * loading, the widgets and this seat's display follow, each a small menu of its own, and last of all
 * the way to have every button say what it is.
 */
const FAB: MenuLayout = {
  nodes: [
    item('peerMenu'),
    item('chat'),
    item('roomSettings'),
    group('table', 'table_restaurant', 'app.fab.table', [
      'tableSetting',
      'mapEditor',
      'dungeonGenerator',
      'tabletopDisplay',
      'visualNovel',
    ]),
    group('gameResources', 'backpack', 'app.fab.gameResources', [
      'inventory',
      'buffManager',
      'statusAilment',
      'diceTableSetting',
      'handRail',
    ]),
    group('media', 'movie', 'app.fab.media', ['images', 'jukebox', 'cutIn', 'effectLibrary']),
    group('saveLoad', 'sd_storage', 'app.fab.saveLoad', ['save', 'zipLoad', 'importCharacter'], {
      testId: 'fab-save-load',
      menuTestId: 'save-load',
    }),
    group(
      'widgets',
      'widgets',
      'app.fab.widgets',
      [
        'widgetPlToolbar',
        'widgetGmToolbar',
        'widgetClock',
        'widgetCompass',
        'widgetRecording',
        'widgetConnectionQuality',
        'widgetMiniPlayer',
        'widgetHotbar',
      ],
      { testId: 'fab-widgets', menuTestId: 'seat-widgets' }
    ),
    group(
      'display',
      'display_settings',
      'app.fab.display',
      [
        'viewMode',
        'theme',
        'skin',
        'soundSettings',
        'motion',
        'renderLite',
        'language',
        'menuEditor',
        'useMobileLayout',
      ],
      { testId: 'fab-display', menuTestId: 'seat-display' }
    ),
    item('buttonGuide'),
  ],
};

/** The master's bar as it has always been, the things that draw themselves among it. */
const GM_TOOLBAR: MenuLayout = {
  nodes: [
    item('objectList'),
    item('npcBar'),
    item('partyList'),
    item('inventory'),
    item('darkness'),
    item('fog'),
    item('resourceBars'),
    item('buffs'),
    item('speechBubbles'),
    item('releaseOwnership'),
    item('turnIndicator'),
    item('persona'),
    item('npcBarShelf'),
  ],
};

/** A player's bar as it has always been. */
const PL_TOOLBAR: MenuLayout = {
  nodes: [
    item('ownedCharacters'),
    item('inventory'),
    item('rangeShortcut'),
    item('resourceBars'),
    item('buffs'),
    item('speechBubbles'),
    item('buffView'),
    item('turnIndicator'),
    item('activeCharacter'),
  ],
};

/**
 * How each menu is arranged before anybody has arranged it.
 *
 * A screen that has never been told otherwise draws these, and putting a menu back the way it came
 * writes them again. They are also what the arrangement of a menu is measured against: a screen
 * that has emptied one keeps it empty, since having said nothing and having said none are not the
 * same thing.
 */
export const DEFAULT_MENU_LAYOUTS: MenuLayouts = {
  fab: FAB,
  gmToolbar: GM_TOOLBAR,
  plToolbar: PL_TOOLBAR,
};

/** A fresh copy of the way a menu came, for a screen about to change it. */
export function defaultMenuLayout(surface: MenuSurface): MenuLayout {
  const layout = DEFAULT_MENU_LAYOUTS[surface];
  return {
    nodes: layout.nodes.map((node) =>
      'items' in node ? { ...node, items: node.items.map((held) => ({ ...held })) } : { ...node }
    ),
  };
}
