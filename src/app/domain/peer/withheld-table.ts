let heldAsSeatIn: string | null = null;
let heldFromElsewhere = false;

/**
 * Whether the table held here has parts only in the shape a room server withholds from this seat:
 * so while it plays on a room server as anyone but the GM, after loading a save marked so, and
 * after taking such a table into a room. It outlives the link, as the table stays on screen after
 * leaving the room. What the seat's role withheld is put right by becoming the GM of that same
 * room, which hands everything there over; what came from elsewhere, only by loading a whole save
 * over it.
 */
export function isTableWithheld(): boolean {
  return heldAsSeatIn !== null || heldFromElsewhere;
}

/**
 * Whether parts of the table came withheld from elsewhere than this seat's role where it is: a
 * marked save loaded, or a table taken into a room with such parts. No role puts them right, so
 * only what they lack tells them, even for the GM.
 */
export function holdsWithheldFromElsewhere(): boolean {
  return heldFromElsewhere;
}

/**
 * Says the table with withheld parts was taken into a room as it was, where they now stand as the
 * room's own: being given any role there puts them right no more than loading them would.
 */
export function markTakenInWithheld(): void {
  heldFromElsewhere = true;
}

/**
 * Says whether the role this seat now has in the room of the given key on a room server is handed
 * part of the table withheld. Being the GM of another room, or of a new one the table was taken
 * into, hands over only that room's, so what the table held withheld stays so.
 */
export function markSeatWithheld(withheld: boolean, roomKey: string): void {
  if (withheld) heldAsSeatIn = roomKey;
  else if (heldAsSeatIn === roomKey) heldAsSeatIn = null;
}

/**
 * Says whether a save loaded over the table brought part of it in withheld. A whole one loaded away
 * from a room server, where nothing withholds, leaves the table whole.
 */
export function markLoadedWithheld(withheld: boolean, onServerAsPlayer: boolean): void {
  heldFromElsewhere = withheld;
  if (!onServerAsPlayer) heldAsSeatIn = null;
}

/**
 * Whether going into the room of the given key would take parts of the table held here into it
 * only in their withheld shape, for them to spread there as they are. The room this seat was
 * handed them in holds them whole already, so going back there takes none in.
 */
export function carriesWithheldInto(roomKey: string | null): boolean {
  return heldFromElsewhere || (heldAsSeatIn !== null && heldAsSeatIn !== roomKey);
}
