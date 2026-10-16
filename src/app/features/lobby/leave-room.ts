/**
 * Leaves the room server's room this page is in by loading the page afresh without the invitation
 * its address may still carry, which would otherwise take the reloaded page straight back in. The
 * room's table stays on the server.
 */
export function leaveRoomByReloading(win: Window = window): void {
  const { pathname, search } = win.location;
  win.history.replaceState(null, '', pathname + search);
  win.location.reload();
}
