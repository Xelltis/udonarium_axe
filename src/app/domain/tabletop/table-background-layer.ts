import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';

/** How many layers a table may lay, under and over it together. */
export const MAX_TABLE_BACKGROUND_LAYERS = 6;

export const TABLE_LAYER_PLACEMENTS = ['under', 'over', 'backdrop'] as const;

/**
 * Where a layer is drawn: under the board, over it, or behind the whole table as a backdrop that
 * follows the camera a little.
 */
export type TableLayerPlacement = (typeof TABLE_LAYER_PLACEMENTS)[number];

/** Beneath, which is what a background is. */
export const DEFAULT_TABLE_LAYER_PLACEMENT: TableLayerPlacement = 'under';

/** How much a backdrop follows the camera when nobody has said: enough to be seen to move. */
export const DEFAULT_BACKDROP_FOLLOW = 0.3;

/** Where a backdrop's picture stands when nobody has said: its foot on the foot of the screen. */
export const DEFAULT_BACKDROP_HEIGHT = 0;

/**
 * A stored fraction from 0 to 1, or the default for anything that is not a number.
 *
 * An empty value is not read as nought: here nought means a backdrop that never moves, or one
 * standing at the very foot of the screen, and a peer that never sent the field asked for neither.
 */
function unitOr(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

/** Reads a stored layer placement, falling back to under the board for anything unknown. */
export function asTableLayerPlacement(value: unknown): TableLayerPlacement {
  return typeof value === 'string' && (TABLE_LAYER_PLACEMENTS as readonly string[]).includes(value)
    ? (value as TableLayerPlacement)
    : DEFAULT_TABLE_LAYER_PLACEMENT;
}

/**
 * A picture drifting past the board.
 *
 * A table drawn on a transparent picture shows whatever is beneath it, and what is beneath can
 * move: cloud below an airship, ground below the cloud, each at its own pace. A layer can also be
 * laid over the board, where it passes above the ground but still under everything standing on
 * it. The layers are the table's own, so everyone in the room sees the same sky; only how far
 * along each has drifted is left to the browser, since nobody counts the frames.
 *
 * The picture is always laid edge to edge in both directions. A drift is one tile passing, so a
 * layer that does not repeat has nothing to pass.
 */
@SyncObject('table-background-layer')
export class TableBackgroundLayer extends ObjectNode {
  @SyncVar() imageIdentifier: string = 'imageIdentifier';
  @SyncVar() enabled: boolean = true;
  /** Smaller is further back. Ties keep the order the table already had them in. */
  @SyncVar() order: number = 0;
  /** Pixels a second. A negative speed drifts the other way; zero stands still. */
  @SyncVar() speedX: number = 0;
  @SyncVar() speedY: number = 0;
  @SyncVar() opacity: number = 1;
  /** What the picture is drawn at, against the size it was made. */
  @SyncVar() scale: number = 1;
  @SyncVar() placement: string = DEFAULT_TABLE_LAYER_PLACEMENT;
  /**
   * How much a backdrop follows the camera, from 0, which stands still like a picture on the far
   * wall, to 1, which goes once round the picture for each turn of the table. Only a backdrop uses it.
   */
  @SyncVar() cameraFollow: number = DEFAULT_BACKDROP_FOLLOW;
  /** How high a backdrop's picture stands, as a share of the screen from its foot. Only a backdrop uses it. */
  @SyncVar() backdropHeight: number = DEFAULT_BACKDROP_HEIGHT;

  /** Whether it is drawn over the board, whatever the room happened to send. */
  get placedOver(): boolean {
    return asTableLayerPlacement(this.placement) === 'over';
  }

  /** Whether it is drawn behind the whole table as a backdrop, whatever the room happened to send. */
  get placedBackdrop(): boolean {
    return asTableLayerPlacement(this.placement) === 'backdrop';
  }

  /** How much a backdrop follows the camera, from 0 to 1, whatever the room happened to send. */
  get follow(): number {
    return unitOr(this.cameraFollow, DEFAULT_BACKDROP_FOLLOW);
  }

  /** How high a backdrop stands, from 0 at the foot of the screen to 1 at its top, whatever the room happened to send. */
  get height(): number {
    return unitOr(this.backdropHeight, DEFAULT_BACKDROP_HEIGHT);
  }
}

/**
 * One layer moved a step through the run it is drawn in.
 *
 * A move at either end is no move at all, which is what a button greyed out at the end means.
 */
export function moveBackgroundLayer(
  layers: readonly TableBackgroundLayer[],
  index: number,
  offset: number
): TableBackgroundLayer[] {
  const to = index + offset;
  if (index < 0 || index >= layers.length || to < 0 || to >= layers.length) return [...layers];

  const moved = [...layers];
  const [layer] = moved.splice(index, 1);
  moved.splice(to, 0, layer);
  return moved;
}
