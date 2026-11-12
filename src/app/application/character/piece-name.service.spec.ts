import { TestBed } from '@angular/core/testing';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('PieceNameService', () => {
  const original = PeerCursor.myCursor;
  let names: PieceNameService;

  function seatAs(role: PeerRole, userId = 'player-1'): void {
    PeerCursor.myCursor = {
      identifier: 'piece-name-spec-cursor',
      userId,
      role,
      isGameMaster: role === PeerRole.GameMaster,
    } as PeerCursor;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    names = TestBed.inject(PieceNameService);
  });

  afterEach(() => {
    PeerCursor.myCursor = original;
  });

  it('shows a hidden name to a game master and the label to a player, and says the label to the room either way', () => {
    const villain = { name: '黒幕', hideName: true };

    seatAs(PeerRole.GameMaster);
    expect([names.shown(villain), names.said(villain), names.isKept(villain)]).toEqual(['黒幕', '？？？', false]);

    seatAs(PeerRole.Player);
    expect([names.shown(villain), names.said(villain), names.isKept(villain)]).toEqual(['？？？', '？？？', true]);
  });

  it('shows a player the hidden name of their own piece, and still says the label to the room', () => {
    const mine = { name: '仮面の剣士', hideName: true, owner: 'player-1' };
    seatAs(PeerRole.Player);

    expect([names.shown(mine), names.said(mine), names.isKept(mine)]).toEqual(['仮面の剣士', '？？？', false]);
    seatAs(PeerRole.Player, 'player-2');
    expect(names.isKept(mine)).toBe(true);
  });
});
