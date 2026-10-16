import { TestBed } from '@angular/core/testing';
import { objectChanged$ } from '@axe/core/sync/object-event-extension';
import { CardStack } from '@axe/domain/card/card-stack';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CardEventHandlerService } from '@axe/features/card/card-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CardEventHandlerService', () => {
  let stack: CardStack;
  let other: PeerCursor;

  beforeEach(() => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.inject(CardEventHandlerService);
    other = new PeerCursor();
    other.userId = 'player-1';
    other.role = PeerRole.Player;
    other.initialize();
    stack = CardStack.create('山札');
    stack.owner = 'player-1';
  });

  afterEach(() => {
    stack.destroy();
    other.destroy();
  });

  function makeGuest(): void {
    other.role = PeerRole.Guest;
    objectChanged$.emit({ identifier: other.identifier, aliasName: other.aliasName, isSendFromSelf: false });
  }

  it('lets go, on the game master’s screen, of a deck a seat made a guest was looking through', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;

    makeGuest();

    expect(stack.owner).toBe('');
  });

  it('leaves it to the game master, writing nothing from a player’s screen', () => {
    PeerCursor.myCursor.role = PeerRole.Player;

    makeGuest();

    expect(stack.owner).toBe('player-1');
  });
});
