import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PartyService } from '@axe/application/party/party.service';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party } from '@axe/domain/party/party';
import { PartyListPanelComponent } from '@axe/features/gm-tools/party-list/party-list-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PartyListPanelComponent', () => {
  let component: PartyListPanelComponent;
  let fixture: ComponentFixture<PartyListPanelComponent>;
  let partyService: PartyService;

  interface Panel {
    addParty: () => void;
    removeParty: (party: Party) => Promise<void>;
    assign: (character: GameCharacter, partyIdentifier: string) => void;
    members: (party: Party) => GameCharacter[];
    recolorParty: (party: Party, color: string) => void;
  }

  function panel(): Panel {
    return component as unknown as Panel;
  }

  function makeCharacter(name: string, owner: string): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.owner = owner;
    return character;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PartyListPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(PartyListPanelComponent);
    component = fixture.componentInstance;
    partyService = TestBed.inject(PartyService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubConfirm(answer: boolean): void {
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(answer);
  }

  it('lists a new party and gives it a colour of its own', () => {
    panel().addParty();
    panel().addParty();

    const parties = partyService.parties();
    expect(parties).toHaveLength(2);
    expect(parties[0].color).not.toBe(parties[1].color);
  });

  it('puts an unattached character into a party', () => {
    panel().addParty();
    const party = partyService.parties()[0];
    const character = makeCharacter('斥候', 'me');

    expect(partyService.unassigned()).toEqual([character]);

    panel().assign(character, party.identifier);

    expect(character.partyIdentifier).toBe(party.identifier);
    expect(panel().members(party)).toEqual([character]);
    expect(partyService.unassigned()).toEqual([]);
  });

  it('unattaches its characters when a party goes', async () => {
    stubConfirm(true);
    panel().addParty();
    const party = partyService.parties()[0];
    const character = makeCharacter('斥候', 'me');
    panel().assign(character, party.identifier);

    await panel().removeParty(party);

    expect(character.partyIdentifier).toBe('');
    expect(partyService.parties()).toEqual([]);
    expect(partyService.unassigned()).toEqual([character]);
  });

  it('keeps the party when the confirmation is dismissed', async () => {
    stubConfirm(false);
    panel().addParty();
    const party = partyService.parties()[0];

    await panel().removeParty(party);

    expect(partyService.parties()).toEqual([party]);
  });

  it('announces a change of colour', () => {
    panel().addParty();
    const party = partyService.parties()[0];

    panel().recolorParty(party, '#fcd34d');

    expect(party.color).toBe('#fcd34d');
  });

  it('looks for a member where it stands, through the table focus', () => {
    const character = makeCharacter('斥候', 'me');
    const focusOn = vi.spyOn(TestBed.inject(TableFocusService), 'focusOn').mockImplementation(() => undefined);

    (component as unknown as { focusToKoma: (c: GameCharacter) => void }).focusToKoma(character);

    expect(focusOn).toHaveBeenCalledWith(character);
  });
});
