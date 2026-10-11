import { FirstPersonGlow, FirstPersonProp } from '@axe/application/tabletop/first-person-props.service';
import {
  clipBillboardToEye,
  clipPolygonToEye,
  clipWallToEye,
  EyeFrame,
  viewDepthOf,
} from '@axe/domain/tabletop/first-person/first-person-clip';
import { CellPoint } from '@axe/domain/tabletop/fog/cell-grid';
import { billboardCutPath, billboardStyle, QuadStyle } from '@axe/features/first-person/first-person-style';

const GLOW_FALLBACK = '#ffd68c';

/** Where a prop lies or stands and how big it is, which is all its placing and cutting read. */
export type PropShape = Pick<FirstPersonProp, 'kind' | 'x' | 'y' | 'z' | 'width' | 'height' | 'rotate'>;

export function propStyle(prop: PropShape, yaw: number, scale: number): QuadStyle {
  const size = { width: px(prop.width * scale), height: px(prop.height * scale), transformOrigin: '0 0' };
  if (prop.kind === 'stand') {
    return billboardStyle({ x: prop.x, y: prop.y, z: prop.z }, prop.width, prop.height, yaw, scale);
  }
  if (prop.kind === 'board') {
    return {
      ...size,
      transform: `translate3d(${px(prop.x * scale)}, ${px(prop.y * scale)}, ${px(prop.z * scale)}) rotateZ(${deg(prop.rotate)}) rotateX(-90deg) translate(-50%, -100%)`,
    };
  }
  return {
    ...size,
    transform: `translate3d(${px(prop.x * scale)}, ${px(prop.y * scale)}, ${px(prop.z * scale)}) rotateZ(${deg(prop.rotate)}) translate(-50%, -50%)`,
  };
}

export function glowStyle(glow: FirstPersonGlow, yaw: number, scale: number): QuadStyle {
  const color = glow.color || GLOW_FALLBACK;
  return {
    ...billboardStyle({ x: glow.x, y: glow.y, z: glow.z - glow.radius }, glow.radius * 2, glow.radius * 2, yaw, scale),
    backgroundImage: `radial-gradient(circle, ${color} 0%, color-mix(in srgb, ${color} 40%, transparent) 35%, transparent 70%)`,
  };
}

export function lyingCorners(prop: PropShape): CellPoint[] {
  return [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ].map(([u, v]) => worldOf(prop, u * prop.width, v * prop.height));
}

export function lyingSamples(prop: PropShape, stepPx: number): CellPoint[] {
  const across = Math.max(1, Math.ceil(prop.width / stepPx));
  const down = Math.max(1, Math.ceil(prop.height / stepPx));
  const points: CellPoint[] = [];
  for (let column = 0; column < across; column++) {
    for (let row = 0; row < down; row++) {
      points.push(
        worldOf(prop, ((column + 0.5) / across - 0.5) * prop.width, ((row + 0.5) / down - 0.5) * prop.height)
      );
    }
  }
  return points;
}

/**
 * How a prop is cut to what lies in front of the camera's near plane: '' where nothing is cut, null
 * where nothing is left, else the clip path. A standing prop facing the camera is cut from below or
 * above as the camera tips; an upright board along its length, and on a slant once the camera tips;
 * a lying one on a line across it.
 */
export function propClip(prop: PropShape, eye: EyeFrame, nearPx: number, scale: number): string | null {
  const top = prop.z + prop.height;
  if (prop.kind === 'stand') {
    const kept = clipBillboardToEye(eye, prop, prop.z, top, nearPx);
    if (!kept) return null;
    return billboardCutPath(kept, prop.z, prop.height) ?? '';
  }
  if (prop.kind === 'board') {
    const along = { x: Math.cos(radiansOf(prop)) * (prop.width / 2), y: Math.sin(radiansOf(prop)) * (prop.width / 2) };
    const cut = clipWallToEye(
      eye,
      { x: prop.x - along.x, y: prop.y - along.y },
      { x: prop.x + along.x, y: prop.y + along.y },
      prop.z,
      top,
      nearPx
    );
    if (!cut) return null;
    if (!cut.outline && cut.lowPx <= prop.z && cut.highPx >= top) {
      if (cut.t0 === 0 && cut.t1 === 1) return '';
      return `inset(0 ${percent(1 - cut.t1)} 0 ${percent(cut.t0)})`;
    }
    const outline = cut.outline ?? [
      { t: cut.t0, z: cut.highPx },
      { t: cut.t1, z: cut.highPx },
      { t: cut.t1, z: cut.lowPx },
      { t: cut.t0, z: cut.lowPx },
    ];
    return `polygon(${outline.map((point) => `${px(point.t * prop.width * scale)} ${px((top - point.z) * scale)}`).join(', ')})`;
  }
  const corners = lyingCorners(prop);
  if (corners.every((corner) => viewDepthOf(eye, corner, prop.z) >= nearPx)) return '';
  const kept = clipPolygonToEye(eye, corners, nearPx, prop.z);
  if (kept.length === 0) return null;
  const cos = Math.cos(radiansOf(prop));
  const sin = Math.sin(radiansOf(prop));
  const local = kept.map((point) => {
    const dx = point.x - prop.x;
    const dy = point.y - prop.y;
    return `${px((dx * cos + dy * sin + prop.width / 2) * scale)} ${px((-dx * sin + dy * cos + prop.height / 2) * scale)}`;
  });
  return `polygon(${local.join(', ')})`;
}

function worldOf(prop: PropShape, u: number, v: number): CellPoint {
  const cos = Math.cos(radiansOf(prop));
  const sin = Math.sin(radiansOf(prop));
  return { x: prop.x + u * cos - v * sin, y: prop.y + u * sin + v * cos };
}

function radiansOf(prop: PropShape): number {
  return (prop.rotate * Math.PI) / 180;
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

function percent(value: number): string {
  return `${round(value * 100)}%`;
}
