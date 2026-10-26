import { TestBed } from '@angular/core/testing';
import { StealthService } from '@axe/application/character/stealth.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';

describe('StealthService', () => {
  const originalCursor = PeerCursor.myCursor;
  let stealth: StealthService;

  function beSeat(role: PeerRole, userId = 'me'): void {
    PeerCursor.myCursor = { role, userId, identifier: 'seat' } as PeerCursor;
  }

  function pieceOwnedBy(owner: string): GameCharacter {
    const piece = GameCharacter.create('潜む者', 1, '');
    piece.owner = owner;
    return piece;
  }

  beforeEach(() => {
    stealth = TestBed.inject(StealthService);
  });

  afterEach(() => {
    PeerCursor.myCursor = originalCursor;
  });

  it('lets the game master put any piece into stealth and take it out', () => {
    beSeat(PeerRole.GameMaster);
    const piece = pieceOwnedBy('someone');

    stealth.set(piece, true);
    expect(piece.stealth).toBe('1');

    stealth.set(piece, false);
    expect(piece.stealth).toBe('');
  });

  it("lets a player put their own piece into stealth, and nobody else's", () => {
    beSeat(PeerRole.Player, 'me');
    const mine = pieceOwnedBy('me');
    const theirs = pieceOwnedBy('someone');
    const nobodys = pieceOwnedBy('');

    stealth.set(mine, true);
    stealth.set(theirs, true);
    stealth.set(nobodys, true);

    expect([mine.stealth, theirs.stealth, nobodys.stealth]).toEqual(['1', '', '']);
  });

  it('lets a guest do nothing, even with a piece in their name', () => {
    beSeat(PeerRole.Guest, 'me');
    const piece = pieceOwnedBy('me');

    expect(stealth.mayToggle(piece)).toBe(false);
    stealth.set(piece, true);
    expect(piece.stealth).toBe('');
  });
});
