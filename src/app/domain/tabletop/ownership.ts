import { getPeerContexts } from '@axe/core/network/peer-context-source';
import { ObjectNode } from '@axe/core/sync/object-node';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';

export type OwnableObject = OwnedTabletopObject | GameTableMask;

type PeerContextLike = { userId: string; isOpen: boolean };

/**
 * The object as something that can be owned, or null when it is not a kind of piece that carries an
 * owner.
 */
export function asOwnable(object: unknown): OwnableObject | null {
  return object instanceof OwnedTabletopObject || object instanceof GameTableMask ? object : null;
}

/**
 * Releases every owned object in the list and returns how many were released. Clearing an owner is
 * a synced change.
 */
export function clearOwnership(objects: Iterable<unknown>): number {
  let count = 0;
  for (const object of objects) {
    const ownable = asOwnable(object);
    if (ownable && ownable.owner.length > 0) {
      ownable.owner = '';
      count++;
    }
  }
  return count;
}

/**
 * Releases the owner of an object and of everything nested under it, and returns how many were
 * released.
 */
export function clearOwnershipTree(root: ObjectNode): number {
  let count = clearOwnership([root]);
  for (const child of root.children) count += clearOwnershipTree(child);
  return count;
}

/**
 * Hands a piece brought in from a file to whoever brought it in.
 *
 * A character becomes theirs, as one they made on the table would. Everything else, and all that
 * is nested under the piece, is left with no owner: for a card, a stack or a die the owner is the
 * one holding it, and holding it keeps its face from everyone else.
 */
export function claimBroughtInPiece(root: ObjectNode, userId: string): void {
  clearOwnershipTree(root);
  if (root instanceof GameCharacter) root.owner = userId;
}

/**
 * The objects owned by a user who is not connected, judged against the current peer contexts unless
 * others are given.
 */
export function findOrphanedOwnership(
  objects: Iterable<unknown>,
  peerContexts: readonly PeerContextLike[] = getPeerContexts()
): OwnableObject[] {
  const orphaned: OwnableObject[] = [];
  for (const object of objects) {
    const ownable = asOwnable(object);
    if (ownable && ownable.owner.length > 0 && !peerContexts.some((p) => p.userId === ownable.owner && p.isOpen)) {
      orphaned.push(ownable);
    }
  }
  return orphaned;
}

/** Releases every object whose owner is not connected, and returns how many were released. */
export function releaseOrphanedOwnership(
  objects: Iterable<unknown>,
  peerContexts: readonly PeerContextLike[] = getPeerContexts()
): number {
  const orphaned = findOrphanedOwnership(objects, peerContexts);
  for (const object of orphaned) object.owner = '';
  return orphaned.length;
}
