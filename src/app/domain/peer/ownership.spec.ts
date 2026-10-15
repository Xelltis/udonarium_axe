import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { handLocationOf } from '@axe/domain/card/hand-location';
import { GameCharacter } from '@axe/domain/character/game-character';
import { handOverOwnership } from '@axe/domain/peer/ownership';

describe('handOverOwnership', () => {
  const made: { identifier: string }[] = [];

  afterEach(() => {
    for (const object of made.splice(0)) {
      const stored = ObjectStore.instance.get(object.identifier);
      if (stored) ObjectStore.instance.delete(stored, false);
    }
    ObjectStore.instance.clearDeleteHistory();
  });

  it('moves the old id’s hand and what it owns to the new id, and leaves everybody else’s alone', () => {
    const held = Card.create('held', '', '');
    held.toHand('guest-1');
    const peeked = Card.create('peeked', '', '');
    peeked.owner = 'guest-1';
    const theirs = Card.create('theirs', '', '');
    theirs.toHand('someone-else');
    const piece = GameCharacter.create('piece', 1, '');
    piece.owner = 'guest-1';
    made.push(held, peeked, theirs, piece);

    handOverOwnership('guest-1', 'acct_1');

    expect(held.location.name).toBe(handLocationOf('acct_1'));
    expect(peeked.owner).toBe('acct_1');
    expect(theirs.location.name).toBe(handLocationOf('someone-else'));
    expect(piece.owner).toBe('acct_1');
  });

  it('does nothing without both ids', () => {
    const held = Card.create('held', '', '');
    held.toHand('guest-1');
    made.push(held);

    handOverOwnership('guest-1', '');
    handOverOwnership('', 'acct_1');

    expect(held.location.name).toBe(handLocationOf('guest-1'));
  });
});
