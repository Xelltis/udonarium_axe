/** Takes the invitation off the page's address, which would take the page reloaded back into its room. */
export function dropInvitationFromAddress(win: Window = window): void {
  const { pathname, search } = win.location;
  win.history.replaceState(null, '', pathname + search);
}
