import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party } from '@axe/domain/party/party';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ActiveCharacterService } from '@axe/features/pl-tools/active-character.service';
import { OwnedCharacterListPanelComponent } from '@axe/features/pl-tools/owned-character-list/owned-character-list-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('OwnedCharacterListPanelComponent', () => {
  let component: OwnedCharacterListPanelComponent;
  let fixture: ComponentFixture<OwnedCharacterListPanelComponent>;
  let panelStub: { open: ReturnType<typeof vi.fn>; openLazy: ReturnType<typeof vi.fn> };

  function makeCharacter(name: string, owner: string, locationName: string): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.owner = owner;
    character.location.name = locationName;
    return character;
  }

  beforeEach(async () => {
    panelStub = { open: vi.fn(), openLazy: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [OwnedCharacterListPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.overrideProvider(PanelService, { useValue: panelStub });
    fixture = TestBed.createComponent(OwnedCharacterListPanelComponent);
    component = fixture.componentInstance;
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
  });

  it('lists only the characters you own', () => {
    const mine = makeCharacter('自分のPC', 'me', 'table');
    makeCharacter('他人のPC', 'other', 'table');
    makeCharacter('墓場のPC', 'me', 'graveyard');

    expect(component.characters()).toEqual([mine]);
  });

  it('moves the camera only to one on the table', () => {
    const onTable = makeCharacter('卓上', 'me', 'table');
    const offTable = makeCharacter('手元', 'me', 'common');
    const protectedComponent = component as unknown as { canFocus: (c: GameCharacter) => boolean };

    expect(protectedComponent.canFocus(onTable)).toBe(true);
    expect(protectedComponent.canFocus(offTable)).toBe(false);
  });

  describe('showing who travels together', () => {
    interface PartyView {
      party: (c: GameCharacter) => Party | null;
      partyTooltip: (c: GameCharacter) => string;
    }

    function view(): PartyView {
      return component as unknown as PartyView;
    }

    function makeParty(name: string, color: string): Party {
      const party = new Party();
      party.name = name;
      party.color = color;
      party.initialize();
      return party;
    }

    it('shows no party for an unattached character', () => {
      const character = makeCharacter('自分のPC', 'me', 'table');

      expect(view().party(character)).toBeNull();
      expect(view().partyTooltip(character)).toBe('');
    });

    it('returns the party they belong to', () => {
      const party = makeParty('本隊', '#fcd34d');
      const character = makeCharacter('自分のPC', 'me', 'table');
      character.partyIdentifier = party.identifier;

      expect(view().party(character)).toBe(party);
    });

    it('shows none for a party that is gone', () => {
      const character = makeCharacter('自分のPC', 'me', 'table');
      character.partyIdentifier = 'gone';

      expect(view().party(character)).toBeNull();
    });

    it('names the others and leaves out the character themselves', () => {
      const party = makeParty('本隊', '#fcd34d');
      const mine = makeCharacter('自分のPC', 'me', 'table');
      const ally = makeCharacter('仲間のPC', 'other', 'table');
      mine.partyIdentifier = party.identifier;
      ally.partyIdentifier = party.identifier;

      const tooltip = view().partyTooltip(mine);

      expect(tooltip).toContain('本隊');
      expect(tooltip).toContain('仲間のPC');
      expect(tooltip).not.toContain('自分のPC');
    });

    it('still names the party when they travel alone', () => {
      const party = makeParty('本隊', '#fcd34d');
      const mine = makeCharacter('自分のPC', 'me', 'table');
      mine.partyIdentifier = party.identifier;

      const tooltip = view().partyTooltip(mine);

      expect(tooltip).toContain('本隊');
      expect(tooltip).not.toContain('自分のPC');
    });
  });

  it('moves the view to the piece', () => {
    const character = makeCharacter('卓上', 'me', 'table');
    character.location.x = 320;
    character.location.y = 240;
    const selection = TestBed.inject(SelectionSignalService);

    (component as unknown as { focusToKoma: (c: GameCharacter) => void }).focusToKoma(character);

    expect(selection.focusCoordinate()).toEqual(expect.objectContaining({ x: 320, y: 240 }));
  });

  it('leaves the view alone for a character off the table', () => {
    const character = makeCharacter('手元', 'me', 'common');
    const selection = TestBed.inject(SelectionSignalService);
    const before = selection.focusCoordinate();

    (component as unknown as { focusToKoma: (c: GameCharacter) => void }).focusToKoma(character);

    expect(selection.focusCoordinate()).toBe(before);
  });

  it('looks for the piece where it stands, through the table focus', () => {
    const character = makeCharacter('卓上', 'me', 'table');
    const focusOn = vi.spyOn(TestBed.inject(TableFocusService), 'focusOn').mockImplementation(() => undefined);

    (component as unknown as { focusToKoma: (c: GameCharacter) => void }).focusToKoma(character);

    expect(focusOn).toHaveBeenCalledWith(character);
  });

  it('opens the palette and the sheet', () => {
    const character = makeCharacter('自分のPC', 'me', 'table');
    const actions = component as unknown as {
      openChatPalette: (c: GameCharacter) => void;
      openSheet: (c: GameCharacter) => void;
    };

    actions.openChatPalette(character);
    actions.openSheet(character);

    expect(panelStub.openLazy).toHaveBeenCalledTimes(2);
    expect(panelStub.openLazy.mock.calls[0][1]).toEqual(expect.objectContaining({ width: 760, height: 500 }));
    expect(panelStub.openLazy.mock.calls[1][1]).toEqual(expect.objectContaining({ width: 800, height: 600 }));
  });

  it('takes something to work on and lets it go on a second press', () => {
    const character = makeCharacter('自分のPC', 'me', 'table');
    const active = TestBed.inject(ActiveCharacterService);
    const setActive = (component as unknown as { setActive: (c: GameCharacter) => void }).setActive;

    setActive.call(component, character);
    expect(active.identifier()).toBe(character.identifier);

    setActive.call(component, character);
    expect(active.identifier()).toBeNull();
  });

  describe('narrowing the list', () => {
    it('keeps only the characters whose name matches', () => {
      makeCharacter('ゴブリンA', 'me', 'table');
      makeCharacter('ゴブリンB', 'me', 'table');
      makeCharacter('村長', 'me', 'table');
      expect(component.filteredCharacters()).toHaveLength(3);

      component.search.set('ゴブリン');

      expect(component.filteredCharacters().map((character) => character.name)).toEqual(['ゴブリンA', 'ゴブリンB']);
    });

    it('says nothing matched rather than that the player owns none', () => {
      makeCharacter('ゴブリン', 'me', 'table');
      component.search.set('zzz');
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('一致するキャラクターがいません');
    });

    it('folds width so a full-width search still finds a half-width name', () => {
      makeCharacter('HPポーション', 'me', 'table');

      component.search.set('ＨＰ');

      expect(component.filteredCharacters()).toHaveLength(1);
    });
  });
});
