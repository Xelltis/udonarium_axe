import { TestBed } from '@angular/core/testing';
import { ResetUndoService } from '@axe/application/character/reset-undo.service';
import { emitResetCarriedOut } from '@axe/core/event/domain-events';
import type { ResetRecord } from '@axe/domain/character/piece-reset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ResetUndoEventHandlerService } from '@axe/features/character/reset-undo/reset-undo-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ResetUndoEventHandlerService', () => {
  const originalCursor = PeerCursor.myCursor;
  const record: ResetRecord = {
    pieces: [{ piece: 'gone', buffsBefore: [], buffsAfter: [], held: {}, changes: [] }],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    PeerCursor.myCursor = { role: PeerRole.Player, userId: 'me', identifier: 'seat' } as PeerCursor;
    TestBed.inject(ResetUndoService).forget();
  });

  afterEach(() => {
    PeerCursor.myCursor = originalCursor;
    TestBed.inject(ResetUndoService).forget();
  });

  it('keeps what a reset carried out on this device did, under the line that reports it', () => {
    TestBed.inject(ResetUndoEventHandlerService);

    emitResetCarriedOut({ messageIdentifier: 'line-1', record });

    expect(TestBed.inject(ResetUndoService).isOffered('line-1')).toBe(true);
  });

  it('lets the next reset take the place of the one kept', () => {
    TestBed.inject(ResetUndoEventHandlerService);

    emitResetCarriedOut({ messageIdentifier: 'line-1', record });
    emitResetCarriedOut({ messageIdentifier: 'line-2', record });

    expect(TestBed.inject(ResetUndoService).isOffered('line-1')).toBe(false);
    expect(TestBed.inject(ResetUndoService).isOffered('line-2')).toBe(true);
  });

  it('keeps nothing until it is made, which the page does as it starts', () => {
    emitResetCarriedOut({ messageIdentifier: 'line-1', record });

    expect(TestBed.inject(ResetUndoService).isOffered('line-1')).toBe(false);
  });
});
