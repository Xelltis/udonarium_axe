import { TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { TabletopShortcutEventHandlerService } from '@axe/features/keyboard/tabletop-shortcut-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

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
