import { Network } from '@axe/core/network/network';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { rereadSealedFaces } from '@axe/core/storage/sealed-faces';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { handLocationOf } from '@axe/domain/card/hand-location';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { handOverOwnership } from '@axe/domain/peer/ownership';

describe('handOverOwnership', () => {
  const made: { identifier: string }[] = [];
  const seatAs = (userId: string) =>
    vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ userId } as IPeerContext);

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('keeps the dice the seat sealed sealed, their faces being in the same browser still', () => {
    localStorage.removeItem('axe-sealed-dice-faces');
    rereadSealedFaces();
    seatAs('guest-1');
    const die = DiceSymbol.create('plot', DiceType.D20, 1);
    die.face = '17';
    die.owner = 'guest-1';
    die.seal();
    made.push(die);

    handOverOwnership('guest-1', 'acct_1');
    seatAs('acct_1');

    expect([die.owner, die.isSealed, die.sentFace, die.face]).toEqual(['acct_1', true, '', '17']);
    localStorage.removeItem('axe-sealed-dice-faces');
    rereadSealedFaces();
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
