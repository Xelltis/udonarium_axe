import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/network/network';
import { Card } from '@axe/domain/card/card';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { DisclosureControlComponent } from '@axe/features/disclosure/disclosure-control/disclosure-control.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DisclosureControlComponent', () => {
  const made: { destroy(): void }[] = [];
  const original = PeerCursor.myCursor;

  function choicesFor(object: Card | TextNote | GameCharacter): string[] {
    const fixture = TestBed.createComponent(DisclosureControlComponent);
    fixture.componentRef.setInput('object', object);
    return fixture.componentInstance.ownerCandidates().map((candidate) => candidate.userId);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DisclosureControlComponent], providers: [...TEST_PROVIDERS] });
    PeerCursor.myCursor = { userId: 'p1', name: 'p1', role: PeerRole.Player, isGameMaster: false } as PeerCursor;
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-2' }] as never);
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
      userId: 'acct_p2',
      name: 'p2',
      isMine: false,
    } as PeerCursor);
  });

  afterEach(() => {
    for (const object of made.splice(0)) object.destroy();
    PeerCursor.myCursor = original;
    vi.restoreAllMocks();
  });

  it('offers a player on a room server only themselves for a card or a piece nobody owns, which is all it takes', () => {
    const card = Card.create('剣の2', 'front.png', 'back.png');
    card.owner = 'p1';
    const note = TextNote.create('メモ', '本文');
    made.push(card, note);

    expect(choicesFor(card)).toEqual(['p1']);
    expect(choicesFor(note)).toEqual(['p1']);
  });

  it('offers a player everyone for a character, whose owner the server leaves free', () => {
    const character = GameCharacter.create('ヒロ', 1, '');
    made.push(character);

    expect(choicesFor(character)).toEqual(['p1', 'acct_p2']);
  });

  it('offers the owner of a note everyone, whom the server lets it hand the note to', () => {
    const note = TextNote.create('メモ', '本文');
    note.owner = 'p1';
    made.push(note);

    expect(choicesFor(note)).toEqual(['p1', 'acct_p2']);
  });

  it('stops letting a player say who sees a card once it has passed to someone else', () => {
    const card = Card.create('剣の2', 'front.png', 'back.png');
    card.owner = 'p1';
    made.push(card);
    const fixture = TestBed.createComponent(DisclosureControlComponent);
    fixture.componentRef.setInput('object', card);
    expect(fixture.componentInstance.canEdit()).toBe(true);

    card.owner = 'acct_p2';
    TestBed.inject(ObjectChangeService).notifyChanged(card.identifier);

    expect(fixture.componentInstance.canEdit()).toBe(false);
  });

  it('offers everyone among peers, as before', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    const card = Card.create('剣の2', 'front.png', 'back.png');
    made.push(card);

    expect(choicesFor(card)).toEqual(['p1', 'acct_p2']);
  });

  it('leaves a seat not logged in out of the owners and the audience on a room server, whose id anybody may take', () => {
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
      userId: 'guest-tab',
      name: 'g',
      role: PeerRole.Guest,
      isMine: false,
      isGameMaster: false,
    } as PeerCursor);
    const character = GameCharacter.create('ヒロ', 1, '');
    made.push(character);
    const fixture = TestBed.createComponent(DisclosureControlComponent);
    fixture.componentRef.setInput('object', character);

    expect(fixture.componentInstance.ownerCandidates().map((candidate) => candidate.userId)).toEqual(['p1']);
    expect(fixture.componentInstance.audienceCandidates()).toEqual([]);
  });

  it('keeps offering a seat not logged in that is already chosen, so that it can be taken off', () => {
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
      userId: 'old-account',
      name: 'o',
      role: PeerRole.Guest,
      isMine: false,
      isGameMaster: false,
    } as PeerCursor);
    const character = GameCharacter.create('ヒロ', 1, '');
    character.owner = 'old-account';
    character.disclosureUserIds = ['old-account'];
    made.push(character);
    const fixture = TestBed.createComponent(DisclosureControlComponent);
    fixture.componentRef.setInput('object', character);

    expect(fixture.componentInstance.ownerCandidates().map((candidate) => candidate.userId)).toEqual([
      'p1',
      'old-account',
    ]);
    expect(fixture.componentInstance.audienceCandidates().map((candidate) => candidate.userId)).toEqual([
      'old-account',
    ]);
  });

  it('offers on a room server a player whose account is from before ids had their prefix, as only a login gives that role', () => {
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
      userId: 'old-account',
      name: 'o',
      role: PeerRole.Player,
      isMine: false,
      isGameMaster: false,
    } as PeerCursor);
    const character = GameCharacter.create('ヒロ', 1, '');
    made.push(character);
    const fixture = TestBed.createComponent(DisclosureControlComponent);
    fixture.componentRef.setInput('object', character);

    expect(fixture.componentInstance.ownerCandidates().map((candidate) => candidate.userId)).toEqual([
      'p1',
      'old-account',
    ]);
    expect(fixture.componentInstance.audienceCandidates().map((candidate) => candidate.userId)).toEqual([
      'old-account',
    ]);
  });

  it('shows a die kept to a seat to everyone through the dice service when its owner is taken away, the chat saying its face', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    PeerCursor.myCursor = { userId: 'gm', name: 'gm', role: PeerRole.GameMaster, isGameMaster: true } as PeerCursor;
    const notice = vi
      .spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice')
      .mockReturnValue(null as unknown as ChatMessage);
    const die = DiceSymbol.create('隠しダイス', DiceType.D6, 1);
    die.location.name = 'table';
    die.face = '4';
    die.owner = 'p2';
    made.push(die);
    const fixture = TestBed.createComponent(DisclosureControlComponent);
    fixture.componentRef.setInput('object', die);

    fixture.componentInstance.setOwner('');

    expect(die.owner).toBe('');
    expect(notice).toHaveBeenCalledWith('diceReveal', expect.stringContaining('4'));
  });
});
