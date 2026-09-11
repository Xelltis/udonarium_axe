import { firstPersonTarget, sharedViewPieceOf } from '@axe/domain/tabletop/first-person/first-person-target';
import { describe, expect, it } from 'vitest';

describe('sharedViewPieceOf', () => {
  it('reads a table saved before there was one as naming no piece', () => {
    expect(sharedViewPieceOf({})).toBe('');
    expect(sharedViewPieceOf(null)).toBe('');
    expect(sharedViewPieceOf(undefined)).toBe('');
  });

  it('reads anything but a name as no piece, nought included', () => {
    expect(sharedViewPieceOf({ sharedViewPiece: 0 })).toBe('');
    expect(sharedViewPieceOf({ sharedViewPiece: true })).toBe('');
    expect(sharedViewPieceOf({ sharedViewPiece: '   ' })).toBe('');
  });

  it('reads the name a table was given', () => {
    expect(sharedViewPieceOf({ sharedViewPiece: 'piece-1' })).toBe('piece-1');
  });
});

describe('firstPersonTarget', () => {
  const usable = (piece: string) => piece === 'party' || piece === 'mine';

  it('puts a player on the piece the table names, over the one they chose', () => {
    expect(firstPersonTarget({ shared: 'party', seat: 'mine', isGameMaster: false, gmPresent: true }, usable)).toEqual({
      piece: 'party',
      shared: true,
    });
  });

  it('leaves the game master looking where they chose, or at the table', () => {
    expect(firstPersonTarget({ shared: 'party', seat: 'mine', isGameMaster: true, gmPresent: true }, usable)).toEqual({
      piece: 'mine',
      shared: false,
    });
    expect(firstPersonTarget({ shared: 'party', seat: '', isGameMaster: true, gmPresent: true }, usable)).toBeNull();
  });

  it('lets the players go when no game master is in the room to let them go', () => {
    expect(firstPersonTarget({ shared: 'party', seat: '', isGameMaster: false, gmPresent: false }, usable)).toBeNull();
    expect(firstPersonTarget({ shared: 'party', seat: 'mine', isGameMaster: false, gmPresent: false }, usable)).toEqual(
      {
        piece: 'mine',
        shared: false,
      }
    );
  });

  it('falls back to the seat when the named piece cannot be shown', () => {
    expect(firstPersonTarget({ shared: 'gone', seat: 'mine', isGameMaster: false, gmPresent: true }, usable)).toEqual({
      piece: 'mine',
      shared: false,
    });
  });

  it('shows the table when neither piece can be shown', () => {
    expect(
      firstPersonTarget({ shared: 'gone', seat: 'lost', isGameMaster: false, gmPresent: true }, usable)
    ).toBeNull();
    expect(firstPersonTarget({ shared: '', seat: '', isGameMaster: false, gmPresent: true }, usable)).toBeNull();
  });
});
