import { TabletopLocation } from '@axe/domain/tabletop/tabletop-object';

/**
 * Moves a follower, such as a light, onto the centre of the character it follows.
 *
 * It writes the follower's location directly, so on a synced object the move reaches every peer.
 */
export function centerFollowerOnCharacter(
  follower: { location: TabletopLocation },
  character: { location: TabletopLocation; size: number },
  gridSize: number
): void {
  follower.location.x = character.location.x + (gridSize * character.size) / 2;
  follower.location.y = character.location.y + (gridSize * character.size) / 2;
}
