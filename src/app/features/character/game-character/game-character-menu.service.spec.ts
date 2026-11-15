import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { resetCarriedOut$, type ResetCarriedOutEvent } from '@axe/core/event/domain-events';
import { GameCharacter } from '@axe/domain/character/game-character';
import { saidNameOf } from '@axe/domain/character/hidden-name';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DataElement } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TabletopDisplaySettings } from '@axe/domain/tabletop/tabletop-display';
import {
  GameCharacterMenuHost,
  GameCharacterMenuService,
  screenCentreOf,
} from '@axe/features/character/game-character/game-character-menu.service';
import type { PieceResetChoice } from '@axe/features/character/game-character/piece-reset-context-menu';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

describe('screenCentreOf', () => {
  it('is the middle of the box, or the fallback where there is no box', () => {
    expect(screenCentreOf(new DOMRect(100, 50, 40, 20), { x: 1, y: 2 })).toEqual({ x: 120, y: 60 });
    expect(screenCentreOf(undefined, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });
});

describe('GameCharacterMenuService', () => {
  let service: GameCharacterMenuService;
  let menus: ContextMenuService;
  let character: GameCharacter;
  let open: MockInstance<ContextMenuService['open']>;
  let openRadial: MockInstance<ContextMenuService['openRadial']>;
  const at = { x: 300, y: 200, z: 0 };

  function host(drawn = true): GameCharacterMenuHost {
    const bounds = drawn ? new DOMRect(100, 50, 40, 20) : undefined;
    return {
      buffViewMode: () => 'icon',
      setBuffViewMode: vi.fn(),
      bounds: () => bounds,
      clearanceRadius: () => 33,
    } as GameCharacterMenuHost;
  }

  /** Has the table seen flat or not, with the menu style given. */
  function seeTable(flat: boolean, style: TabletopDisplaySettings['tabletopMenuStyle']): void {
    const tabletop = TestBed.inject(TabletopService);
    const display = { ...tabletop.display(), tabletopMenuStyle: style };
    Object.defineProperty(tabletop, 'mode2d', { value: signal(flat), configurable: true });
    Object.defineProperty(tabletop, 'display', { value: signal(display), configurable: true });
  }

  const named = (actions: readonly ContextMenuAction[]) => actions.map((action) => action.name);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(GameCharacterMenuService);
    menus = TestBed.inject(ContextMenuService);
    open = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
    openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
    character = GameCharacter.create('勇者', 1, '');
  });

  afterEach(() => {
    character.destroy();
    vi.restoreAllMocks();
  });

  it('opens the whole menu under the name of the piece, as a list where the table is not flat', () => {
    seeTable(false, 'radial');

    service.open(character, host(), at);

    expect(openRadial).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
    const [position, actions, title] = open.mock.calls[0];
    expect(position).toBe(at);
    expect(title).toBe('勇者');
    expect(actions.length).toBeGreaterThan(5);
  });

  it('casts an effect chosen from the menu from the piece, through the choosing of targets', () => {
    const preset = { identifier: 'preset', name: '爆炎' };
    vi.spyOn(TestBed.inject(EffectLibraryService), 'findByName').mockReturnValue(preset as never);
    const castFrom = vi.spyOn(TestBed.inject(EffectTargetingService), 'castFrom').mockReturnValue('held');

    (service as unknown as { invokeEffect(char: GameCharacter, name: string): void }).invokeEffect(character, '爆炎');

    expect(castFrom).toHaveBeenCalledWith(preset, character);
  });

  it('opens a list on a flat table too, where the standard menu is chosen', () => {
    seeTable(true, 'standard');

    service.open(character, host(), at);

    expect(open).toHaveBeenCalledTimes(1);
    expect(openRadial).not.toHaveBeenCalled();
  });

  it('opens a radial menu round the piece on a flat table, clear of what is drawn round it', () => {
    seeTable(true, 'radial');

    service.open(character, host(), at);

    expect(open).not.toHaveBeenCalled();
    const args = openRadial.mock.calls[0];
    expect(args[0]).toEqual({ x: 120, y: 60 });
    expect(args[3]).toBe('勇者');
    expect(args[4]).toBe(true);
    expect(args[7]).toBe(33);
    expect(args[8]).toBe(20);
    expect(args).toHaveLength(9);
  });

  it('opens the radial menu at the pointer for a piece that is not drawn, with no clearance', () => {
    seeTable(true, 'radial');

    service.open(character, host(false), at);

    const args = openRadial.mock.calls[0];
    expect(args[0]).toEqual({ x: 300, y: 200 });
    expect(args[7]).toBe(0);
    expect(args[8]).toBe(0);
  });

  it('opens the radial menu where a right-drag let go, with its line drawn from where the drag began', () => {
    seeTable(true, 'radial');

    service.open(character, host(), at, { x: 500, y: 400 }, { x: 120, y: 60 });

    const args = openRadial.mock.calls[0];
    expect(args[0]).toEqual({ x: 500, y: 400 });
    expect(args[9]).toEqual({ x: 120, y: 60 });
  });

  describe('resetting the piece from its menu (acceptance 21)', () => {
    const originalCursor = PeerCursor.myCursor;
    let hit: DataElement;
    let tab: ChatTab;
    let systemTabIndex: number;
    let told: ResetCarriedOutEvent[];
    let stop: () => void;

    function beSeat(role: PeerRole): void {
      PeerCursor.myCursor = { role, userId: 'me', identifier: 'seat' } as PeerCursor;
    }

    /** The names of the entries gathered with the buffs in the piece's menu as it opens now. */
    function buffGroup(): string[] {
      open.mockClear();
      seeTable(false, 'standard');
      service.open(character, host(), at);
      const group = open.mock.calls[0][1].find((action) => action.name === 'バフ・演出');
      return named(group?.subActions ?? []);
    }

    const RESETS = ['バフをすべて外す', 'バフだけ外す', 'デバフだけ外す', '値を既定値に戻す', 'すべてリセット'];
    const resetsIn = (group: string[]) => group.filter((name) => RESETS.includes(name));
    const buffsOf = () => character.buffs.list().map((data) => data.name);

    beforeEach(() => {
      beSeat(PeerRole.Player);
      character.addExtendData();
      hit = DataElement.create('命中', 9, { fieldType: 'number', 'cs-default': '3' });
      character.detailDataElement!.children[0].appendChild(hit);
      character.buffs.addRound('盾', '防御+1', 3);
      character.buffs.addRound('呪い', '命中-1', 3, { kind: 'debuff' });
      systemTabIndex = ChatTabList.instance.systemMessageTabIndex;
      tab = ChatTabList.instance.addChatTab('リセットの確認');
      ChatTabList.instance.systemMessageTabIndex = ChatTabList.instance.chatTabs.indexOf(tab);
      told = [];
      stop = resetCarriedOut$.subscribe((event) => told.push(event));
    });

    afterEach(() => {
      stop();
      PeerCursor.myCursor = originalCursor;
      ChatTabList.instance.systemMessageTabIndex = systemTabIndex;
      tab.destroy();
    });

    it('offers a player and the game master the five resets, with the buffs', () => {
      expect(resetsIn(buffGroup())).toEqual(RESETS);
      beSeat(PeerRole.GameMaster);
      expect(resetsIn(buffGroup())).toEqual(RESETS);
    });

    it('offers only the resets that would do something to the piece or its parts', () => {
      character.buffs.delete('呪い');
      expect(resetsIn(buffGroup())).toEqual(['バフをすべて外す', 'バフだけ外す', '値を既定値に戻す', 'すべてリセット']);

      character.buffs.delete('盾');
      hit.value = 3;
      expect(resetsIn(buffGroup())).toEqual([]);

      const part = GameCharacter.create('勇者の盾', 1, '');
      part.addExtendData();
      part.ridingOn = character.identifier;
      part.rideSeat = 'part';
      part.buffs.addRound('硬化', '', 3);
      try {
        expect(resetsIn(buffGroup())).toEqual(['バフをすべて外す', 'バフだけ外す', 'すべてリセット']);
      } finally {
        part.destroy();
      }
    });

    it('offers a seat that only watches none of them', () => {
      beSeat(PeerRole.Guest);

      expect(resetsIn(buffGroup())).toEqual([]);
    });

    it('asks first, saying what it reaches, and does nothing where the reader thinks better of it', async () => {
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      await service.resetPiece(character, 'everything');

      expect(ask).toHaveBeenCalledExactlyOnceWith(
        TestBed.inject(TRANSLATE_FN)('feature.character.contextMenu.resetConfirm_everything', {
          name: '勇者',
          buffs: 2,
          items: 1,
        })
      );
      expect([hit.value, buffsOf()]).toEqual([9, ['盾', '呪い']]);
      expect(tab.chatMessages).toHaveLength(0);
    });

    it('resets the piece once confirmed, reports it with counts alone, and keeps the way back under that line', async () => {
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      await service.resetPiece(character, 'everything');

      expect([hit.value, buffsOf()]).toEqual([3, []]);
      const line = tab.chatMessages.at(-1)!;
      expect(line.text).toBe(
        encodeI18nMessage('feature.character.contextMenu.resetDone_everything', { name: '勇者', buffs: 2, items: 1 })
      );
      expect(told.map((event) => event.messageIdentifier)).toEqual([line.identifier]);
    });

    it.each<[PieceResetChoice, string[], number]>([
      ['allBuffs', [], 9],
      ['buffs', ['呪い'], 9],
      ['debuffs', ['盾'], 9],
      ['values', ['盾', '呪い'], 3],
    ])('does what %s says and no more', async (choice, left, value) => {
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      await service.resetPiece(character, choice);

      expect([buffsOf(), hit.value]).toEqual([left, value]);
    });

    it('names a piece whose name is hidden as everyone is told it, in the line all can read', async () => {
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
      character.hideName = true;

      await service.resetPiece(character, 'allBuffs');

      expect(tab.chatMessages.at(-1)!.text).toBe(
        encodeI18nMessage('feature.character.contextMenu.resetDone_allBuffs', {
          name: saidNameOf(character),
          buffs: 2,
          items: 0,
        })
      );
      expect(saidNameOf(character)).not.toBe('勇者');
    });

    it('resets nothing for a seat that only watches, and asks nothing', async () => {
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
      beSeat(PeerRole.Guest);

      await service.resetPiece(character, 'everything');

      expect(ask).not.toHaveBeenCalled();
      expect([hit.value, buffsOf()]).toEqual([9, ['盾', '呪い']]);
    });

    it('asks nothing where the reset would by now do nothing', async () => {
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
      character.buffs.delete('呪い');

      await service.resetPiece(character, 'debuffs');

      expect(ask).not.toHaveBeenCalled();
      expect(tab.chatMessages).toHaveLength(0);
    });
  });

  it('opens only what aims at a piece the reader may not view', () => {
    seeTable(false, 'standard');
    service.open(character, host(), at);
    const whole = named(open.mock.calls[0][1]);
    open.mockClear();
    vi.spyOn(TestBed.inject(DisclosureService), 'canView').mockReturnValue(false);

    service.open(character, host(), at);

    const aimed = named(open.mock.calls[0][1]);
    expect(aimed.length).toBeGreaterThan(0);
    expect(aimed.length).toBeLessThan(whole.length);
    expect(aimed.every((name) => whole.includes(name))).toBe(true);
  });

  it('names the menu by what the reader may be told of the piece', () => {
    seeTable(false, 'standard');
    vi.spyOn(TestBed.inject(PieceNameService), 'shown').mockReturnValue('？？？');

    service.open(character, host(), at);

    expect(open.mock.calls[0][2]).toBe('？？？');
  });

  it('leaves the menu to the selection where several pieces are picked', () => {
    const forSelection = vi.spyOn(TestBed.inject(PieceContextMenuService), 'openForSelection').mockReturnValue(true);

    service.open(character, host(), at);

    expect(forSelection).toHaveBeenCalledWith(character, expect.any(Number), at);
    expect(open).not.toHaveBeenCalled();
    expect(openRadial).not.toHaveBeenCalled();
  });

  it('opens the sheet of the piece from its menu', () => {
    seeTable(false, 'standard');
    const openSheet = vi.spyOn(TestBed.inject(ObjectPanelService), 'openSheet').mockImplementation(() => undefined);
    const showDetail = TestBed.inject(TRANSLATE_FN)('feature.character.contextMenu.showDetail');

    service.open(character, host(), at);
    open.mock.calls[0][1].find((action) => action.name === showDetail)?.action?.();

    expect(openSheet).toHaveBeenCalledWith(character, expect.stringContaining('勇者'), { width: 800, height: 600 });
  });
});
