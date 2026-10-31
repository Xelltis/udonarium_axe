import { TestBed } from '@angular/core/testing';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ContextMenuType } from '@axe/application/ui/context-menu.service';
import { ObjectNode } from '@axe/core/sync/object-node';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
} from '@axe/domain/data/data-element';
import { saveElementTemplate } from '@axe/domain/data/data-element-templates';
import { encodeRangeShapeField } from '@axe/domain/data/range-shape-field';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  buildGameCharacterContextMenu,
  buildGameCharacterContextMenuModel,
  collectRegisteredEffects,
  collectRegisteredRangeShapes,
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
/** The entries of one of the menu's named groups. */
const groupOf = (menu: { name: string; subActions?: { name: string }[] }[], name: string) =>
  menu.find((m) => m.name === name)!.subActions! as ReturnType<typeof buildGameCharacterContextMenu>;
const callbacks = () => ({
  onShowDetail: vi.fn(),
  onShowMemo: vi.fn(),
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

  describe('the first-person view', () => {
    type Entry = { name?: unknown; action?: () => void; subActions?: readonly unknown[] };
    function entriesIn(actions: readonly unknown[]): Entry[] {
      return actions.flatMap((entry) => [entry as Entry, ...entriesIn((entry as Entry).subActions ?? [])]);
    }
    function namesIn(actions: readonly unknown[]): unknown[] {
      return entriesIn(actions).map((entry) => entry.name);
    }
    function menuWith(extra: object): readonly unknown[] {
      return buildGameCharacterContextMenu(
        makeChar() as unknown as GameCharacter,
        50,
        makeService(),
        { ...callbacks(), ...extra },
        t
      );
    }

    it('is offered only where the piece can be looked out of, and opens it', () => {
      const onViewFirstPerson = vi.fn();

      expect(namesIn(menuWith({}))).not.toContain('このコマの視点で見る');
      entriesIn(menuWith({ onViewFirstPerson })).find((entry) => entry.name === 'このコマの視点で見る')!.action!();

      expect(onViewFirstPerson).toHaveBeenCalled();
    });

    it('lets the game master put everyone in it, and let them go again, only where they are handed in', () => {
      const names = namesIn(menuWith({ onShareFirstPerson: vi.fn(), onStopSharingFirstPerson: vi.fn() }));

      expect(names).toContain('全員をこのコマの視点にする');
      expect(names).toContain('全員の共有視点を解除する');
      expect(namesIn(menuWith({}))).not.toContain('全員をこのコマの視点にする');
      expect(namesIn(menuWith({}))).not.toContain('全員の共有視点を解除する');
    });
  });

  describe('the battle stage', () => {
    type Entry = { name?: unknown; action?: () => void; subActions?: readonly unknown[] };
    function battleEntries(char: MutableChar, extra: object): Entry[] {
      const menu = buildGameCharacterContextMenu(
        char as unknown as GameCharacter,
        50,
        makeService(),
        { ...callbacks(), ...extra },
        t
      );
      const buff = groupOf(menu, 'バフ・演出') as unknown as Entry[];
      return (buff.find((entry) => entry.name === '戦闘カットイン')?.subActions ?? []) as Entry[];
    }

    it('plays the stage with the piece striking and opens the panel on it', () => {
      const onPlayBattle = vi.fn();
      const onShowBattle = vi.fn();
      const entries = battleEntries(makeChar(), { onPlayBattle, onShowBattle });

      entries.find((entry) => entry.name === 'このコマで攻撃')!.action!();
      entries.find((entry) => entry.name === '攻撃演出を選ぶ…')!.action!();

      expect(onPlayBattle).toHaveBeenCalled();
      expect(onShowBattle).toHaveBeenCalled();
    });

    it('lets only the master put the piece on a side, marking the side it stands on as it is told', () => {
      const onSetBattleSide = vi.fn();
      const asMaster = battleEntries(makeChar(), { onShowBattle: vi.fn(), onSetBattleSide, battleSide: 'right' });

      expect(asMaster.map((entry) => entry.name)).toEqual([
        '攻撃演出を選ぶ…',
        '左の組に入れる',
        '✔ 右の組に入れる',
        '組に入れない',
      ]);
      asMaster.find((entry) => entry.name === '組に入れない')!.action!();
      expect(onSetBattleSide).toHaveBeenCalledWith(null);

      const asPlayer = battleEntries(makeChar(), { onShowBattle: vi.fn() });
      expect(asPlayer.map((entry) => entry.name)).toEqual(['攻撃演出を選ぶ…']);
    });

    it('is left out where nothing about the stage is handed in', () => {
      expect(battleEntries(makeChar(), {})).toEqual([]);
    });
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
      '交戦エリア',
      '移動',
      '公開・所有',
      'コマ操作',
    ]);
    expect(model.radialGroups.find((group) => group.name === '移動')!.actions).toContain(surfaceAction);
    expect(model.radialGroups.find((group) => group.name === 'コマ操作')!.actions).toContain(overlapAction);
    expect(model.actions).toContain(surfaceAction);
  });

  it('sets what fights and mounts bring among the rest by what it goes with', () => {
    const off = { name: '馬 から降りる', action: vi.fn() };
    const zone = { name: '交戦エリア', action: undefined, subActions: [] };
    const state = { name: '駒の状態', action: undefined, subActions: [] };
    const mount = { name: '乗り物', action: undefined, subActions: [] };
    const manage = { name: '交戦エリアの管理', action: undefined, subActions: [] };
    const surface = { name: 'Move to reverse side', action: vi.fn() };
    const model = buildGameCharacterContextMenuModel(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      { ...callbacks(), onPlanMove: vi.fn() },
      t,
      [],
      'icon',
      [surface],
      { onAndOff: [off], fight: [zone], handling: [state, mount], manage: [manage] }
    );
    const sections: string[][] = [[]];
    for (const entry of model.actions) {
      if (entry.type === ContextMenuType.SEPARATOR) sections.push([]);
      else sections[sections.length - 1].push(entry.name);
    }

    expect(sections).toEqual([
      ['移動', '移動の仕方', '馬 から降りる'],
      ['詳細を表示', 'メモ', 'チャットパレットを表示', 'リモコンを表示', 'バフ・演出', '視界と視点', '交戦エリア'],
      ['表示と扱い', '駒の状態', '乗り物'],
      ['しまう'],
      ['固定する', 'コピーを作る'],
      ['Move to reverse side', '交戦エリアの管理'],
    ]);
    const radial = (name: string) => model.radialGroups.find((group) => group.name === name)!.actions;
    expect(radial('移動')).toContain(off);
    expect(radial('交戦エリア')).toEqual([zone, manage]);
    expect(radial('表示')).toEqual(expect.arrayContaining([state, mount]));
  });

  it('keeps what is opened most a click away, and gathers the rest in named groups', () => {
    const menu = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );

    expect(names(menu.filter((m) => m.type !== ContextMenuType.SEPARATOR))).toEqual([
      '詳細を表示',
      'メモ',
      'チャットパレットを表示',
      'リモコンを表示',
      'バフ・演出',
      '視界と視点',
      '表示と扱い',
      'しまう',
      '固定する',
      'コピーを作る',
    ]);
    expect(names(groupOf(menu, '視界と視点'))).toEqual(['視界・光源設定…', '視界範囲を表示']);
  });

  it('offers a group of who may see it and who owns it only to somebody who may change them', () => {
    const plain = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(plain)).not.toContain('公開とオーナー');

    PeerCursor.myCursor = { isGameMaster: true, userId: 'gm-1', name: 'GM' } as unknown as PeerCursor;
    const master = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(master)).toContain('公開とオーナー');
    expect(groupOf(master, '公開とオーナー')[0].type).not.toBe(ContextMenuType.SEPARATOR);
  });

  it('puts the altitude submenu into the display and handling group', () => {
    const char = makeChar();
    const menu = buildGameCharacterContextMenu(char as unknown as GameCharacter, 50, makeService(), callbacks(), t);
    const altitude = groupOf(menu, '表示と扱い').find((m) => m.name === '高度設定');
    expect(altitude).toBeDefined();
    expect(altitude!.subActions?.length).toBe(3);
  });

  it('switches every resource slider of the piece at once from the display and handling group', () => {
    const onSetResourceSliders = vi.fn();
    const menu = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      { ...callbacks(), onSetResourceSliders },
      t
    );
    const sliders = groupOf(menu, '表示と扱い').find((m) => m.name === 'リソースのスライダー')!;
    expect(names(sliders.subActions!)).toEqual(['すべて出す', 'すべて隠す']);

    sliders.subActions![0].action!();
    sliders.subActions![1].action!();

    expect(onSetResourceSliders.mock.calls).toEqual([[true], [false]]);
  });

  it('offers no slider switch where it is left out', () => {
    const menu = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );

    expect(names(groupOf(menu, '表示と扱い'))).not.toContain('リソースのスライダー');
  });

  it('opens the sheet, the memo, the palette, the remote and the buffs', () => {
    const cb = callbacks();
    const menu = buildGameCharacterContextMenu(makeChar() as unknown as GameCharacter, 50, makeService(), cb, t);
    menu.find((m) => m.name === '詳細を表示')!.action!();
    menu.find((m) => m.name === 'メモ')!.action!();
    menu.find((m) => m.name === 'チャットパレットを表示')!.action!();
    menu.find((m) => m.name === 'リモコンを表示')!.action!();
    groupOf(menu, 'バフ・演出').find((m) => m.name === 'バフ編集')!.action!();
    expect(cb.onShowDetail).toHaveBeenCalled();
    expect(cb.onShowMemo).toHaveBeenCalled();
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
    expect(names(groupOf(visibleMenu, '表示と扱い'))).toContain('☐ インベントリ非表示');

    const hiddenMenu = buildGameCharacterContextMenu(
      makeChar({ hideInventory: true }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(groupOf(hiddenMenu, '表示と扱い'))).toContain('☑ インベントリ非表示');
  });

  it('ticks the item by whether it takes a turn', () => {
    const acting = buildGameCharacterContextMenu(
      makeChar({ noTurn: false }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(groupOf(acting, '表示と扱い'))).toContain('☐ 手番をもたない');

    const watching = buildGameCharacterContextMenu(
      makeChar({ noTurn: true }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(groupOf(watching, '表示と扱い'))).toContain('☑ 手番をもたない');
  });

  it('ticks the item by whether it may speak', () => {
    const talking = buildGameCharacterContextMenu(
      makeChar({ nonTalkFlag: false }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(groupOf(talking, '表示と扱い'))).toContain('☐ 発言しない');

    const silent = buildGameCharacterContextMenu(
      makeChar({ nonTalkFlag: true }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(groupOf(silent, '表示と扱い'))).toContain('☑ 発言しない');
  });

  it('ticks hiding the name and the buffs in the display submenu', () => {
    const def = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(groupOf(def, '表示と扱い')).slice(0, 2)).toEqual(['☐ 名前を隠す', '☐ バフを隠す']);

    const hidden = buildGameCharacterContextMenu(
      makeChar({ hideName: true, hideBuff: true }) as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(groupOf(hidden, '表示と扱い')).slice(0, 2)).toEqual(['☑ 名前を隠す', '☑ バフを隠す']);
  });

  it('offers the game master alone a toggle for whether it is a non-player character', () => {
    const nonGmMenu = buildGameCharacterContextMenu(
      makeChar() as unknown as GameCharacter,
      50,
      makeService(),
      callbacks(),
      t
    );
    expect(names(groupOf(nonGmMenu, '表示と扱い'))).not.toContain('☐ NPC にする');

    PeerCursor.myCursor = { isGameMaster: true, userId: 'gm-1', name: 'GM' } as unknown as PeerCursor;
    const char = makeChar();
    const menu = buildGameCharacterContextMenu(char as unknown as GameCharacter, 50, makeService(), callbacks(), t);
    const display = groupOf(menu, '表示と扱い');
    expect(names(display)).toContain('☐ NPC にする');
    display.find((s) => s.name === '☐ NPC にする')!.action!();
    expect(char.isNpc).toBe(true);
  });

  it('hides and shows the name and the buffs', () => {
    const char = makeChar();
    const menu = buildGameCharacterContextMenu(char as unknown as GameCharacter, 50, makeService(), callbacks(), t);
    const display = groupOf(menu, '表示と扱い');
    display.find((s) => s.name === '☐ 名前を隠す')!.action!();
    display.find((s) => s.name === '☐ バフを隠す')!.action!();
    expect(char.hideName).toBe(true);
    expect(char.hideBuff).toBe(true);
  });

  it('always offers the shared table, your own hands and the graveyard, and moves it to each', () => {
    const char = makeChar();
    const menu = buildGameCharacterContextMenu(char as unknown as GameCharacter, 50, makeService(), callbacks(), t);
    groupOf(menu, 'しまう').find((m) => m.name === '共有イベントリに移動')!.action!();
    expect(char.setLocation).toHaveBeenLastCalledWith('common');
    groupOf(menu, 'しまう').find((m) => m.name === '墓場に移動')!.action!();
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

  it('draws exactly three separators without a move or anything overlapping', () => {
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

describe('what a piece can fire from its sheet', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  function field(name: string, type: string, currentValue: string): DataElement {
    return DataElement.create(name, '', {
      [DataElementAttribute.ROLE]: DataElementRole.FIELD,
      [DataElementAttribute.FIELD_TYPE]: type,
      currentValue,
    });
  }

  function buildPiece(): { piece: GameCharacter; part: DataElement } {
    const owner = new ObjectNode();
    owner.initialize();
    const root = DataElement.create('character', '');
    const detail = DataElement.create('detail', '');
    const part = DataElement.create('火球', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
    part.appendChild(field('効果', DataElementFieldType.EFFECT, '炎上'));
    part.appendChild(
      field(
        '範囲',
        DataElementFieldType.RANGE_SHAPE,
        encodeRangeShapeField({
          name: '爆風',
          cellPattern: '1',
          gridType: 'square',
          gridColor: '#FFFF00',
          rangeColor: '#000000',
          isRotatable: false,
        })
      )
    );
    owner.appendChild(root);
    root.appendChild(detail);
    detail.appendChild(part);
    return { piece: owner as unknown as GameCharacter, part };
  }

  it('offers the effects and the ranges written on the sheet', () => {
    const { piece } = buildPiece();

    expect(collectRegisteredEffects(piece)).toEqual(['炎上']);
    expect(collectRegisteredRangeShapes(piece).map((shape) => shape.label)).toEqual(['爆風']);
  });

  it('does not offer a range twice for a template kept of its part', () => {
    const { piece, part } = buildPiece();

    saveElementTemplate(piece, part);

    expect(collectRegisteredRangeShapes(piece).map((shape) => shape.label)).toEqual(['爆風']);
  });

  it('offers nothing from a template once its part has gone from the sheet', () => {
    const { piece, part } = buildPiece();

    saveElementTemplate(piece, part);
    part.destroy();

    expect(collectRegisteredEffects(piece)).toEqual([]);
    expect(collectRegisteredRangeShapes(piece)).toEqual([]);
  });
});
