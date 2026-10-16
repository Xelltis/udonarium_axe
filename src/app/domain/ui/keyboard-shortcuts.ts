import { PeerRole } from '@axe/domain/peer/peer-role';
import { isAudienceOffered, MenuAudience } from '@axe/domain/ui/menu-command';

/** Where a key does what it does: on the table, in the hotbar, inside one of the editors, and so on. */
export const SHORTCUT_SCOPES = [
  'global',
  'tabletop',
  'selection',
  'hotbar',
  'chat',
  'firstPerson',
  'visualNovel',
  'whiteBoard',
  'mapEditor',
  'cutInEditor',
] as const;

export type ShortcutScope = (typeof SHORTCUT_SCOPES)[number];

/** The pointer action a key goes with, as Alt goes with a click to aim at a piece. */
export type ShortcutPointer = 'click' | 'drag';

/**
 * A key press that should do what a line of the list says, for the test that holds the list to the
 * code that answers the keys.
 *
 * `key` is what KeyboardEvent.key reads and `code` what KeyboardEvent.code reads; each screen's
 * keys go by one or the other. `when` sets whatever else the screen has to be in, such as a line
 * being drawn. `command` names what the screen's key handler should answer with.
 */
export interface ShortcutProbe {
  key?: string;
  code?: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  when?: Readonly<Record<string, boolean>>;
  command: string;
}

export interface KeyboardShortcut {
  /** Tells the line apart from the others of its scope. */
  id: string;
  scope: ShortcutScope;
  /** The keys, as written on the list: each entry one way of doing it, its keys held together. */
  keys: readonly (readonly string[])[];
  /** The pointer action that goes with the keys, if any. */
  pointer?: ShortcutPointer;
  /** The translation key of what it does. */
  labelKey: string;
  /** Who may use it, in the menu's terms. Anyone, where it is not said. */
  audience?: MenuAudience;
  /** The grid it applies to, for the keys that differ between square and hex grids. */
  grid?: 'square' | 'hex';
  probe?: ShortcutProbe;
}

const ARROWS = [['←'], ['→'], ['↑'], ['↓']] as const;
const UNDO = [['Ctrl', 'Z']] as const;
const REDO = [
  ['Ctrl', 'Y'],
  ['Ctrl', 'Shift', 'Z'],
] as const;
const DELETE = [['Delete'], ['Backspace']] as const;

function line(scope: ShortcutScope, id: string, keys: KeyboardShortcut['keys'], extra: Partial<KeyboardShortcut> = {}) {
  return { id, scope, keys, labelKey: `feature.keyboard.keys.${scope}.${id}`, ...extra } as KeyboardShortcut;
}

/** What the novel mode's own list has always called its lines. */
function novel(
  id: string,
  keys: KeyboardShortcut['keys'],
  probe: ShortcutProbe,
  audience?: MenuAudience
): KeyboardShortcut {
  return { id, scope: 'visualNovel', keys, labelKey: `feature.visualNovel.shortcuts.${id}`, probe, audience };
}

/**
 * Every key and modified click the app answers, by where it is answered.
 *
 * This is what the cheat sheet and novel mode's list of keys are drawn from. The keys themselves
 * are still read where they always were, by each screen's own handler; a test holds every line
 * that carries a probe to the handler of its scope, so a key that changes there and not here, or
 * here and not there, fails.
 */
export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  line('global', 'guide', [['?']], { probe: { key: '?', command: 'toggle' } }),

  line('tabletop', 'pan', ARROWS),
  line('tabletop', 'turn', [
    ['Shift', '←'],
    ['Shift', '→'],
  ]),
  line('tabletop', 'tilt', [
    ['Shift', '↑'],
    ['Shift', '↓'],
  ]),
  line('tabletop', 'zoom', [
    ['Ctrl', '↑'],
    ['Ctrl', '↓'],
  ]),
  line('tabletop', 'target', [['T']], { probe: { key: 't', command: 'target' } }),
  line('tabletop', 'clearTargets', [['Shift', 'T']], { probe: { key: 'T', shift: true, command: 'clearTargets' } }),
  line('tabletop', 'disclosure', [['G']], { audience: 'playing', probe: { key: 'g', command: 'toggleDisclosure' } }),
  line('tabletop', 'enter', [['Enter']], { audience: 'playing' }),
  line('tabletop', 'escape', [['Esc']]),

  line('selection', 'add', [['Ctrl']], { pointer: 'click' }),
  line('selection', 'box', [], { pointer: 'drag' }),
  line('selection', 'boxAdd', [['Shift']], { pointer: 'drag' }),
  line('selection', 'boxToggle', [['Ctrl']], { pointer: 'drag' }),
  line('selection', 'aim', [['Alt']], { pointer: 'click' }),
  line('selection', 'clearAims', [['Shift', 'Alt']], { pointer: 'click' }),
  line('selection', 'snap', [['Alt']], { audience: 'playing', pointer: 'drag' }),

  line('hotbar', 'fire', [['1〜0']], {
    audience: 'playing',
    probe: { code: 'Digit1', key: '1', command: 'fireSlot' },
  }),
  line('hotbar', 'page', [['Shift', '1〜5']], {
    audience: 'playing',
    probe: { code: 'Digit2', key: '2', shift: true, command: 'gotoPage' },
  }),
  line('hotbar', 'turnPage', [['['], [']']], {
    audience: 'playing',
    probe: { code: 'BracketLeft', key: '[', command: 'turnPage' },
  }),
  line('hotbar', 'empty', [['Ctrl']], { audience: 'playing', pointer: 'click' }),

  line('chat', 'send', [['Enter']]),
  line('chat', 'newline', [['Shift', 'Enter']]),
  line('chat', 'history', [
    ['Ctrl', '↑'],
    ['Ctrl', '↓'],
  ]),
  line('chat', 'search', [['Ctrl', 'F']], { probe: { key: 'f', ctrl: true, command: 'search' } }),

  line('firstPerson', 'move', [['W'], ['A'], ['S'], ['D'], ['↑'], ['↓']], {
    audience: 'playing',
    grid: 'square',
    probe: { code: 'KeyW', command: 'move' },
  }),
  line('firstPerson', 'frontBack', [['W'], ['S'], ['↑'], ['↓']], {
    audience: 'playing',
    grid: 'hex',
    probe: { code: 'KeyS', command: 'move' },
  }),
  line('firstPerson', 'slantFront', [['A'], ['D']], {
    audience: 'playing',
    grid: 'hex',
    probe: { code: 'KeyA', command: 'move' },
  }),
  line('firstPerson', 'slantBack', [['Z'], ['C']], {
    audience: 'playing',
    grid: 'hex',
    probe: { code: 'KeyZ', command: 'move' },
  }),
  line('firstPerson', 'turn', [['Q'], ['E'], ['←'], ['→']], {
    audience: 'playing',
    probe: { code: 'KeyQ', command: 'turn' },
  }),
  line('firstPerson', 'door', [['Space']], { audience: 'playing', probe: { code: 'Space', command: 'door' } }),
  line('firstPerson', 'torch', [['F']], { audience: 'playing', probe: { code: 'KeyF', command: 'torch' } }),
  line('firstPerson', 'target', [['T']], { probe: { code: 'KeyT', command: 'target' } }),
  line('firstPerson', 'clearTargets', [['Shift', 'T']], {
    probe: { code: 'KeyT', shift: true, command: 'clearTargets' },
  }),
  line('firstPerson', 'cast', [['Enter']], {
    audience: 'playing',
    probe: { code: 'Enter', when: { picking: true }, command: 'castPicks' },
  }),
  line('firstPerson', 'escape', [['Esc']], { probe: { code: 'Escape', command: 'exit' } }),
  line('firstPerson', 'look', [], { pointer: 'drag' }),

  novel('next', [['Enter'], ['Space'], ['→'], ['↓']], { key: 'Enter', command: 'advance' }),
  novel('prev', [['←'], ['↑']], { key: 'ArrowLeft', command: 'back' }),
  novel('skip', [['Ctrl']], { key: 'Control', ctrl: true, command: 'startSkip' }),
  novel('edges', [['Home'], ['End']], { key: 'Home', command: 'toStart' }),
  novel('autoPlay', [['A']], { key: 'a', command: 'toggleAutoPlay' }),
  novel('log', [['L']], { key: 'l', command: 'toggleBacklog' }),
  novel('slot', [['S']], { key: 's', command: 'toggleSlotGuide' }, 'playing'),
  novel('close', [['Esc']], { key: 'Escape', command: 'exit' }),

  line('whiteBoard', 'tools', [['V'], ['P'], ['M'], ['E'], ['L'], ['A'], ['R'], ['T'], ['N'], ['I']], {
    probe: { key: 'p', command: 'pickTool' },
  }),
  line('whiteBoard', 'pan', [['Space']], { pointer: 'drag', probe: { key: ' ', command: 'panStart' } }),
  line('whiteBoard', 'undo', UNDO, { probe: { key: 'z', ctrl: true, command: 'undo' } }),
  line('whiteBoard', 'redo', REDO, { probe: { key: 'y', ctrl: true, command: 'redo' } }),
  line('whiteBoard', 'delete', DELETE, { probe: { key: 'Delete', command: 'deleteSelection' } }),
  line('whiteBoard', 'finish', [['Enter']], {
    probe: { key: 'Enter', when: { laying: true }, command: 'finishPath' },
  }),
  line('whiteBoard', 'drop', [['Esc']], { probe: { key: 'Escape', when: { laying: true }, command: 'dropPath' } }),
  line(
    'whiteBoard',
    'zoom',
    [
      ['Ctrl', '+'],
      ['Ctrl', '-'],
    ],
    { probe: { key: '+', ctrl: true, command: 'zoomIn' } }
  ),
  line('whiteBoard', 'zoomReset', [['Ctrl', '0']], { probe: { key: '0', ctrl: true, command: 'zoomReset' } }),
  line('whiteBoard', 'zoomFit', [['Ctrl', '9']], { probe: { key: '9', ctrl: true, command: 'zoomFit' } }),
  line('whiteBoard', 'selectAll', [['Ctrl', 'A']], { probe: { key: 'a', ctrl: true, command: 'selectAll' } }),
  line('whiteBoard', 'duplicate', [['Ctrl', 'D']], { probe: { key: 'd', ctrl: true, command: 'duplicate' } }),
  line(
    'whiteBoard',
    'copyPaste',
    [
      ['Ctrl', 'C'],
      ['Ctrl', 'V'],
    ],
    { probe: { key: 'c', ctrl: true, command: 'copy' } }
  ),
  line(
    'whiteBoard',
    'order',
    [
      ['Ctrl', ']'],
      ['Ctrl', '['],
    ],
    { probe: { key: ']', ctrl: true, command: 'bringForward' } }
  ),

  line('mapEditor', 'tools', [['A〜Z']], { audience: 'gameMaster' }),
  line('mapEditor', 'pan', [['Space']], {
    audience: 'gameMaster',
    pointer: 'drag',
    probe: { code: 'Space', key: ' ', command: 'panStart' },
  }),
  line('mapEditor', 'undo', UNDO, { audience: 'gameMaster', probe: { key: 'z', ctrl: true, command: 'undo' } }),
  line('mapEditor', 'redo', REDO, { audience: 'gameMaster', probe: { key: 'y', ctrl: true, command: 'redo' } }),
  line('mapEditor', 'delete', DELETE, {
    audience: 'gameMaster',
    probe: { key: 'Delete', when: { hasSelection: true }, command: 'deleteSelection' },
  }),
  line('mapEditor', 'commit', [['Enter']], { audience: 'gameMaster', probe: { key: 'Enter', command: 'commitDraft' } }),
  line('mapEditor', 'cancel', [['Esc']], { audience: 'gameMaster', probe: { key: 'Escape', command: 'cancelDraft' } }),

  line('cutInEditor', 'play', [['Space']], { probe: { key: ' ', command: 'togglePlaying' } }),
  line('cutInEditor', 'step', [['←'], ['→']], { probe: { key: 'ArrowLeft', command: 'stepBack' } }),
  line(
    'cutInEditor',
    'jump',
    [
      ['Shift', '←'],
      ['Shift', '→'],
    ],
    { probe: { key: 'ArrowLeft', shift: true, command: 'jumpBack' } }
  ),
  line('cutInEditor', 'edges', [['Home'], ['End']], { probe: { key: 'Home', command: 'toStart' } }),
  line('cutInEditor', 'nudge', [['↑'], ['↓'], ['Alt', '←'], ['Alt', '→']], {
    probe: { key: 'ArrowUp', when: { hasSelection: true }, command: 'nudge' },
  }),
  line('cutInEditor', 'undo', UNDO, { probe: { key: 'z', ctrl: true, command: 'undo' } }),
  line('cutInEditor', 'redo', REDO, { probe: { key: 'y', ctrl: true, command: 'redo' } }),
  line(
    'cutInEditor',
    'pose',
    [
      ['Ctrl', 'C'],
      ['Ctrl', 'V'],
    ],
    { probe: { key: 'c', ctrl: true, when: { hasSelection: true }, command: 'copyPose' } }
  ),
  line('cutInEditor', 'delete', DELETE, {
    probe: { key: 'Delete', when: { hasSelection: true }, command: 'deleteSelection' },
  }),
];

/** The lines of one scope, in the order they are listed. */
export function keyboardShortcutsOf(scope: ShortcutScope): KeyboardShortcut[] {
  return KEYBOARD_SHORTCUTS.filter((shortcut) => shortcut.scope === scope);
}

/** The lines of one scope that carry a probe, for the test that holds them to their handler. */
export function shortcutProbesOf(scope: ShortcutScope): (KeyboardShortcut & { probe: ShortcutProbe })[] {
  return keyboardShortcutsOf(scope).filter(
    (shortcut): shortcut is KeyboardShortcut & { probe: ShortcutProbe } => shortcut.probe != null
  );
}

/** The keys of a line as written on a list: `Shift+T`, or `← / ↑` for keys that each do it. */
export function shortcutKeysText(shortcut: Pick<KeyboardShortcut, 'keys'>): string {
  return shortcut.keys.map((chord) => chord.join('+')).join(' / ');
}

/** One heading of the cheat sheet and the lines under it. */
export interface ShortcutSheetSection {
  scope: ShortcutScope;
  shortcuts: KeyboardShortcut[];
}

/** What the screen is showing, which decides what the cheat sheet lists and in what order. */
export interface ShortcutSituation {
  /** Whether the first person view stands in place of the table. */
  firstPerson: boolean;
  /** The editors open with keys of their own, the latest first. */
  openScopes: readonly ShortcutScope[];
  /** The grid of the table being looked at. */
  grid: 'square' | 'hex';
  role: PeerRole;
}

const ON_THE_TABLE: readonly ShortcutScope[] = ['tabletop', 'selection', 'hotbar', 'chat', 'global'];
const IN_FIRST_PERSON: readonly ShortcutScope[] = ['firstPerson', 'hotbar', 'chat', 'global'];

/**
 * The sections of the cheat sheet: the editors open just now, then the screen under them.
 *
 * Only what can be used from where the reader is goes on it. The table's own keys give way to the
 * first person view's while it stands in front of the table, a line meant for the other grid or
 * for another role is left off, and novel mode is never listed, since it shows its own keys.
 */
export function shortcutSheetSections(situation: ShortcutSituation): ShortcutSheetSection[] {
  const screen = situation.firstPerson ? IN_FIRST_PERSON : ON_THE_TABLE;
  const opened = situation.openScopes.filter((scope) => scope !== 'visualNovel');
  return [...new Set([...opened, ...screen])]
    .map((scope) => ({
      scope,
      shortcuts: keyboardShortcutsOf(scope).filter(
        (shortcut) =>
          (shortcut.grid == null || shortcut.grid === situation.grid) &&
          isAudienceOffered(shortcut.audience ?? 'anyone', situation.role)
      ),
    }))
    .filter((section) => section.shortcuts.length > 0);
}
