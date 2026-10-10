import {
  BoardSwitchMenuState,
  buildBoardSwitchMenu,
  buildPressedGroundMenu,
} from '@axe/features/tabletop/board-switch/board-switch-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

describe('buildBoardSwitchMenu', () => {
  const callbacks = { edit: vi.fn(), press: vi.fn(), reset: vi.fn(), remove: vi.fn() };

  function names(state: Partial<BoardSwitchMenuState>): string[] {
    return buildBoardSwitchMenu({ canEdit: true, hasSwitch: false, isDoor: false, ...state }, callbacks, t).map(
      (entry) => entry.name
    );
  }

  it('offers a player nothing, switch or no switch, since what it does is the master to read', () => {
    expect(names({ canEdit: false })).toEqual([]);
    expect(names({ canEdit: false, hasSwitch: true })).toEqual([]);
  });

  it('offers the master to make a block into a switch', () => {
    expect(names({})).toEqual(['スイッチを設定…']);
  });

  it('offers the master to write, try and take off a switch the block has', () => {
    expect(names({ hasSwitch: true })).toEqual(['スイッチを設定…', 'スイッチを試しに押す', 'スイッチを外す']);
  });

  it('offers to clear the record of presses once the switch has been pressed', () => {
    expect(names({ hasSwitch: true, pressed: true })).toEqual([
      'スイッチを設定…',
      'スイッチを試しに押す',
      '押された記録を消す',
      'スイッチを外す',
    ]);
  });

  it('offers no switch on a door, whose click already opens it, but still reaches one it has', () => {
    expect(names({ isDoor: true })).toEqual([]);
    expect(names({ isDoor: true, hasSwitch: true })).toHaveLength(3);
  });

  it('does what each entry says', () => {
    const [edit, press, remove] = buildBoardSwitchMenu({ canEdit: true, hasSwitch: true, isDoor: false }, callbacks, t);

    edit.action?.();
    press.action?.();
    remove.action?.();

    expect(callbacks.edit).toHaveBeenCalledTimes(1);
    expect(callbacks.press).toHaveBeenCalledTimes(1);
    expect(callbacks.remove).toHaveBeenCalledTimes(1);
  });
});

describe('buildPressedGroundMenu', () => {
  it('lists pressed ground for the master to set again, and nothing for anybody else', () => {
    const reset = vi.fn();
    const pressed = [{ label: 'レバー（片付けた塗り）', reset }];

    expect(buildPressedGroundMenu(false, pressed, t)).toEqual([]);
    expect(buildPressedGroundMenu(true, [], t)).toEqual([]);

    const [menu] = buildPressedGroundMenu(true, pressed, t);
    expect(menu.name).toBe('押された記録を消す');
    expect(menu.subActions?.map((entry) => entry.name)).toEqual(['レバー（片付けた塗り）']);
    menu.subActions?.[0].action?.();
    expect(reset).toHaveBeenCalled();
  });
});
