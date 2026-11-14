import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';

/**
 * Places an unlocked copy of a mask one cell down and to the right of it, beside it under the same
 * parent, and sends the copy where it stands to every peer.
 */
export function copyMask(mask: GameTableMask, gridSize: number): GameTableMask {
  const copy = mask.clone();
  copy.location.x += gridSize;
  copy.location.y += gridSize;
  copy.isLock = false;
  if (mask.parent) mask.parent.appendChild(copy);
  copy.update();
  return copy;
}
