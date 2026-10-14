/** The version a synced object carries: changes counted whole, with a random fraction to break ties. */
export interface ObjectVersion {
  majorVersion: number;
  minorVersion: number;
}

/**
 * Whether an incoming copy of an object is to replace the one held, at `storedVersion`
 * (major plus minor). Only a strictly larger sum wins, the rule the room server follows too.
 */
export function isNewerVersion(incoming: ObjectVersion, storedVersion: number): boolean {
  return incoming.majorVersion + incoming.minorVersion > storedVersion;
}
