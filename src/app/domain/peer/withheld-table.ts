let heldAsSeatIn: string | null = null;
let heldFromSave = false;

/**
 * Whether the table held here has parts only in the shape a room server withholds from this seat:
 * so while it plays on a room server as anyone but the GM, and after loading a save marked so. It
 * outlives the link, as the table stays on screen after leaving the room. What the seat's role
 * withheld is put right by becoming the GM of that same room, which hands everything there over;
 * what a save brought in, only by loading a whole save over it.
 */
export function isTableWithheld(): boolean {
  return heldAsSeatIn !== null || heldFromSave;
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
  heldFromSave = withheld;
  if (!onServerAsPlayer) heldAsSeatIn = null;
}

/**
 * Whether going into the room of the given key would take parts of the table held here into it
 * only in their withheld shape, for them to spread there as they are. The room this seat was
 * handed them in holds them whole already, so going back there takes none in.
 */
export function carriesWithheldInto(roomKey: string | null): boolean {
  return heldFromSave || (heldAsSeatIn !== null && heldAsSeatIn !== roomKey);
}
