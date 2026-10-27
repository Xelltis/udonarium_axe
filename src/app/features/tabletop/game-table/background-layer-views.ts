import { BackdropPlacement } from '@axe/application/ui/backdrop-frame.service';
import { BackdropCamera, backdropOffset } from '@axe/domain/tabletop/backdrop-offset';
import {
  backgroundScrollAnimation,
  backgroundScrollMargin,
  backgroundTileSize,
} from '@axe/domain/tabletop/background-scroll';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';

/** One picture drifting under or over the board, ready to be drawn. */
export interface BackgroundLayerView {
  readonly identifier: string;
  readonly imageIdentifier: string;
  readonly imageUrl: string;
  readonly style: Record<string, string>;
  readonly drifts: boolean;
}

/** One backdrop as the screen behind the table draws it. */
export interface BackdropLayerView {
  readonly identifier: string;
  readonly imageIdentifier: string;
  readonly imageUrl: string;
  /** Where the picture stands on the screen and how tall it is drawn. */
  readonly frameStyle: Record<string, string>;
  /** How wide the part that follows the camera is, the screen and two pictures to spare, and how its edges fade. */
  readonly followStyle: Record<string, string>;
  readonly style: Record<string, string>;
  readonly drifts: boolean;
  /** Where the part that follows the camera is moved for the way the camera stands. */
  readonly place: BackdropPlacement;
}

/** What drawing a run of layers reads beside the layers themselves. */
export interface LayerDrawing {
  /** The picture a layer wears, by its identifier; empty for one not in the store. */
  readonly imageUrlOf: (imageIdentifier: string) => string;
  /** How large each picture really is, once the browser has loaded it, by its identifier. */
  readonly naturalSizes: ReadonlyMap<string, { width: number; height: number }>;
  /** Whether things on the table may move, which a reader who asks for less motion turns off. */
  readonly moving: boolean;
}

/**
 * The largest a backdrop's picture is drawn, either way. A backdrop is not held to the board, and
 * the spare it needs for following the camera and drifting is a picture wide each, so a picture
 * blown up past this would ask for a sheet of no use to anyone.
 */
const MAX_BACKDROP_TILE_PX = { width: 4096, height: 4096 };

/**
 * How a backdrop's picture fades out at its top and its foot, so a picture that is not clear at
 * its edges does not end in a hard line across the screen. It is laid on the part that follows the
 * camera, so the fade goes up and down with the picture as the view tilts.
 */
const BACKDROP_EDGE_FADE = 'linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%)';

/**
 * What one run of layers under or over the board is drawn as, each tile held to the size the board
 * is drawn at.
 *
 * Nothing here says how deep a layer sits. The wrapper hides what overflows it, which flattens
 * everything inside into one plane, so within a run it is document order that decides — and
 * that is already back to front. The run as a whole carries the depth.
 *
 * One box a layer, whichever way it drifts. Across runs on `transform` and down runs on
 * `translate`, so the two never write over each other and a layer going both ways still asks
 * the machine for the one surface to composite.
 */
export function backgroundLayerViews(
  layers: readonly TableBackgroundLayer[],
  drawing: LayerDrawing,
  board: { width: number; height: number }
): BackgroundLayerView[] {
  return layers.map((layer) => {
    const tile = backgroundTileSize(drawing.naturalSizes.get(layer.imageIdentifier) ?? null, layer.scale, board);
    const x = drawing.moving ? backgroundScrollAnimation(layer.speedX, tile?.width ?? 0) : null;
    const y = drawing.moving ? backgroundScrollAnimation(layer.speedY, tile?.height ?? 0) : null;
    const scrollsX = !!x && x.durationSeconds > 0;
    const scrollsY = !!y && y.durationSeconds > 0;
    // Spare cloth for the drift to pull in, on the side it is heading for and nowhere else.
    const margin = backgroundScrollMargin(tile, scrollsX, scrollsY);
    const imageUrl = drawing.imageUrlOf(layer.imageIdentifier);

    return {
      identifier: layer.identifier,
      imageIdentifier: layer.imageIdentifier,
      imageUrl,
      style: {
        inset: `0px ${-margin.x}px ${-margin.y}px 0px`,
        'background-image': `url(${imageUrl})`,
        'background-repeat': 'repeat',
        ...(tile ? { 'background-size': `${tile.width}px ${tile.height}px` } : {}),
        // Anything short of whole makes a group of its own to composite, so say it only when
        // the layer actually asked to be seen through.
        ...(layer.opacity < 1 ? { opacity: `${layer.opacity}` } : {}),
        ...(x && scrollsX
          ? {
              '--bg-layer-x-name': 'bgLayerScrollX',
              '--bg-layer-x-duration': `${x.durationSeconds}s`,
              '--bg-layer-x-direction': x.reversed ? 'reverse' : 'normal',
              '--bg-layer-tile-w': `${tile?.width ?? 0}px`,
            }
          : {}),
        ...(y && scrollsY
          ? {
              '--bg-layer-y-name': 'bgLayerScrollY',
              '--bg-layer-y-duration': `${y.durationSeconds}s`,
              '--bg-layer-y-direction': y.reversed ? 'reverse' : 'normal',
              '--bg-layer-tile-h': `${tile?.height ?? 0}px`,
            }
          : {}),
      },
      drifts: scrollsX || scrollsY,
    };
  });
}

/**
 * What the backdrops behind the table are drawn as, back to front.
 *
 * A backdrop is laid across the screen rather than on the board, and only across: a range of
 * hills is one long picture, and laid upward as well it would stand on its own head. It drifts
 * across as an under layer does, and the part around the drift is moved for the camera.
 */
export function backdropLayerViews(
  layers: readonly TableBackgroundLayer[],
  drawing: LayerDrawing
): BackdropLayerView[] {
  return layers.map((layer) => {
    const tile = backgroundTileSize(
      drawing.naturalSizes.get(layer.imageIdentifier) ?? null,
      layer.scale,
      MAX_BACKDROP_TILE_PX
    );
    const x = drawing.moving ? backgroundScrollAnimation(layer.speedX, tile?.width ?? 0) : null;
    const scrollsX = !!x && x.durationSeconds > 0;
    const imageUrl = drawing.imageUrlOf(layer.imageIdentifier);
    const width = tile?.width ?? 0;
    const follow = layer.follow;
    return {
      identifier: layer.identifier,
      imageIdentifier: layer.imageIdentifier,
      imageUrl,
      frameStyle: {
        bottom: `${+(layer.height * 100).toFixed(2)}%`,
        ...(tile ? { height: `${tile.height}px` } : { height: '0px' }),
        ...(layer.opacity < 1 ? { opacity: `${layer.opacity}` } : {}),
      },
      followStyle: {
        width: `calc(100% + ${width * 2}px)`,
        'mask-image': BACKDROP_EDGE_FADE,
        '-webkit-mask-image': BACKDROP_EDGE_FADE,
      },
      style: {
        'background-image': `url(${imageUrl})`,
        'background-repeat': 'repeat-x',
        'background-position': 'left bottom',
        ...(tile ? { 'background-size': `${tile.width}px ${tile.height}px` } : {}),
        ...(x && scrollsX
          ? {
              '--bg-layer-x-name': 'bgLayerScrollX',
              '--bg-layer-x-duration': `${x.durationSeconds}s`,
              '--bg-layer-x-direction': x.reversed ? 'reverse' : 'normal',
              '--bg-layer-tile-w': `${width}px`,
            }
          : {}),
      },
      drifts: scrollsX,
      place: (camera: BackdropCamera) => {
        const offset = backdropOffset(camera, follow, width);
        return `translate3d(${offset.x}px, ${offset.y}px, 0px)`;
      },
    };
  });
}
