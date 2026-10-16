import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import { PanelService } from '@axe/application/ui/panel.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

@Component({ selector: 'off-the-table-host', template: '' })
class HostComponent {
  constructor() {
    closeWhenOffTheTable();
  }
}

describe('closeWhenOffTheTable', () => {
  beforeEach(() => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [...TEST_PROVIDERS] });
  });

  it('closes the panel once its seat is made a guest, and leaves it open before', () => {
    const closed = vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => {});
    TestBed.createComponent(HostComponent);
    TestBed.tick();
    expect(closed).not.toHaveBeenCalled();

    PeerCursor.myCursor.role = PeerRole.Guest;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    TestBed.tick();

    expect(closed).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
