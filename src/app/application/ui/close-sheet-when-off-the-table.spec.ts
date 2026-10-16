import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BottomSheetRef } from '@axe/application/ui/bottom-sheet.service';
import { closeSheetWhenOffTheTable } from '@axe/application/ui/close-sheet-when-off-the-table';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

@Component({ selector: 'off-the-table-sheet-host', template: '' })
class HostComponent {
  constructor() {
    closeSheetWhenOffTheTable();
  }
}

describe('closeSheetWhenOffTheTable', () => {
  beforeEach(() => {
    PeerCursor.createMyCursor();
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
  });

  function makeGuest(): void {
    PeerCursor.myCursor.role = PeerRole.Guest;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    TestBed.tick();
  }

  it('closes the sheet from the bottom once its seat is made a guest, and leaves it open before', () => {
    const ref = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [...TEST_PROVIDERS, { provide: BottomSheetRef, useValue: ref }],
    });
    TestBed.createComponent(HostComponent);
    TestBed.tick();
    expect(ref.close).not.toHaveBeenCalled();

    makeGuest();

    expect(ref.close).toHaveBeenCalled();
  });

  it('does nothing shown outside a sheet from the bottom', () => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [...TEST_PROVIDERS] });
    TestBed.createComponent(HostComponent);

    expect(() => makeGuest()).not.toThrow();
  });
});
