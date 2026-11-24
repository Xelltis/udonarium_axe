import { TestBed } from '@angular/core/testing';
import { ChatLineEditService } from '@axe/application/chat/chat-line-edit.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { localDispatch } from '@axe/core/network/network-messaging';
import { IPeerContext } from '@axe/core/network/peer-context';
import { setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { rereadSealedFaces } from '@axe/core/storage/sealed-faces';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { SealedDiceEventHandlerService } from '@axe/features/dice/sealed-dice-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SealedDiceEventHandlerService', () => {
  const made: DiceSymbol[] = [];

  function die(owner: string, sealed: boolean): DiceSymbol {
    const dice = DiceSymbol.create('plot', DiceType.D6, 1);
    dice.location.name = 'table';
    dice.face = '2';
    dice.owner = owner;
    if (sealed && owner === 'me') dice.seal();
    else if (sealed) {
      dice.sealed = true;
      dice.sentFace = '';
    }
    made.push(dice);
    return dice;
  }

  beforeEach(() => {
    localStorage.removeItem('axe-sealed-dice-faces');
    rereadSealedFaces();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    const mine = { userId: 'me' } as IPeerContext;
    setPeerContextProvider({ peerContext: mine, peerContexts: [mine], peerIds: ['me'], peerId: 'me' });
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null);
    vi.spyOn(TestBed.inject(ChatLineEditService), 'discloseDieRolls').mockReturnValue(0);
    TestBed.inject(SealedDiceEventHandlerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dice of made.splice(0)) dice.destroy();
    for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) cursor.destroy();
    localStorage.removeItem('axe-sealed-dice-faces');
    rereadSealedFaces();
  });

  it('shows the dice this seat sealed when every seat is asked to, and leaves the rest as they are', () => {
    const mine = die('me', true);
    const theirs = die('somebody-else', true);
    const kept = die('me', false);

    localDispatch('REVEAL_SEALED_DICE', null);

    expect([mine.isSealed, mine.owner, mine.sentFace]).toEqual([false, '', '2']);
    expect([theirs.isSealed, theirs.owner]).toEqual([true, 'somebody-else']);
    expect(kept.owner).toBe('me');
  });
});
