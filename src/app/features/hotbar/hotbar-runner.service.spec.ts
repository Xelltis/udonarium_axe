import { TestBed } from '@angular/core/testing';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { CharacterDiceService } from '@axe/application/dice/character-dice.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { CutInService } from '@axe/application/media/cut-in.service';
import { RangeShapeInvokeService } from '@axe/application/tabletop/range-shape-invoke.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { EffectField } from '@axe/domain/effect/effect-field';
import { Hotbar } from '@axe/domain/hotbar/hotbar';
import { emptyHotbarSlotDraft, HotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { HotbarPayload, RangeSlotOptions } from '@axe/domain/hotbar/hotbar-payload';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';
import { HotbarSlotKind } from '@axe/domain/hotbar/hotbar-slot-kind';
import { hotbarSlotTag } from '@axe/domain/hotbar/hotbar-tag';
import { CutIn } from '@axe/domain/media/cut-in';
import { SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { RangeArea } from '@axe/domain/tabletop/range';
import { HotbarRunnerService } from '@axe/features/hotbar/hotbar-runner.service';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('HotbarRunnerService', () => {
  let store: ObjectStore;
  let runner: HotbarRunnerService;
  let hotbar: Hotbar;
  let character: GameCharacter;

  function slotOf(kind: HotbarSlotKind, value: string, payload?: HotbarPayload): HotbarSlot {
    const draft: HotbarSlotDraft = emptyHotbarSlotDraft(kind);
    draft.value = value;
    if (payload) draft.payload = payload;
    return hotbar.put(0, 0, draft)!;
  }

  function rangePayload(patch: Partial<RangeSlotOptions> = {}): RangeSlotOptions {
    return {
      kind: 'range',
      dock: true,
      name: '',
      length: 0,
      width: 0,
      borderColor: '',
      fillColor: '',
      opacity: 100,
      fillOutline: false,
      rotateSnap: true,
      shiftX: false,
      shiftY: false,
      ...patch,
    };
  }

  const CELL = { page: 0, slotIndex: 0 };

  function run(slot: HotbarSlot, character: GameCharacter | null, cell = CELL) {
    return runner.run(slot, character, cell);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    store = ObjectStore.instance;
    Hotbar.ownerId = 'me';
    runner = TestBed.inject(HotbarRunnerService);

    character = GameCharacter.create('術者', 1, '');
    character.addExtendData();
    hotbar = new Hotbar('Hotbar_for_tests');
    hotbar.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
  });

  describe('what needs a character', () => {
    it('does nothing at all without one', () => {
      for (const kind of ['chat', 'effect', 'range', 'diceDeploy', 'panel', 'focus'] as HotbarSlotKind[]) {
        expect(run(slotOf(kind, 'なにか'), null)).toEqual({ ok: false, reason: 'noCharacter' });
      }
    });

    it('sends a chat macro as the character', () => {
      const macro = TestBed.inject(CharacterMacroService);
      const send = vi.spyOn(macro, 'sendAsCharacter').mockResolvedValue(null);
      vi.spyOn(macro, 'currentTab').mockReturnValue({} as never);

      expect(run(slotOf('chat', '2d6+3 攻撃'), character)).toEqual({ ok: true });
      expect(send.mock.calls[0][0]).toBe(character);
      expect(send.mock.calls[0][1]).toBe('2d6+3 攻撃');
    });

    it('says so rather than speaking into nowhere', () => {
      vi.spyOn(TestBed.inject(CharacterMacroService), 'currentTab').mockReturnValue(null);

      expect(run(slotOf('chat', '2d6'), character)).toEqual({ ok: false, reason: 'noTab' });
    });

    it('calls for an effect by the name it was given', () => {
      const library = TestBed.inject(EffectLibraryService);
      const cast = TestBed.inject(EffectCastService);
      const preset = { identifier: 'preset', name: '爆炎' };
      vi.spyOn(library, 'findByName').mockReturnValue(preset as never);
      const fire = vi.spyOn(cast, 'fireFromCharacter').mockReturnValue({} as never);

      expect(run(slotOf('effect', '爆炎'), character)).toEqual({ ok: true });
      expect(fire).toHaveBeenCalledWith(preset, character);
    });

    it('says so when the effect it points at is gone', () => {
      vi.spyOn(TestBed.inject(EffectLibraryService), 'findByName').mockReturnValue(null);

      expect(run(slotOf('effect', '消えた効果'), character)).toEqual({ ok: false, reason: 'notFound' });
    });

    it('lays a range out on the character and docks it there', () => {
      const range = RangeArea.create('射程範囲', 1, 4, 100);
      const following = vi.spyOn(range, 'following');
      const create = vi.spyOn(TestBed.inject(TabletopActionService), 'createRangeArea').mockReturnValue(range);

      expect(run(slotOf('range', 'LINE'), character)).toEqual({ ok: true });
      expect(create.mock.calls[0][1]).toBe('LINE');
      expect(range.followingCharacterIdentifier).toBe(character.identifier);
      expect(following).toHaveBeenCalled();
    });

    it('paints the range the way the slot asks for', () => {
      const range = RangeArea.create('射程範囲', 1, 4, 100);
      vi.spyOn(TestBed.inject(TabletopActionService), 'createRangeArea').mockReturnValue(range);
      const slot = slotOf(
        'range',
        'LINE',
        rangePayload({
          borderColor: '#112233',
          fillColor: '#445566',
          opacity: 40,
          fillOutline: true,
          rotateSnap: false,
          shiftX: true,
        })
      );

      expect(run(slot, character)).toEqual({ ok: true });

      expect(range.rangeColor).toBe('#112233');
      expect(range.gridColor).toBe('#445566');
      expect(range.opacity).toBeCloseTo(0.4);
      expect(range.fillOutLine).toBe(true);
      expect(range.subDivisionSnapPolygonal).toBe(false);
      expect(range.offSetX).toBe(true);
      expect(range.offSetY).toBe(false);
    });

    it('lays a range shape of its own out when the slot carries one', () => {
      const spawn = vi
        .spyOn(TestBed.inject(RangeShapeInvokeService), 'spawnForCharacter')
        .mockReturnValue(RangeArea.createCustom('扇', '1', 'square', 100));
      const shape =
        '{"name":"扇","cellPattern":"1","gridType":"square","gridColor":"#fff","rangeColor":"#000","isRotatable":true}';

      expect(run(slotOf('range', shape), character)).toEqual({ ok: true });
      expect(spawn).toHaveBeenCalled();
    });

    it('takes the range back down when the same slot is pressed again', () => {
      const range = RangeArea.createCustom('扇', '1', 'square', 100);
      vi.spyOn(TestBed.inject(TabletopActionService), 'createRangeArea').mockReturnValue(range);
      const slot = slotOf('range', 'LINE');

      expect(run(slot, character)).toEqual({ ok: true });
      expect(store.get(range.identifier)).toBe(range);

      expect(run(slot, character)).toEqual({ ok: true });
      expect(store.get(range.identifier)).toBeNull();
    });

    it('lays the range out under the name and the size the slot asks for', () => {
      const range = RangeArea.createCustom('扇', '1', 'square', 100);
      vi.spyOn(TestBed.inject(TabletopActionService), 'createRangeArea').mockReturnValue(range);
      const slot = slotOf('range', 'LINE', rangePayload({ dock: false, name: '火線', length: 6, width: 2 }));

      expect(run(slot, character)).toEqual({ ok: true });

      expect(range.name).toBe('火線');
      expect(range.length).toBe(6);
      expect(range.width).toBe(2);
      expect(range.followingCharacterIdentifier).toBe('');
    });

    it('leaves the range at the size its shape comes with when the slot asks for none', () => {
      const range = RangeArea.create('射程範囲', 1, 4, 100);
      vi.spyOn(TestBed.inject(TabletopActionService), 'createRangeArea').mockReturnValue(range);

      expect(run(slotOf('range', 'LINE'), character)).toEqual({ ok: true });

      expect(range.name).toBe('射程範囲');
      expect(range.length).toBe(4);
      expect(range.width).toBe(1);
    });

    it('takes down a range it laid before, whoever is holding the note now', () => {
      const range = RangeArea.create('射程範囲', 1, 4, 100);
      range.laidByHotbarSlot = hotbarSlotTag(Hotbar.ownerId, CELL, character.identifier);
      const create = vi.spyOn(TestBed.inject(TabletopActionService), 'createRangeArea');

      expect(run(slotOf('range', 'LINE'), character)).toEqual({ ok: true });

      expect(store.get(range.identifier)).toBeNull();
      expect(create).not.toHaveBeenCalled();
    });

    it('marks what it lays, so another window of the same reader knows it again', () => {
      const range = RangeArea.create('射程範囲', 1, 4, 100);
      vi.spyOn(TestBed.inject(TabletopActionService), 'createRangeArea').mockReturnValue(range);

      run(slotOf('range', 'LINE'), character);

      expect(range.laidByHotbarSlot).toBe(hotbarSlotTag(Hotbar.ownerId, CELL, character.identifier));
    });

    it('says so when the slot names no range to lay', () => {
      expect(run(slotOf('range', '  '), character)).toEqual({ ok: false, reason: 'empty' });
    });

    it('says so when the character holds no dice to lay out', () => {
      vi.spyOn(TestBed.inject(CharacterDiceService), 'deploy').mockReturnValue([]);

      expect(run(slotOf('diceDeploy', ''), character)).toEqual({ ok: false, reason: 'empty' });
    });

    it('takes the dice back where the character already has them out', () => {
      const dice = TestBed.inject(CharacterDiceService);
      vi.spyOn(dice, 'putAway').mockReturnValue(2);
      const deploy = vi.spyOn(dice, 'deploy');

      expect(run(slotOf('diceDeploy', ''), character)).toEqual({ ok: true });
      expect(deploy).not.toHaveBeenCalled();
    });

    it('opens the panel the slot names, under a name of its own', () => {
      const panel = TestBed.inject(ObjectPanelService);
      const openSheet = vi.spyOn(panel, 'openCharacterSheet').mockImplementation(() => undefined);
      vi.spyOn(TestBed.inject(PanelService), 'closeSingle').mockReturnValue(false);

      const slot = slotOf('panel', '', { kind: 'panel', panel: 'sheet' });

      expect(run(slot, character)).toEqual({ ok: true });
      expect(openSheet.mock.calls[0][0]).toBe(character);
      expect(openSheet.mock.calls[0][1]?.single).toContain(character.identifier);
    });

    it('closes the panel again rather than opening a second one', () => {
      const panel = TestBed.inject(ObjectPanelService);
      const openSheet = vi.spyOn(panel, 'openCharacterSheet').mockImplementation(() => undefined);
      const closeSingle = vi.spyOn(TestBed.inject(PanelService), 'closeSingle').mockReturnValue(true);

      const slot = slotOf('panel', '', { kind: 'panel', panel: 'sheet' });

      expect(run(slot, character)).toEqual({ ok: true });
      expect(closeSingle).toHaveBeenCalled();
      expect(openSheet).not.toHaveBeenCalled();
    });

    it('only looks at a character that is on the table, and says which it is', () => {
      character.location.name = 'graveyard';

      expect(run(slotOf('focus', ''), character)).toEqual({ ok: false, reason: 'offTable' });
    });
  });

  describe('what needs no character', () => {
    it('plays a sound for the room, or for this screen alone', () => {
      const play = vi.spyOn(SoundEffect, 'play').mockImplementation(() => undefined);
      const playLocal = vi.spyOn(SoundEffect, 'playLocal').mockImplementation(() => undefined);
      vi.spyOn(TestBed.inject(AudioStorage), 'get').mockReturnValue({ identifier: 'dice-roll' } as never);

      expect(run(slotOf('sound', 'dice-roll'), null)).toEqual({ ok: true });
      expect(play).toHaveBeenCalledWith('dice-roll');

      const quiet = slotOf('sound', 'dice-roll', { kind: 'sound', local: true });
      run(quiet, null);
      expect(playLocal).toHaveBeenCalledWith('dice-roll');
    });

    it('says so when the room holds no such sound', () => {
      vi.spyOn(TestBed.inject(AudioStorage), 'get').mockReturnValue(null);

      expect(run(slotOf('sound', 'gone'), null)).toEqual({ ok: false, reason: 'notFound' });
    });

    it('finds a cut-in by name where the identifier came from another room', () => {
      const cutIn = new CutIn('cut-in-here');
      cutIn.name = '幕間';
      cutIn.initialize();
      const launch = vi.spyOn(TestBed.inject(CutInService), 'launch').mockReturnValue(true);
      const slot = slotOf('cutIn', 'cut-in-from-elsewhere');
      slot.valueName = '幕間';

      expect(run(slot, null)).toEqual({ ok: true });
      expect(launch).toHaveBeenCalledWith(cutIn);
    });

    it('says so when the cut-in it points at is gone', () => {
      expect(run(slotOf('cutIn', 'no-such-cut-in'), null)).toEqual({ ok: false, reason: 'notFound' });
    });

    it('runs the slots a group names, in the order they were chosen', () => {
      const hotbar = Hotbar.ensureMine()!;
      const first = emptyHotbarSlotDraft('prefill');
      first.value = '一つ目';
      hotbar.put(0, 1, first);
      const second = emptyHotbarSlotDraft('prefill');
      second.value = '二つ目';
      hotbar.put(0, 2, second);
      const request = vi.spyOn(TestBed.inject(UiSignalService), 'requestChatInputText');

      const group = slotOf('group', '', {
        kind: 'group',
        steps: [
          { page: 0, slotIndex: 2, slotIdentifier: '', delayMs: 0 },
          { page: 0, slotIndex: 1, slotIdentifier: '', delayMs: 0 },
        ],
      });

      expect(run(group, null)).toEqual({ ok: true });
      expect(request.mock.calls.map((call) => call[0])).toEqual(['二つ目', '一つ目']);
    });

    it('follows a step to wherever the reader moved the slot it names', () => {
      const hotbar = Hotbar.ensureMine()!;
      const moved = emptyHotbarSlotDraft('prefill');
      moved.value = '動かした枠';
      const slot = hotbar.put(0, 1, moved)!;
      const request = vi.spyOn(TestBed.inject(UiSignalService), 'requestChatInputText');
      const group = slotOf('group', '', {
        kind: 'group',
        steps: [{ page: 0, slotIndex: 1, slotIdentifier: slot.identifier, delayMs: 0 }],
      });

      hotbar.move({ page: 0, slotIndex: 1 }, { page: 0, slotIndex: 7 });

      expect(run(group, null)).toEqual({ ok: true });
      expect(request).toHaveBeenCalledWith('動かした枠');
    });

    it('marks what a moved step lays for the cell that step sits in now', () => {
      const hotbar = Hotbar.ensureMine()!;
      const draft = emptyHotbarSlotDraft('range');
      draft.value = 'LINE';
      draft.characterIdentifier = character.identifier;
      draft.characterName = character.name;
      const slot = hotbar.put(0, 1, draft)!;
      const range = RangeArea.create('射程範囲', 1, 4, 100);
      vi.spyOn(TestBed.inject(TabletopActionService), 'createRangeArea').mockReturnValue(range);
      const group = slotOf('group', '', {
        kind: 'group',
        steps: [{ page: 0, slotIndex: 1, slotIdentifier: slot.identifier, delayMs: 0 }],
      });

      hotbar.move({ page: 0, slotIndex: 1 }, { page: 0, slotIndex: 7 });
      expect(run(group, null)).toEqual({ ok: true });

      expect(range.laidByHotbarSlot).toBe(
        hotbarSlotTag(Hotbar.ownerId, { page: 0, slotIndex: 7 }, character.identifier)
      );
    });

    it('passes over a step whose slot has gone while it waited its turn', () => {
      vi.useFakeTimers();
      try {
        const hotbar = Hotbar.ensureMine()!;
        const first = emptyHotbarSlotDraft('prefill');
        first.value = '一つ目';
        hotbar.put(0, 1, first);
        const second = emptyHotbarSlotDraft('prefill');
        second.value = '二つ目';
        hotbar.put(0, 2, second);
        const request = vi.spyOn(TestBed.inject(UiSignalService), 'requestChatInputText');
        const group = slotOf('group', '', {
          kind: 'group',
          steps: [
            { page: 0, slotIndex: 1, slotIdentifier: '', delayMs: 0 },
            { page: 0, slotIndex: 2, slotIdentifier: '', delayMs: 500 },
          ],
        });

        run(group, null);
        hotbar.clear(0, 2);
        vi.advanceTimersByTime(500);

        expect(request.mock.calls.map((call) => call[0])).toEqual(['一つ目']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('waits between the steps it was asked to space out', () => {
      vi.useFakeTimers();
      try {
        const hotbar = Hotbar.ensureMine()!;
        const first = emptyHotbarSlotDraft('prefill');
        first.value = '一つ目';
        hotbar.put(0, 1, first);
        const second = emptyHotbarSlotDraft('prefill');
        second.value = '二つ目';
        hotbar.put(0, 2, second);
        const request = vi.spyOn(TestBed.inject(UiSignalService), 'requestChatInputText');

        const group = slotOf('group', '', {
          kind: 'group',
          steps: [
            { page: 0, slotIndex: 1, slotIdentifier: '', delayMs: 0 },
            { page: 0, slotIndex: 2, slotIdentifier: '', delayMs: 500 },
          ],
        });

        expect(run(group, null)).toEqual({ ok: true });
        expect(request.mock.calls.map((call) => call[0])).toEqual(['一つ目']);

        vi.advanceTimersByTime(500);
        expect(request.mock.calls.map((call) => call[0])).toEqual(['一つ目', '二つ目']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('says why nothing happened when every step it ran refused', () => {
      const hotbar = Hotbar.ensureMine()!;
      hotbar.put(0, 1, emptyHotbarSlotDraft('chat'));
      const group = slotOf('group', '', {
        kind: 'group',
        steps: [{ page: 0, slotIndex: 1, slotIdentifier: '', delayMs: 0 }],
      });

      expect(run(group, character)).toEqual({ ok: false, reason: 'empty' });
    });

    it('passes over a step that is a group of its own, and says so when none is left', () => {
      const hotbar = Hotbar.ensureMine()!;
      hotbar.put(0, 1, emptyHotbarSlotDraft('group'));

      const group = slotOf('group', '', {
        kind: 'group',
        steps: [{ page: 0, slotIndex: 1, slotIdentifier: '', delayMs: 0 }],
      });

      expect(run(group, null)).toEqual({ ok: false, reason: 'empty' });
    });

    it('says so when a group names nothing at all', () => {
      expect(run(slotOf('group', ''), null)).toEqual({ ok: false, reason: 'empty' });
    });

    it('loads the chat box without sending', () => {
      const request = vi.spyOn(TestBed.inject(UiSignalService), 'requestChatInputText');

      expect(run(slotOf('prefill', '/w gm '), null)).toEqual({ ok: true });
      expect(request).toHaveBeenCalledWith('/w gm ');
    });

    it('moves the turn on', () => {
      const next = vi.spyOn(TestBed.inject(TurnOrderService), 'next').mockImplementation(() => undefined);

      expect(run(slotOf('turn', ''), null)).toEqual({ ok: true });
      expect(next).toHaveBeenCalled();
    });

    it('reaches for nothing at all when the cut-in is gone, whichever way it would have played', () => {
      const cutInService = TestBed.inject(CutInService);
      const launchSoundOnly = vi.spyOn(cutInService, 'launchSoundOnly').mockReturnValue(true);
      const launch = vi.spyOn(cutInService, 'launch').mockReturnValue(true);

      expect(run(slotOf('cutIn', 'no-such-cut-in', { kind: 'cutIn', soundOnly: true }), null)).toEqual({
        ok: false,
        reason: 'notFound',
      });
      expect(launchSoundOnly).not.toHaveBeenCalled();
      expect(launch).not.toHaveBeenCalled();
    });
  });

  it('says a slot with nothing in it is empty', () => {
    expect(run(slotOf('chat', '   '), character)).toEqual({ ok: false, reason: 'empty' });
    expect(run(slotOf('sound', ''), null)).toEqual({ ok: false, reason: 'empty' });
  });

  describe('an effect put on the ground', () => {
    function fieldPreset(): { identifier: string; name: string } {
      const preset = { identifier: 'preset', name: '毒沼' };
      vi.spyOn(TestBed.inject(EffectLibraryService), 'findByName').mockReturnValue(preset as never);
      return preset;
    }

    function fields(): EffectField[] {
      return ObjectStore.instance.getObjects<EffectField>(EffectField);
    }

    it('puts it where the piece stands, and takes it away when pressed again', () => {
      fieldPreset();
      const slot = slotOf('effect', '毒沼', { kind: 'effect', mode: 'field', onSelf: false });
      const cell = { page: 0, slotIndex: 3 };

      expect(run(slot, character, cell)).toEqual({ ok: true });
      expect(fields()).toHaveLength(1);

      expect(run(slot, character, cell)).toEqual({ ok: true });
      expect(fields()).toHaveLength(0);
    });

    it('takes away only what its own slot put there', () => {
      fieldPreset();
      const mine = slotOf('effect', '毒沼', { kind: 'effect', mode: 'field', onSelf: false });
      const other = slotOf('effect', '毒沼', { kind: 'effect', mode: 'field', onSelf: false });

      run(mine, character, { page: 0, slotIndex: 3 });
      run(other, character, { page: 0, slotIndex: 4 });
      expect(fields()).toHaveLength(2);

      run(mine, character, { page: 0, slotIndex: 3 });

      expect(fields()).toHaveLength(1);
    });
  });

  describe('an effect told to pay no heed to what is targeted', () => {
    it('plays on the piece that pressed it', () => {
      const preset = { identifier: 'preset', name: '守り' };
      vi.spyOn(TestBed.inject(EffectLibraryService), 'findByName').mockReturnValue(preset as never);
      const fire = vi.spyOn(TestBed.inject(EffectCastService), 'fire').mockReturnValue({} as never);
      const atTargets = vi.spyOn(TestBed.inject(EffectCastService), 'fireFromCharacter');

      const slot = slotOf('effect', '守り', { kind: 'effect', mode: 'cast', onSelf: true });

      expect(run(slot, character)).toEqual({ ok: true });
      expect(fire).toHaveBeenCalledWith(preset, [character], null);
      expect(atTargets).not.toHaveBeenCalled();
    });

    it('goes at what is targeted where it is not told to', () => {
      const preset = { identifier: 'preset', name: '一撃' };
      vi.spyOn(TestBed.inject(EffectLibraryService), 'findByName').mockReturnValue(preset as never);
      const atTargets = vi.spyOn(TestBed.inject(EffectCastService), 'fireFromCharacter').mockReturnValue({} as never);

      const slot = slotOf('effect', '一撃', { kind: 'effect', mode: 'cast', onSelf: false });

      expect(run(slot, character)).toEqual({ ok: true });
      expect(atTargets).toHaveBeenCalledWith(preset, character);
    });
  });

  describe('changing how a piece looks', () => {
    function picturesOf(count: number): void {
      const images = character.imageDataElement;
      if (!images) return;
      for (let index = images.children.length; index < count; index += 1) {
        images.appendChild(DataElement.create('imageIdentifier', `picture-${index}`, { type: 'image' }, ''));
      }
    }

    function pictureIndex(): number {
      return Number(character.detailDataElement?.getFirstElementByName('ICON')?.currentValue);
    }

    it('puts on the picture, the portrait and the size it was given', () => {
      picturesOf(3);

      const slot = slotOf('appearance', '', { kind: 'appearance', image: 2, portrait: 1, size: 3 });

      expect(run(slot, character)).toEqual({ ok: true });
      expect(pictureIndex()).toBe(2);
      expect(character.selectedPortraitIndex).toBe(1);
      expect(character.size).toBe(3);
    });

    it('leaves alone every part it was not given', () => {
      picturesOf(3);
      character.selectedPortraitIndex = 2;
      character.size = 4;
      const slot = slotOf('appearance', '', { kind: 'appearance', image: 1, portrait: -1, size: 0 });

      expect(run(slot, character)).toEqual({ ok: true });
      expect(pictureIndex()).toBe(1);
      expect(character.selectedPortraitIndex).toBe(2);
      expect(character.size).toBe(4);
    });

    it('holds a picture the character does not have to the last one it does', () => {
      picturesOf(2);

      expect(run(slotOf('appearance', '', { kind: 'appearance', image: 9, portrait: -1, size: 0 }), character)).toEqual(
        {
          ok: true,
        }
      );
      expect(pictureIndex()).toBe(1);
    });

    it('says so rather than pressing for nothing', () => {
      const slot = slotOf('appearance', '', { kind: 'appearance', image: -1, portrait: -1, size: 0 });

      expect(run(slot, character)).toEqual({ ok: false, reason: 'empty' });
    });

    it('needs a character, like the rest of what acts on one', () => {
      const slot = slotOf('appearance', '', { kind: 'appearance', image: 0, portrait: -1, size: 0 });

      expect(run(slot, null)).toEqual({ ok: false, reason: 'noCharacter' });
    });
  });
});
