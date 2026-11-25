import { TestBed } from '@angular/core/testing';
import { ActiveCharacterService } from '@axe/application/character/active-character.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { TabletopShortcutEventHandlerService } from '@axe/features/keyboard/tabletop-shortcut-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { type MockInstance, onTestFinished } from 'vitest';

describe('TabletopShortcutEventHandlerService', () => {
  let show: MockInstance<SnackbarService['show']>;
  let selection: SelectionSignalService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: TRANSLATE_FN,
          useValue: (key: string, params?: Record<string, unknown>) =>
            params ? `${key} ${JSON.stringify(params)}` : key,
        },
      ],
    });
    TestBed.inject(TabletopShortcutEventHandlerService);
    selection = TestBed.inject(SelectionSignalService);
    show = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => {});
  });

  afterEach(() => {
    selection.clearSelection();
    selection.selectedObject.set(null);
    vi.restoreAllMocks();
  });

  function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    document.dispatchEvent(event);
    return event;
  }

  function pick(...pieces: { identifier: string; aliasName: string }[]): void {
    selection.replaceSelection(pieces.map((piece) => piece.identifier));
  }

  describe('Tab', () => {
    function on(name: string, x: number, side: string): GameCharacter {
      const one = GameCharacter.create(name, 1, '');
      one.location = { name: 'table', x, y: 0 };
      one.battleSide = side;
      return one;
    }

    it('aims from the piece whose turn it is at the nearest of the other side, then the next, and back on Shift+Tab', () => {
      const hero = on('勇者', 0, 'left');
      const near = on('近', 100, 'right');
      const far = on('遠', 300, 'right');
      const picked = on('選', 900, 'right');
      selection.selectObject(picked.identifier, picked.aliasName);
      vi.spyOn(TestBed.inject(TurnOrderService), 'currentIdentifier', 'get').mockReturnValue(hero.identifier);

      const event = press('Tab');
      expect(event.defaultPrevented).toBe(true);
      expect(near.targeted).toBe(true);
      press('Tab');
      expect([near.targeted, far.targeted]).toEqual([false, true]);
      press('Tab', { shiftKey: true });
      expect([near.targeted, far.targeted]).toEqual([true, false]);
      expect(show).toHaveBeenCalledWith(`feature.keyboard.tabletop.targetedOne {"name":"近"}`);
      for (const piece of [hero, near, far, picked]) piece.destroy();
    });

    it('aims from the piece picked last where it is nobody’s turn, and leaves Tab to move the focus where there is nothing to aim at', () => {
      const lone = on('ひとり', 0, 'left');
      selection.selectObject(lone.identifier, lone.aliasName);

      const event = press('Tab');

      expect([lone.targeted, event.defaultPrevented]).toEqual([false, false]);
      expect(show).not.toHaveBeenCalled();
      lone.destroy();
    });

    it('passes over a piece whose turn it is that this seat cannot see, and aims from the piece picked instead', () => {
      const hidden = on('伏兵', 0, 'right');
      const picked = on('選', 1000, 'left');
      const nearHidden = on('近', 100, 'right');
      const nearPicked = on('遠', 900, 'right');
      selection.selectObject(picked.identifier, picked.aliasName);
      vi.spyOn(TestBed.inject(TurnOrderService), 'currentIdentifier', 'get').mockReturnValue(hidden.identifier);
      vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockImplementation((piece) => piece !== hidden);

      press('Tab');

      expect([nearPicked.targeted, nearHidden.targeted]).toEqual([true, false]);
      for (const piece of [hidden, picked, nearHidden, nearPicked]) piece.destroy();
    });

    it('aims from the piece this seat plays, and else from a piece of its own, where nothing is picked and it is nobody’s turn', () => {
      const mine = on('自分', 0, 'left');
      const played = on('操作', 1000, 'left');
      const nearMine = on('近', 100, 'right');
      const nearPlayed = on('遠', 900, 'right');
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'me';
      mine.owner = 'me';
      const active = TestBed.inject(ActiveCharacterService).identifier;
      active.set(played.identifier);

      press('Tab');
      expect([nearPlayed.targeted, nearMine.targeted]).toEqual([true, false]);
      active.set(null);
      TestBed.inject(PieceTargetService).setOnly([]);
      press('Tab');
      expect([nearPlayed.targeted, nearMine.targeted]).toEqual([false, true]);

      for (const piece of [mine, played, nearMine, nearPlayed]) piece.destroy();
      PeerCursor.myCursor = null!;
    });

    describe('with the focus left on a control', () => {
      let foe: GameCharacter;
      let button: HTMLButtonElement;
      let other: HTMLButtonElement;
      const pressOn = (element: Element) => element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      const key = (name: string) =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));

      beforeEach(() => {
        const hero = on('勇者', 0, 'left');
        foe = on('敵', 100, 'right');
        selection.selectObject(hero.identifier, hero.aliasName);
        button = document.createElement('button');
        other = document.createElement('button');
        document.body.append(button, other);
        onTestFinished(() => {
          button.remove();
          other.remove();
          for (const piece of [hero, foe]) piece.destroy();
        });
      });

      it('aims where the pointer pressed the control', () => {
        pressOn(button);
        button.focus();

        expect([press('Tab').defaultPrevented, foe.targeted]).toEqual([true, true]);
      });

      it('aims where a dialog gave the focus back to the control that opened it, after its button was pressed', () => {
        pressOn(button);
        button.focus();
        pressOn(other);
        button.focus();

        expect([press('Tab').defaultPrevented, foe.targeted]).toEqual([true, true]);
      });

      it('moves the focus on where the keyboard moved it there, by an arrow key as by Tab', () => {
        pressOn(button);
        button.focus();
        key('ArrowRight');
        other.focus();

        expect([press('Tab').defaultPrevented, foe.targeted]).toEqual([false, false]);
      });

      it('moves the focus on where the keyboard moved it while the table took no keys, as in the first-person view', () => {
        pressOn(button);
        vi.spyOn(TestBed.inject(FirstPersonService), 'showing').mockReturnValue(true);
        key('Tab');
        other.focus();
        vi.mocked(TestBed.inject(FirstPersonService).showing).mockReturnValue(false);

        expect([press('Tab').defaultPrevented, foe.targeted]).toEqual([false, false]);
      });

      it('aims again once the pointer has pressed anything after the keyboard moved the focus', () => {
        key('ArrowRight');
        other.focus();
        pressOn(other);

        expect([press('Tab').defaultPrevented, foe.targeted]).toEqual([true, true]);
      });

      it('leaves Tab under a dialog', () => {
        pressOn(button);
        button.focus();
        vi.spyOn(TestBed.inject(ModalService), 'isShow', 'get').mockReturnValue(true);

        expect([press('Tab').defaultPrevented, foe.targeted]).toEqual([false, false]);
      });
    });

    it('leaves Tab to a sheet or a dialog marked as modal that stands over the table', () => {
      const hero = on('勇者', 0, 'left');
      const foe = on('敵', 100, 'right');
      selection.selectObject(hero.identifier, hero.aliasName);
      const sheet = document.createElement('div');
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      document.body.appendChild(sheet);
      onTestFinished(() => {
        sheet.remove();
        for (const piece of [hero, foe]) piece.destroy();
      });

      expect([press('Tab').defaultPrevented, foe.targeted]).toEqual([false, false]);
    });

    it('steps on from the piece an area held ready is centred on, reaching every piece in turn', () => {
      const hero = on('勇者', 0, 'left');
      const near = on('近', 100, 'right');
      const next = on('次', 150, 'right');
      const far = on('遠', 600, 'right');
      onTestFinished(() => {
        for (const piece of [hero, near, next, far]) piece.destroy();
      });
      selection.selectObject(hero.identifier, hero.aliasName);
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      preset.targeting = 'multi';
      preset.areaRadius = 2;
      preset.maxTargets = 5;
      targeting.begin(preset);
      onTestFinished(() => {
        targeting.cancel();
      });

      const centres = [1, 2, 3].map(() => {
        press('Tab');
        return targeting.epicenter();
      });

      expect(centres).toEqual([near.identifier, next.identifier, far.identifier]);
    });

    it('picks the piece Tab aims at as the target of an effect held ready, its mark following the pick', () => {
      const hero = on('勇者', 0, 'left');
      const foe = on('敵', 100, 'right');
      selection.selectObject(hero.identifier, hero.aliasName);
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      targeting.begin(preset);

      press('Tab');

      expect([targeting.picks(), foe.targeted]).toEqual([[foe.identifier], true]);
      targeting.cancel();
      for (const piece of [hero, foe]) piece.destroy();
    });
  });

  describe('T', () => {
    it('aims at the picked characters only, and says how many', () => {
      const one = GameCharacter.create('一', 1, '');
      const two = GameCharacter.create('二', 1, '');
      const other = GameCharacter.create('三', 1, '');
      const note = TextNote.create('メモ', '');
      other.targeted = true;
      pick(one, two, note);

      const event = press('t');

      expect(event.defaultPrevented).toBe(true);
      expect([one.targeted, two.targeted, other.targeted]).toEqual([true, true, false]);
      expect(show).toHaveBeenCalledWith('feature.keyboard.tabletop.targeted {"count":2}');
    });

    it('falls back to the piece clicked last when nothing is gathered', () => {
      const piece = GameCharacter.create('一', 1, '');
      selection.selectObject(piece.identifier, piece.aliasName);

      press('t');

      expect(piece.targeted).toBe(true);
    });

    it('says how to pick when no character is picked', () => {
      const note = TextNote.create('メモ', '');
      pick(note);

      press('t');

      expect(show).toHaveBeenCalledWith('feature.keyboard.tabletop.nothingToTarget');
    });

    it('takes every aim away on Shift+T', () => {
      const one = GameCharacter.create('一', 1, '');
      one.targeted = true;

      press('T', { shiftKey: true });

      expect(one.targeted).toBe(false);
      expect(show).toHaveBeenCalledWith('feature.keyboard.tabletop.targetsCleared');
    });

    it('calls off an effect held ready on Shift+T with nothing aimed at yet', () => {
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      targeting.begin(preset);
      expect(targeting.isPicking()).toBe(true);

      press('T', { shiftKey: true });

      expect(targeting.isPicking()).toBe(false);
      expect(show).toHaveBeenCalledWith('feature.keyboard.tabletop.targetsCleared');
    });

    it('does nothing on Shift+T with nothing aimed at and no effect held ready', () => {
      press('T', { shiftKey: true });

      expect(show).not.toHaveBeenCalled();
    });
  });

  describe('G', () => {
    let editable: (piece: unknown) => boolean;

    beforeEach(() => {
      editable = () => true;
      vi.spyOn(TestBed.inject(DisclosureService), 'canEdit').mockImplementation((piece) => editable(piece));
    });

    it('opens the picked pieces to everyone while any is kept from someone, then keeps them to the GM', () => {
      const character = GameCharacter.create('一', 1, '');
      const note = TextNote.create('メモ', '');
      character.disclosureMode = 'gm';
      note.disclosureMode = 'all';
      pick(character, note);

      press('g');
      expect([character.disclosureMode, note.disclosureMode]).toEqual(['all', 'all']);
      expect(show).toHaveBeenLastCalledWith('feature.keyboard.tabletop.disclosedToAll {"count":2}');

      press('g');
      expect([character.disclosureMode, note.disclosureMode]).toEqual(['gm', 'gm']);
      expect(show).toHaveBeenLastCalledWith('feature.keyboard.tabletop.disclosedToGm {"count":2}');
    });

    it('leaves alone the pieces this seat may not change', () => {
      const mine = GameCharacter.create('一', 1, '');
      const theirs = GameCharacter.create('二', 1, '');
      mine.disclosureMode = 'gm';
      theirs.disclosureMode = 'gm';
      editable = (piece) => piece === mine;
      pick(mine, theirs);

      press('g');

      expect([mine.disclosureMode, theirs.disclosureMode]).toEqual(['all', 'gm']);
      expect(show).toHaveBeenCalledWith('feature.keyboard.tabletop.disclosedToAll {"count":1}');
    });

    it('says how to pick when nothing picked can be changed', () => {
      editable = () => false;
      pick(GameCharacter.create('一', 1, ''));

      press('g');

      expect(show).toHaveBeenCalledWith('feature.keyboard.tabletop.nothingToDisclose');
    });
  });

  describe('when the keys are not the table’s', () => {
    it('leaves them to the first-person view, which answers T itself', () => {
      vi.spyOn(TestBed.inject(FirstPersonService), 'showing').mockReturnValue(true);
      const piece = GameCharacter.create('一', 1, '');
      pick(piece);

      const event = press('t');

      expect(piece.targeted).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    });

    it('leaves them to a field or panel that has the focus', () => {
      const field = document.createElement('input');
      document.body.appendChild(field);
      field.focus();
      const piece = GameCharacter.create('一', 1, '');
      pick(piece);

      press('t');

      expect(piece.targeted).toBe(false);
      field.remove();
    });

    it('leaves a key something else has already answered', () => {
      const piece = GameCharacter.create('一', 1, '');
      pick(piece);
      const event = new KeyboardEvent('keydown', { key: 't', cancelable: true });
      event.preventDefault();

      document.dispatchEvent(event);

      expect(piece.targeted).toBe(false);
    });
  });
});
