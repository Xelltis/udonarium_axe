let heldAsSeat = false;
let heldFromSave = false;

/**
 * Whether the table held here has parts only in the shape a room server withholds from this seat:
 * so while it plays on a room server as anyone but the GM, and after loading a save marked so. It
 * outlives the link, as the table stays on screen after leaving the room. What the seat's role
 * withheld is put right by becoming the GM there, which hands everything over; what a save brought
 * in, only by loading a whole save over it.
 */
export function isTableWithheld(): boolean {
  return heldAsSeat || heldFromSave;
}

/** Says whether the role this seat now has on a room server is handed part of the table withheld. */
export function markSeatWithheld(withheld: boolean): void {
  heldAsSeat = withheld;
}

/**
 * Says whether a save loaded over the table brought part of it in withheld. A whole one loaded away
 * from a room server, where nothing withholds, leaves the table whole.
 */
export function markLoadedWithheld(withheld: boolean, onServerAsPlayer: boolean): void {
  heldFromSave = withheld;
  if (!onServerAsPlayer) heldAsSeat = false;
}
