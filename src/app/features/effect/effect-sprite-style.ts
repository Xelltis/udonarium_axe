import { EffectParticleLayer } from '@axe/domain/effect/effect-particles';
import { EffectSprite, Point3 } from '@axe/domain/effect/effect-timeline';
import { ViewRotation } from '@axe/domain/effect/effect-view';

/**
 * How far towards the camera an effect sits, in pixels.
 * A billboard sits at the same depth as the pieces and their names, so without a nudge
 * forwards it disappears behind a label, or into the board, and the effect looks broken.
 */
export const EFFECT_CAMERA_LIFT_PX = 40;

/**
 * How the effects are looked at: the way the board is turned, which a billboard undoes to face
 * the camera, how far towards the camera a billboard sits, and how far off the board the upright
 * and the flat parts rise.
 */
export interface EffectViewpoint {
  rotation: ViewRotation | null;
  liftPx: number;
  risePx: number;
  flatRisePx: number;
}

/** A canvas of glowing particles placed on the board, facing the camera. */
export interface EffectCanvasPlacement {
  key: string;
  layer: EffectParticleLayer;
  transform: string;
  width: number;
  height: number;
}

/** Whether a sprite has an inner layer to carry its look and its animation. */
export function hasEffectPaintLayer(sprite: EffectSprite): boolean {
  return sprite.animation.length > 0 || sprite.svg.length > 0;
}

/** The outer layer of a sprite, which only places it in space and fades it out. */
export function effectSpriteStyle(sprite: EffectSprite, viewpoint: EffectViewpoint): Record<string, string> {
  const style: Record<string, string> = {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: sprite.width + 'px',
    height: sprite.height + 'px',
    opacity: sprite.opacity.toFixed(3),
    'transform-origin': '0 0',
    transform: effectSpriteTransform(sprite, viewpoint),
    'pointer-events': 'none',
  };
  if (!hasEffectPaintLayer(sprite)) Object.assign(style, effectPaint(sprite));
  return style;
}

/** The inner layer of a sprite, which carries the look and the animation. */
export function effectPaintStyle(sprite: EffectSprite): Record<string, string> {
  const style = effectPaint(sprite);
  if (sprite.animation.length > 0) style['animation'] = sprite.animation;
  style['transform-origin'] = sprite.origin.length > 0 ? sprite.origin : '50% 50%';
  return style;
}

/** Where a canvas of particles stands, sized to its layer. */
export function effectCanvasStyle(placement: EffectCanvasPlacement): Record<string, string> {
  return {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: placement.width + 'px',
    height: placement.height + 'px',
    'transform-origin': '0 0',
    transform: placement.transform,
    'pointer-events': 'none',
  };
}

/** Stands a layer of particles at a point on the board, facing the camera, its origin on the point. */
export function effectBillboardTransform(
  center: Point3,
  layer: EffectParticleLayer,
  viewpoint: EffectViewpoint
): string {
  const rotation = viewpoint.rotation;
  return (
    `translate3d(${center.x}px, ${center.y}px, ${center.z + viewpoint.risePx}px)` +
    ` rotateZ(${-(rotation?.z ?? 10)}deg) rotateX(${-(rotation?.x ?? 50)}deg) rotateY(${-(rotation?.y ?? 0)}deg)` +
    ` translateZ(${viewpoint.liftPx}px) translate(${-layer.originX}px, ${-layer.originY}px)`
  );
}

function effectSpriteTransform(sprite: EffectSprite, viewpoint: EffectViewpoint): string {
  const rise = sprite.flat ? viewpoint.flatRisePx : viewpoint.risePx;
  const parts = [`translate3d(${sprite.x}px, ${sprite.y}px, ${sprite.z + rise}px)`];

  if (!sprite.flat) {
    const rotation = viewpoint.rotation;
    parts.push(
      `rotateZ(${-(rotation?.z ?? 10)}deg)`,
      `rotateX(${-(rotation?.x ?? 50)}deg)`,
      `rotateY(${-(rotation?.y ?? 0)}deg)`,
      `translateZ(${viewpoint.liftPx}px)`
    );
  }
  // The offset is applied inside the billboard, so the arrangement holds as the camera turns.
  if (sprite.offsetX !== 0 || sprite.offsetY !== 0) {
    parts.push(`translate(${sprite.offsetX.toFixed(2)}px, ${sprite.offsetY.toFixed(2)}px)`);
  }
  if (sprite.rotate !== 0) parts.push(`rotateZ(${sprite.rotate.toFixed(2)}deg)`);
  parts.push('translate(-50%, -50%)');

  return parts.join(' ');
}

function effectPaint(sprite: EffectSprite): Record<string, string> {
  const style: Record<string, string> = {};
  if (sprite.background.length > 0) style['background'] = sprite.background;
  if (sprite.borderRadius.length > 0) style['border-radius'] = sprite.borderRadius;
  if (sprite.clipPath.length > 0) style['clip-path'] = sprite.clipPath;
  if (sprite.shadow.length > 0) {
    // A drawing does not always fill its element, so a box shadow lights the box rather than
    // the picture and shows a square edge. A drop shadow follows the outline instead.
    if (sprite.svg.length > 0) style['filter'] = dropShadowOf(sprite.shadow);
    else style['box-shadow'] = sprite.shadow;
  }
  return style;
}

/** Reads a box shadow as a drop shadow of the same spread. */
function dropShadowOf(shadow: string): string {
  return shadow
    .split(', ')
    .map((layer) => `drop-shadow(${layer})`)
    .join(' ');
}
