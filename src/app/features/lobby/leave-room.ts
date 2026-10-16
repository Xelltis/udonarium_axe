import { Network } from '@axe/core/network/network';

/**
 * Leaves the room server's room this page is in by loading the page afresh without the invitation
 * its address may still carry, which would otherwise take the reloaded page straight back in. The
 * room's table stays on the server, so the browser does not ask whether to leave the page: a reader
 * who said no there would stay in the room with the invitation gone from the address.
 */
export function leaveRoomByReloading(win: Window = window): void {
  Network.letPageGo();
  const { pathname, search } = win.location;
  win.history.replaceState(null, '', pathname + search);
  win.location.reload();
}
