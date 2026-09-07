import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ContextMenuType } from '@axe/application/ui/context-menu.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  buildGameCharacterContextMenu,
  buildGameCharacterContextMenuModel,
} from '@axe/features/character/game-character/game-character-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

interface MutableChar {
  altitude: number;
  isAltitudeIndicate: boolean;
  isDropShadow: boolean;
  hideInventory: boolean;
  noTurn: boolean;
  nonTalkFlag: boolean;
  hideName: boolean;
  hideBuff: boolean;
  isNpc: boolean;
  isLock: boolean;
  targeted: boolean;
  setLocation: ReturnType<typeof vi.fn>;
  clone: ReturnType<typeof vi.fn>;
}

function makeService(): GameObjectInventoryService {
  return { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService;
}

function makeChar(overrides: Partial<MutableChar> = {}): MutableChar {
  return {
    altitude: 0,
    isAltitudeIndicate: false,
    isDropShadow: false,
    hideInventory: false,
    noTurn: false,
    nonTalkFlag: false,
    hideName: false,
    hideBuff: false,
    isNpc: false,
    isLock: false,
    targeted: false,
    setLocation: vi.fn(),
    clone: vi.fn(() => ({ location: { x: 0, y: 0 }, update: vi.fn() })),
    ...overrides,
  };
}

const names = (a: { name: string }[]) => a.map((x) => x.name);
const callbacks = () => ({
  onShowDetail: vi.fn(),
  onShowChatPalette: vi.fn(),
  onShowRemoteController: vi.fn(),
  onShowBuffEdit: vi.fn(),
  onShowLightSettings: vi.fn(),
});

describe('buildGameCharacterContextMenu()', () => {
  beforeEach(() => {
    PeerCursor.myCursor = null!;
  });

  it('offers to work a move out where the piece has ground to walk', () => {
    const onPlanMove = vi.fn();
    const menu = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      { ...callbacks(), onPlanMove },
      t
    );

    const planning = menu.find((action) => action.name === '移動');
    expect(planning).toBeDefined();
    planning!.action!();
    expect(onPlanMove).toHaveBeenCalled();
  });

  it('puts working a move out above everything else the piece is asked', () => {
    const menu = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      { ...callbacks(), onPlanMove: vi.fn() },
      t
    );

    const named = menu.filter((action) => action.name).map((action) => action.name);

    expect(named[0]).toBe('移動');
    expect(named.indexOf('移動')).toBeLessThan(named.indexOf('詳細を表示'));
  });

  it('offers nothing of the sort to a piece with no reach', () => {
    const menu = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );

    expect(menu.map((action) => action.name)).not.toContain('移動');
  });

  describe('aiming without a keyboard', () => {
    it('offers to aim at the piece, ticked by whether it already is', () => {
      const onToggleTarget = vi.fn();
      const aimed = buildGameCharacterContextMenu(
        makeChar({ targeted: true }) as unknown as GameCharacter,
        50,
        makeService(),
        { ...callbacks(), onToggleTarget },
        t
      );
      expect(names(aimed)).toContain('✔ ターゲット');

      const plain = buildGameCharacterContextMenu(
        makeChar() as unknown as GameCharacter,
        50,
        makeService(),
        { ...callbacks(), onToggleTarget },
        t
      );
      expect(names(plain)).toContain('ターゲット');
      plain.find((action) => action.name === 'ターゲット')!.action!();
      expect(onToggleTarget).toHaveBeenCalled();
    });

    it('offers to stop aiming at everything only while something is aimed at', () => {
      const onClearTargets = vi.fn();
      const withAim = buildGameCharacterContextMenu(
        makeChar() as unknown as GameCharacter,
        50,
        makeService(),
        { ...callbacks(), onClearTargets },
        t
      );
      expect(names(withAim)).toContain('ターゲットを全部外す');

      const without = buildGameCharacterContextMenu(
        makeChar() as unknown as GameCharacter,
        50,
        makeService(),
        callbacks(),
        t
      );
      expect(names(without)).not.toContain('ターゲットを全部外す');
    });
  });

  it('leads with the sheet, which opens the group at the top', () => {
    const char = makeChar();
    const menu = buildGameCharacterContextMenu(char as unknown as GameCharacter, 50, makeService(), callbacks(), t);
    expect(menu[0].name).toBe('詳細を表示');
  });

  it('groups the existing actions for the radial menu without dropping surface actions', () => {
    const surfaceAction = { name: 'Move to reverse side', action: vi.fn() };
    const overlapAction = { name: 'Overlapping piece', action: vi.fn() };
    const model = buildGameCharacterContextMenuModel(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t,
      [overlapAction],
      'icon',
      [surfaceAction]
    );

    expect(model.radialGroups.map((group) => group.name)).toEqual([
      '基本情報',
      'チャット',
      'バフ・演出',
      '表示',
      '移動',
      '公開・所有',
      'コマ操作',
    ]);
    expect(model.radialGroups.find((group) => group.name === '移動')!.actions).toContain(surfaceAction);
    expect(model.radialGroups.find((group) => group.name === 'コマ操作')!.actions).toContain(overlapAction);
    expect(model.actions).toContain(surfaceAction);
  });

  it('puts the altitude submenu into the display group', () => {
    const char = makeChar();
    const menu = buildGameCharacterContextMenu(char as unknown as GameCharacter, 50, makeService(), callbacks(), t);
    const altitude = menu.find((m) => m.name === '高度設定');
    expect(altitude).toBeDefined();
    expect(altitude!.subActions?.length).toBe(3);
  });

  it('opens the sheet, the palette, the remote and the buffs', () => {
    const cb = callbacks();
    const menu = buildGameCharacterContextMenu(makeChar() as unknown as GameCharacter, 50, makeService(), cb, t);
    menu.find((m) => m.name === '詳細を表示')!.action!();
    menu.find((m) => m.name === 'チャットパレットを表示')!.action!();
    menu.find((m) => m.name === 'リモコンを表示')!.action!();
    menu.find((m) => m.name === 'バフ編集')!.action!();
    expect(cb.onShowDetail).toHaveBeenCalled();
    expect(cb.onShowChatPalette).toHaveBeenCalled();
    expect(cb.onShowRemoteController).toHaveBeenCalled();
    expect(cb.onShowBuffEdit).toHaveBeenCalled();
  });

  it('ticks the item by whether it is hidden from the list', () => {
    const visibleMenu = buildGameCharacterContextMenu(
      makeChar({ hideInventory: false }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(visibleMenu)).toContain('☐ インベントリ非表示');

    const hiddenMenu = buildGameCharacterContextMenu(
      makeChar({ hideInventory: true }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(hiddenMenu)).toContain('☑ インベントリ非表示');
  });

  it('ticks the item by whether it takes a turn', () => {
    const acting = buildGameCharacterContextMenu(
      makeChar({ noTurn: false }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(acting)).toContain('☐ 手番をもたない');

    const watching = buildGameCharacterContextMenu(
      makeChar({ noTurn: true }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(watching)).toContain('☑ 手番をもたない');
  });

  it('ticks the item by whether it may speak', () => {
    const talking = buildGameCharacterContextMenu(
      makeChar({ nonTalkFlag: false }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(talking)).toContain('☐ 発言しない');

    const silent = buildGameCharacterContextMenu(
      makeChar({ nonTalkFlag: true }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(silent)).toContain('☑ 発言しない');
  });

  it('ticks hiding the name and the buffs in the display submenu', () => {
    const def = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    const display = def.find((m) => m.name === '表示');
    expect(names(display!.subActions!)).toEqual(['☐ 名前を隠す', '☐ バフを隠す']);

    const hidden = buildGameCharacterContextMenu(
      makeChar({ hideName: true, hideBuff: true }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    const display2 = hidden.find((m) => m.name === '表示');
    expect(names(display2!.subActions!)).toEqual(['☑ 名前を隠す', '☑ バフを隠す']);
  });

  it('offers the game master alone a toggle for whether it is a non-player character', () => {
    const nonGmMenu = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    const nonGmDisplay = nonGmMenu.find((m) => m.name === '表示')!;
    expect(names(nonGmDisplay.subActions!)).not.toContain('☐ NPC にする');

    PeerCursor.myCursor = { isGameMaster: true, userId: 'gm-1', name: 'GM' } as unknown as PeerCursor;
    const char = makeChar();
    const menu = buildGameCharacterContextMenu(char as unknown as GameCharacter, 50, makeService(), callbacks(), t);
    const display = menu.find((m) => m.name === '表示')!;
    expect(names(display.subActions!)).toContain('☐ NPC にする');
    display.subActions!.find((s) => s.name === '☐ NPC にする')!.action!();
    expect(char.isNpc).toBe(true);
  });

  it('hides and shows the name and the buffs', () => {
    const char = makeChar();
    const menu = buildGameCharacterContextMenu(char as unknown as GameCharacter, 50, makeService(), callbacks(), t);
    const display = menu.find((m) => m.name === '表示')!;
    display.subActions!.find((s) => s.name === '☐ 名前を隠す')!.action!();
    display.subActions!.find((s) => s.name === '☐ バフを隠す')!.action!();
    expect(char.hideName).toBe(true);
    expect(char.hideBuff).toBe(true);
  });

  it('always offers the shared table, your own hands and the graveyard, and moves it to each', () => {
    const char = makeChar();
    const menu = buildGameCharacterContextMenu(char as unknown as GameCharacter, 50, makeService(), callbacks(), t);
    menu.find((m) => m.name === '共有イベントリに移動')!.action!();
    expect(char.setLocation).toHaveBeenLastCalledWith('common');
    menu.find((m) => m.name === '墓場に移動')!.action!();
    expect(char.setLocation).toHaveBeenLastCalledWith('graveyard');
  });

  it('offers to unlock what is locked and to lock what is not', () => {
    const locked = buildGameCharacterContextMenu(
      makeChar({ isLock: true }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(locked)).toContain('固定解除');

    const unlocked = buildGameCharacterContextMenu(
      makeChar({ isLock: false }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(unlocked)).toContain('固定する');
  });

  it('draws exactly three separators without permission', () => {
    const menu = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(menu.filter((m) => m.type === ContextMenuType.SEPARATOR)).toHaveLength(3);
  });
});
