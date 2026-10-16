import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';

/**
 * Holds that a panel closes once its seat is made a guest: `open` builds it while the seat is a
 * player, and the seat is then made a guest.
 */
export function expectClosesForAGuest(open: () => unknown): void {
  if (!PeerCursor.myCursor) PeerCursor.createMyCursor();
  PeerCursor.myCursor.role = PeerRole.Player;
  open();
  // The panel closes from an effect, which runs on the next tick, so it is watched from here.
  const closed = vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => {});
  TestBed.tick();
  expect(closed).not.toHaveBeenCalled();

  PeerCursor.myCursor.role = PeerRole.Guest;
  TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
  TestBed.tick();

  expect(closed).toHaveBeenCalled();
  closed.mockRestore();
}
