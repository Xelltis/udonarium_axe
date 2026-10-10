import { WallLight, WallSilhouette } from '@axe/domain/tabletop/vision-scene';

/** The CSS background image of a silhouette cast on a wall, or `none` when it has no picture. */
export function wallSilhouetteBackground(silhouette: WallSilhouette): string {
  return silhouette.imageUrl ? 'url(' + silhouette.imageUrl + ')' : 'none';
}

/**
 * The style for a pool of light on a wall face: a soft radial mask round the pool, brightened by
 * its intensity, and cut off below its shadow line when it has one.
 *
 * `mirror` flips the pool across a face `faceLen` pixels long, for faces drawn mirrored. A positive
 * `tilePx` tiles the wall's texture at that size rather than stretching it.
 */
export function wallLightLayerStyle(pool: WallLight, mirror = false, faceLen = 0, tilePx = 0): Record<string, string> {
  const cx = mirror ? faceLen - pool.localX : pool.localX;
  const mask =
    'radial-gradient(' +
    pool.radiusX +
    'px ' +
    pool.radiusY +
    'px at ' +
    cx +
    'px ' +
    pool.localY +
    'px, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 78%)';
  const style: Record<string, string> = {
    position: 'absolute',
    inset: '0',
    'background-size': tilePx > 0 ? tilePx + 'px ' + tilePx + 'px' : '100% 100%',
    'background-repeat': tilePx > 0 ? 'repeat' : 'no-repeat',
    filter: 'brightness(' + (0.7 + 0.3 * pool.intensity).toFixed(3) + ')',
    'mask-image': mask,
    '-webkit-mask-image': mask,
  };
  const shadow = pool.shadow;
  if (shadow && shadow.length > 1) {
    const line = mirror ? shadow.map((point) => ({ x: faceLen - point.x, y: point.y })).reverse() : shadow;
    const corners = [
      line[0].x.toFixed(2) + 'px 0px',
      line[line.length - 1].x.toFixed(2) + 'px 0px',
      ...line.map((point) => point.x.toFixed(2) + 'px ' + point.y.toFixed(2) + 'px').reverse(),
    ];
    style['clip-path'] = 'polygon(' + corners.join(', ') + ')';
  }
  return style;
}

/**
 * The style that stands a silhouette on the bottom edge of a wall face, centred on its position.
 *
 * With a picture it is the picture blacked out and blurred; without one it is a blurred dark oval.
 * `mirror` flips its position across a face `faceLen` pixels long.
 */
export function wallSilhouetteStyle(silhouette: WallSilhouette, mirror = false, faceLen = 0): Record<string, string> {
  const hasImage = silhouette.imageUrl.length > 0;
  const center = mirror ? faceLen - silhouette.localX : silhouette.localX;
  return {
    position: 'absolute',
    left: center - silhouette.width / 2 + 'px',
    bottom: '0px',
    width: silhouette.width + 'px',
    height: silhouette.height + 'px',
    opacity: String(silhouette.alpha),
    'background-size': '100% 100%',
    'background-repeat': 'no-repeat',
    'background-color': hasImage ? 'transparent' : 'rgba(0, 0, 0, 0.85)',
    'border-radius': hasImage ? '0' : '50%',
    filter: hasImage ? 'brightness(0) blur(2px)' : 'blur(5px)',
  };
}
