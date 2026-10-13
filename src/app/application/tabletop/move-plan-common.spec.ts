import { TestBed } from '@angular/core/testing';
import { MoveNotice, tellTheRoomOf } from '@axe/application/tabletop/move-plan-common';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const CELL_MOVE: MoveNotice = { piece: 'p1', table: 't1', way: '1,2,3', jumping: 'true', points: '', kind: '全力' };
const FREE_MOVE: MoveNotice = { piece: 'p1', table: 't1', way: '', jumping: '', points: '0,0 50,0', kind: '' };

describe('telling the room of a move being worked out', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor();
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('puts every part of the move on the cursor', () => {
    tellTheRoomOf(CELL_MOVE);

    const cursor = PeerCursor.myCursor;
    expect(cursor.movingCharacterIdentifier).toBe('p1');
    expect(cursor.movingTableIdentifier).toBe('t1');
    expect(cursor.movingWay).toBe('1,2,3');
    expect(cursor.movingJumping).toBe('true');
    expect(cursor.movingKind).toBe('全力');
  });

  it('clears what a move of the other kind left, so a way of straight legs is not read with old cells', () => {
    tellTheRoomOf(CELL_MOVE);
    tellTheRoomOf(FREE_MOVE);

    const cursor = PeerCursor.myCursor;
    expect(cursor.movingWay).toBe('');
    expect(cursor.movingJumping).toBe('');
    expect(cursor.movingPoints).toBe('0,0 50,0');
  });

  it('sends nothing again where the cursor says it already', () => {
    tellTheRoomOf(CELL_MOVE);
    const update = vi.spyOn(PeerCursor.myCursor, 'update');

    tellTheRoomOf(CELL_MOVE);

    expect(update).not.toHaveBeenCalled();
  });
});
