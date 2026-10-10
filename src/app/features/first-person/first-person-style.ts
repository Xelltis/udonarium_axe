import { FirstPersonPose } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { FirstPersonPlaneQuad, FirstPersonWallQuad } from '@axe/domain/tabletop/first-person/first-person-scene';
import { FOG_VEIL_ALPHA } from '@axe/domain/tabletop/fog/fog-mode';

export const FIRST_PERSON_UNIT_PX = 256;
export const MAX_PIECE_SCREEN_FRACTION = 0.7;
export const MAX_PIECE_TEXT_SCREEN_PX = 28;
/** How far up from the bottom of the view a lifted piece's feet are held, as a share of half the view's height. */
export const PIECE_FOOT_MARGIN = 0.08;
const BILLBOARD_TEXT_PX = 24;
const MAX_SHADE = 0.85;
const REMEMBERED_VEIL = `linear-gradient(rgba(0, 0, 0, ${FOG_VEIL_ALPHA}), rgba(0, 0, 0, ${FOG_VEIL_ALPHA}))`;

export type QuadStyle = Record<string, string>;

export function scaleOf(gridSize: number): number {
  return gridSize > 0 ? FIRST_PERSON_UNIT_PX / gridSize : 1;
}

export function perspectivePx(widthPx: number, fovDeg: number): number {
  const half = (Math.min(Math.max(fovDeg, 1), 179) * Math.PI) / 360;
  return Math.max(1, widthPx) / 2 / Math.tan(half);
}

export function cameraTransform(pose: FirstPersonPose, scale: number, perspective: number): string {
  return [
    `translateZ(${px(perspective)})`,
    'rotateX(90deg)',
    `rotateZ(${deg(-pose.yaw)})`,
    `translate3d(${px(-pose.x * scale)}, ${px(-pose.y * scale)}, ${px(-pose.z * scale)})`,
  ].join(' ');
}

export function shadeFor(depth: number, depthPx: number): number {
  if (depthPx <= 0) return 0;
  return round(Math.min(Math.max(depth / depthPx, 0), 1) * MAX_SHADE);
}

/**
 * The veil over a face once the light on it is counted as well as how far off it is: the same
 * darkening for distance, deepened as the light at the face falls from full to none.
 */
export function litShade(depthShade: number, brightness: number): number {
  const light = Math.min(Math.max(brightness, 0), 1);
  return round(1 - (1 - depthShade) * light);
}

/** The filter a piece's picture is drawn with: dimmed to the light on it, and glowing red while targeted. */
export function pieceImageFilter(brightness: number, targeted: boolean): string | null {
  const parts: string[] = [];
  if (brightness < 1) parts.push(`brightness(${round(Math.max(brightness, 0))})`);
  if (targeted) parts.push('drop-shadow(0 0 8px #ff3b30)');
  return parts.length > 0 ? parts.join(' ') : null;
}

export function wallQuadStyle(
  quad: FirstPersonWallQuad,
  scale: number,
  imageUrl: string,
  shade: number,
  remembered = false
): QuadStyle {
  const top = (quad.basePx + quad.heightPx) * scale;
  return {
    width: px(quad.length * scale),
    height: px(quad.heightPx * scale),
    transformOrigin: '0 0',
    transform: `translate3d(${px(quad.x * scale)}, ${px(quad.y * scale)}, ${px(top)}) rotateZ(${deg(quad.angle)}) rotateX(-90deg)`,
    ...backgroundOf(
      imageUrl,
      shade,
      `${px(quad.fullLength * scale)} 100%`,
      `${px(-quad.uStart * scale)} 0`,
      remembered
    ),
  };
}

export function planeQuadStyle(
  quad: FirstPersonPlaneQuad,
  scale: number,
  imageUrl: string,
  shade: number,
  remembered = false
): QuadStyle {
  const up = quad.facing === 'up';
  const originY = up ? quad.minY : quad.minY + quad.height;
  const local = quad.polygon.map((point) => ({
    x: (point.x - quad.minX) * scale,
    y: (up ? point.y - quad.minY : quad.minY + quad.height - point.y) * scale,
  }));
  const frame = quad.frame;
  const size = frame ? `${px(frame.width * scale)} ${px(frame.height * scale)}` : '100% 100%';
  const position = frame ? `${px((frame.x - quad.minX) * scale)} ${px((frame.y - quad.minY) * scale)}` : '0 0';
  return {
    width: px(quad.width * scale),
    height: px(quad.height * scale),
    transformOrigin: '0 0',
    transform: `translate3d(${px(quad.minX * scale)}, ${px(originY * scale)}, ${px(quad.zPx * scale)})${up ? '' : ' rotateX(180deg)'}`,
    clipPath: `polygon(${local.map((point) => `${px(point.x)} ${px(point.y)}`).join(', ')})`,
    ...backgroundOf(imageUrl, shade, size, position, remembered),
  };
}

export function billboardStyle(
  point: { x: number; y: number; z: number },
  widthPx: number,
  heightPx: number,
  yaw: number,
  scale: number
): QuadStyle {
  return {
    width: px(widthPx * scale),
    height: px(heightPx * scale),
    transformOrigin: '0 0',
    transform: `translate3d(${px(point.x * scale)}, ${px(point.y * scale)}, ${px(point.z * scale)}) rotateZ(${deg(yaw)}) rotateX(-90deg) translate(-50%, -100%)`,
  };
}

export function projectedScaleOf(depthPx: number, scale: number, perspective: number): number {
  return perspective / Math.max(depthPx * scale, 1);
}

export function projectedHeightPx(heightPx: number, depthPx: number, scale: number, perspective: number): number {
  return heightPx * scale * projectedScaleOf(depthPx, scale, perspective);
}

/**
 * How far a piece standing close has to be raised, in table pixels, for its feet to come up into
 * the view rather than below its bottom edge; nothing for a piece far enough off to show whole.
 * Raised, it floats a little off the floor, which is the price of seeing where it stands.
 */
export function billboardLiftPx(
  baseZ: number,
  eyeZ: number,
  depthPx: number,
  perspective: number,
  viewHeightPx: number
): number {
  if (viewHeightPx <= 0 || depthPx <= 0 || perspective <= 0) return 0;
  const lowest = eyeZ - ((viewHeightPx / 2) * (1 - PIECE_FOOT_MARGIN) * depthPx) / perspective;
  return Math.max(0, lowest - baseZ);
}

/**
 * How far a piece is shrunk so that it stands no taller, nor wider, than its share of the view,
 * a width or a view of nothing asking for nothing; 1 where it fits already.
 */
export function billboardShrink(
  heightPx: number,
  depthPx: number,
  scale: number,
  perspective: number,
  viewHeightPx: number,
  widthPx = 0,
  viewWidthPx = 0
): number {
  const fit = (lengthPx: number, viewPx: number): number => {
    const limit = viewPx * MAX_PIECE_SCREEN_FRACTION;
    const projected = projectedHeightPx(lengthPx, depthPx, scale, perspective);
    return limit <= 0 || projected <= limit ? 1 : limit / projected;
  };
  return Math.min(fit(heightPx, viewHeightPx), fit(widthPx, viewWidthPx));
}

export function billboardTextScale(shrink: number, depthPx: number, scale: number, perspective: number): number {
  const projected = BILLBOARD_TEXT_PX * projectedScaleOf(depthPx, scale, perspective);
  const fits = projected > 0 ? MAX_PIECE_TEXT_SCREEN_PX / projected : 1;
  return Math.min(shrink, fits, 1);
}

export function billboardHudTransform(textScale: number): string | null {
  return textScale >= 1 ? null : `scale(${round(textScale)})`;
}

function backgroundOf(imageUrl: string, shade: number, size: string, position: string, remembered: boolean): QuadStyle {
  const veils = [`linear-gradient(rgba(0, 0, 0, ${shade}), rgba(0, 0, 0, ${shade}))`];
  if (remembered) veils.unshift(REMEMBERED_VEIL);
  const veilSizes = veils.map(() => '100% 100%');
  const veilPositions = veils.map(() => '0 0');
  if (!imageUrl) {
    return {
      backgroundImage: veils.join(', '),
      backgroundSize: veilSizes.join(', '),
      backgroundPosition: veilPositions.join(', '),
    };
  }
  return {
    backgroundImage: `${veils.join(', ')}, url("${imageUrl.replace(/"/g, '%22')}")`,
    backgroundSize: `${veilSizes.join(', ')}, ${size}`,
    backgroundPosition: `${veilPositions.join(', ')}, ${position}`,
  };
}

function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

function px(value: number): string {
  return `${round(value)}px`;
}

function deg(value: number): string {
  return `${round(value)}deg`;
}
