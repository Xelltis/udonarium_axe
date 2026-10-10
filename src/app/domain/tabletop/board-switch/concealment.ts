import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';

/**
 * Where a piece, a note or a die put out of sight by the master is kept.
 *
 * Kept where it stood, only under a place no view of the table draws: whatever brings it back sets
 * it down exactly where the master left it. A version that has never heard of the place lists what
 * is in it with the room's shared things, which is where it lists any place it does not know.
 */
export const CONCEALED_LOCATION = 'concealed';

/**
 * Where a table keeps the blocks and covers the master has put out of sight.
 *
 * A table draws only what hangs directly under it, so a block moved in here is gone from the view,
 * from the way pieces walk and from what can be seen, and comes back as it was when it is moved out
 * again. It is saved with its table. A version that has never heard of it passes over it, and what
 * it holds with it: out of sight stays out of sight there too.
 */
@SyncObject('board-stash')
export class BoardStash extends ObjectNode {}

/** The place a table keeps what is out of sight, or null where it keeps nothing yet. */
export function stashOf(table: ObjectNode | null | undefined): BoardStash | null {
  if (!table) return null;
  for (const child of table.children) if (child instanceof BoardStash) return child;
  return null;
}
