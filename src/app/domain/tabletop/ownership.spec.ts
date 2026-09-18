import { TestBed } from '@angular/core/testing';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import {
  asOwnable,
  claimBroughtInPiece,
  clearOwnership,
  clearOwnershipTree,
  findOrphanedOwnership,
  releaseOrphanedOwnership,
} from '@axe/domain/tabletop/ownership';

describe('ownership', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  describe('asOwnable', () => {
    it('counts an owned object and a mask as ownable', () => {
      expect(asOwnable(new Card())).toBeInstanceOf(Card);
      expect(asOwnable(new GameTableMask())).toBeInstanceOf(GameTableMask);
    });

    it('counts anything else as not', () => {
      expect(asOwnable(new GameTable())).toBeNull();
      expect(asOwnable(null)).toBeNull();
    });
  });

  describe('clearOwnership', () => {
    it('clears the owner of what has one and counts them', () => {
      const card = new Card();
      card.owner = 'user-1';
      const mask = new GameTableMask();
      mask.owner = 'user-2';
      const unowned = new Card();
      const table = new GameTable();

      const cleared = clearOwnership([card, mask, unowned, table]);

      expect(cleared).toBe(2);
      expect(card.owner).toBe('');
      expect(mask.owner).toBe('');
    });
  });

  describe('clearOwnershipTree', () => {
    it('clears a parent and everything under it together', () => {
      const stack = CardStack.create('デッキ');
      stack.owner = 'user-1';
      const child = Card.create('カード', 'front.png', 'back.png');
      child.owner = 'user-2';
      stack.appendChild(child);

      const cleared = clearOwnershipTree(stack);

      expect(cleared).toBe(2);
      expect(stack.owner).toBe('');
      expect(child.owner).toBe('');
    });
  });

  describe('claimBroughtInPiece', () => {
    it('makes a character the one who brought it in', () => {
      const character = new GameCharacter();
      character.owner = 'whoever-saved-it';

      claimBroughtInPiece(character, 'the-dropper');

      expect(character.owner).toBe('the-dropper');
    });

    it('leaves a stack and its cards held by nobody, so no face is kept from the others', () => {
      const stack = CardStack.create('デッキ');
      stack.owner = 'whoever-saved-it';
      const card = Card.create('カード', 'front.png', 'back.png');
      card.owner = 'whoever-saved-it';
      stack.appendChild(card);

      claimBroughtInPiece(stack, 'the-dropper');

      expect(stack.owner).toBe('');
      expect(card.owner).toBe('');
    });

    it('leaves a character with no owner when nobody is known to have brought it in', () => {
      const character = new GameCharacter();
      character.owner = 'whoever-saved-it';

      claimBroughtInPiece(character, '');

      expect(character.owner).toBe('');
    });
  });

  describe('findOrphanedOwnership / releaseOrphanedOwnership', () => {
    const peers = [
      { userId: 'online-user', isOpen: true },
      { userId: 'closed-user', isOpen: false },
    ];

    it('picks out the absent and dropped owners, leaving those still connected', () => {
      const online = new Card();
      online.owner = 'online-user';
      const absent = new Card();
      absent.owner = 'ghost-user';
      const closed = new GameTableMask();
      closed.owner = 'closed-user';
      const unowned = new Card();

      const orphaned = findOrphanedOwnership([online, absent, closed, unowned], peers);

      expect(orphaned).toContain(absent);
      expect(orphaned).toContain(closed);
      expect(orphaned).not.toContain(online);
      expect(orphaned).toHaveLength(2);
    });

    it('releases what an absent owner holds and leaves the rest', () => {
      const online = new Card();
      online.owner = 'online-user';
      const absent = new Card();
      absent.owner = 'ghost-user';

      const released = releaseOrphanedOwnership([online, absent], peers);

      expect(released).toBe(1);
      expect(absent.owner).toBe('');
      expect(online.owner).toBe('online-user');
    });
  });
});
