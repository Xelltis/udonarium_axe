import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import {
  buildGameTableContextMenu,
  GameTableMenuState,
} from '@axe/features/tabletop/game-table/game-table-context-menu';

const t = (key: string) => key;

function state(more: Partial<GameTableMenuState> = {}): GameTableMenuState {
  return {
    create: [[{ name: 'make A', action: () => {} }], [{ name: 'make B', action: () => {} }]],
    party: [],
    canEditSwitches: false,
    concealed: [],
    pressedGround: [],
    mobile: false,
    mode2d: false,
    viewLocked: false,
    canSnapToRealSize: false,
    ...more,
  };
}

function hands() {
  return {
    openDeckBuilder: vi.fn<() => void>(),
    openCharacterGenerator: vi.fn<() => void>(),
    openTableSetting: vi.fn<() => void>(),
    setViewLocked: vi.fn<(locked: boolean) => void>(),
    snapToRealSize: vi.fn<() => void>(),
  };
}

const names = (actions: readonly ContextMenuAction[]) =>
  actions.map((action) => (action === ContextMenuSeparator ? '---' : action.name));

const named = (actions: readonly ContextMenuAction[], name: string) => actions.find((action) => action.name === name)!;

describe('the table’s right-click menu', () => {
  it('offers making things there, a deck, and the table’s settings, set apart', () => {
    const menu = buildGameTableContextMenu(state(), hands(), t);

    expect(names(menu.actions)).toEqual([
      'make A',
      '---',
      'make B',
      'feature.tabletop.action.createDeck',
      '---',
      'feature.tabletop.tableSetting.title',
    ]);
  });

  it('opens what each entry is for', () => {
    const doing = hands();
    const menu = buildGameTableContextMenu(state(), doing, t);

    named(menu.actions, 'feature.tabletop.action.createDeck').action!();
    named(menu.actions, 'feature.tabletop.tableSetting.title').action!();

    expect(doing.openDeckBuilder).toHaveBeenCalledOnce();
    expect(doing.openTableSetting).toHaveBeenCalledOnce();
  });

  it('offers making a piece with options on a phone', () => {
    const doing = hands();
    const menu = buildGameTableContextMenu(state({ mobile: true }), doing, t);

    named(menu.actions, 'feature.tabletop.contextMenu.createWithOptions').action!();

    expect(doing.openCharacterGenerator).toHaveBeenCalledOnce();
  });

  it('puts in the party, what is out of sight and the pressed ground only where there are any', () => {
    const menu = buildGameTableContextMenu(
      state({
        party: [{ name: 'gather', action: () => {} }],
        canEditSwitches: true,
        concealed: [{ label: 'chest', reveal: () => {} }],
        pressedGround: [{ label: 'plate', reset: () => {} }],
      }),
      hands(),
      t
    );

    expect(names(menu.actions).slice(5)).toEqual([
      'gather',
      '---',
      'feature.boardSwitch.menu.concealed',
      '---',
      'feature.boardSwitch.menu.reset',
      '---',
      'feature.tabletop.tableSetting.title',
    ]);
    expect(menu.rotatingGroups.map((group) => group.icon)).toEqual([
      'add_circle',
      'add_box',
      'group',
      'visibility',
      'restart_alt',
      'tune',
    ]);
  });

  it('leaves out what is out of sight for a reader who may not bring it back', () => {
    const menu = buildGameTableContextMenu(state({ concealed: [{ label: 'chest', reveal: () => {} }] }), hands(), t);

    expect(names(menu.actions)).not.toContain('feature.boardSwitch.menu.concealed');
  });

  it('holds the view still in 2D alone, and offers real size only where it would do something', () => {
    const doing = hands();
    expect(names(buildGameTableContextMenu(state(), doing, t).actions)).not.toContain(
      'feature.tabletop.contextMenu.viewLockOff'
    );

    const flat = buildGameTableContextMenu(state({ mode2d: true }), doing, t);
    expect(names(flat.actions).slice(-2)).toEqual([
      'feature.tabletop.tableSetting.title',
      'feature.tabletop.contextMenu.viewLockOff',
    ]);
    named(flat.actions, 'feature.tabletop.contextMenu.viewLockOff').action!();
    expect(doing.setViewLocked).toHaveBeenCalledWith(true);

    const measured = buildGameTableContextMenu(state({ mode2d: true, canSnapToRealSize: true }), doing, t);
    named(measured.actions, 'feature.tabletop.contextMenu.snapToRealSize').action!();
    expect(doing.snapToRealSize).toHaveBeenCalledOnce();
  });

  it('shows the rotating menu the same entries as the plain one, in groups', () => {
    const menu = buildGameTableContextMenu(state({ mode2d: true }), hands(), t);

    const grouped = menu.rotatingGroups.flatMap((group) => group.actions);

    expect(names(grouped)).toEqual(names(menu.actions).filter((name) => name !== '---'));
  });
});
