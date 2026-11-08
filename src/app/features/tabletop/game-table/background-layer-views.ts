import { BackdropPlacement } from '@axe/application/ui/backdrop-frame.service';
import { BackdropCamera, backdropOffset } from '@axe/domain/tabletop/backdrop-offset';
import { backgroundScrollAnimation, backgroundTileSize } from '@axe/domain/tabletop/background-scroll';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';

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
