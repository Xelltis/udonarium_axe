import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/network/network';
import { Card } from '@axe/domain/card/card';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { DisclosureControlComponent } from '@axe/features/disclosure/disclosure-control/disclosure-control.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DisclosureControlComponent', () => {
  const made: { destroy(): void }[] = [];
  const original = PeerCursor.myCursor;

  function choicesFor(object: Card | TextNote): string[] {
    const fixture = TestBed.createComponent(DisclosureControlComponent);
    fixture.componentRef.setInput('object', object);
    return fixture.componentInstance.ownerCandidates().map((candidate) => candidate.userId);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DisclosureControlComponent], providers: [...TEST_PROVIDERS] });
    PeerCursor.myCursor = { userId: 'p1', name: 'p1', role: PeerRole.Player, isGameMaster: false } as PeerCursor;
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(Network.instance, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-2' }] as never);
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ userId: 'p2', name: 'p2', isMine: false } as PeerCursor);
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

  it('offers the owner of a note everyone, whom the server lets it hand the note to', () => {
    const note = TextNote.create('メモ', '本文');
    note.owner = 'p1';
    made.push(note);

    expect(choicesFor(note)).toEqual(['p1', 'p2']);
  });

  it('offers everyone among peers, as before', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    const card = Card.create('剣の2', 'front.png', 'back.png');
    made.push(card);

    expect(choicesFor(card)).toEqual(['p1', 'p2']);
  });
});
