let tableWithheld = false;

/**
 * Whether the table held here has parts only in the shape a room server withholds from this seat:
 * so while it plays on a room server as anyone but the GM, and after loading a save marked so. It
 * outlives the link, as the table stays on screen after leaving the room, and is put right only by
 * becoming the GM there, which hands everything over, or by loading a whole save.
 */
export function isTableWithheld(): boolean {
  return tableWithheld;
}

/** Says whether the table held here is now withheld in part, or whole again. */
export function markTableWithheld(withheld: boolean): void {
  tableWithheld = withheld;
}
