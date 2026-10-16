export const DisclosureMode = {
  GameMaster: 'gm',
  Selected: 'selected',
  All: 'all',
} as const;

export type DisclosureMode = (typeof DisclosureMode)[keyof typeof DisclosureMode];

export const DEFAULT_DISCLOSURE_MODE: DisclosureMode = DisclosureMode.All;

export interface Disclosable {
  disclosureMode: string;
  disclosureUserIds: string[];
}

/** Whether a stored value is one of the three disclosure modes. */
export function isDisclosureMode(value: unknown): value is DisclosureMode {
  return value === DisclosureMode.GameMaster || value === DisclosureMode.Selected || value === DisclosureMode.All;
}

/**
 * Reads a stored disclosure mode, falling back to disclosing to everyone when the value is missing
 * or unknown.
 */
export function normalizeDisclosureMode(value: unknown): DisclosureMode {
  return isDisclosureMode(value) ? value : DEFAULT_DISCLOSURE_MODE;
}

export interface DisclosureViewer {
  userId: string;
  isGameMaster: boolean;
  ownerUserId?: string;
}

/**
 * Whether a viewer may see the contents of an object that limits who it is disclosed to.
 *
 * The game master and the object's own owner always may. Anyone else is settled by the mode:
 * everyone, nobody, or only the users picked in `disclosureUserIds`.
 */
export function canViewDisclosable(object: Disclosable, viewer: DisclosureViewer): boolean {
  if (viewer.isGameMaster) return true;
  if (viewer.ownerUserId && viewer.ownerUserId.length > 0 && viewer.ownerUserId === viewer.userId) return true;
  const mode = normalizeDisclosureMode(object.disclosureMode);
  if (mode === DisclosureMode.All) return true;
  if (mode === DisclosureMode.GameMaster) return false;
  return object.disclosureUserIds.includes(viewer.userId);
}

/**
 * Whether a viewer may change who an object is disclosed to: the game master, or the user who owns
 * the object.
 */
export function canEditDisclosure(viewer: DisclosureViewer): boolean {
  if (viewer.isGameMaster) return true;
  return !!viewer.ownerUserId && viewer.ownerUserId.length > 0 && viewer.ownerUserId === viewer.userId;
}

/**
 * Whether a viewer could take over an object nobody owns yet.
 *
 * Where a room server keeps back what the object hides, as it does a note's, only one the viewer
 * may see the contents of is theirs to take: owning it would show them what it keeps back, such as
 * the game master's alone, and the server refuses that. Among peers, where hiding is a matter of
 * what each screen shows, and for what the server does not hide, any of them is.
 *
 * Callers also check the viewer's role and that they have a user id.
 */
export function canClaimOwnership(object: Disclosable, viewer: DisclosureViewer, keptBackByServer: boolean): boolean {
  if (viewer.ownerUserId && viewer.ownerUserId.length > 0) return false;
  return !keptBackByServer || canViewDisclosable(object, viewer);
}

/**
 * Adds a user to the picked list, or takes them off it when already there. Returns a new array and
 * leaves the input alone.
 */
export function toggleDisclosureUserId(userIds: readonly string[], userId: string): string[] {
  return userIds.includes(userId) ? userIds.filter((id) => id !== userId) : [...userIds, userId];
}

/**
 * Where a key that switches several objects at once sends them: to everyone while any of them is
 * still kept from someone, and back to the game master alone once all of them are open.
 *
 * Picked players are never the answer, since a key has no way to say which players.
 */
export function switchedDisclosureMode(modes: readonly unknown[]): DisclosureMode {
  return modes.every((mode) => normalizeDisclosureMode(mode) === DisclosureMode.All)
    ? DisclosureMode.GameMaster
    : DisclosureMode.All;
}
