export enum VisionShape {
  DOME = 'dome',
  CONE = 'cone',
  CONE_BACK = 'cone-back',
  CONE_MULTI = 'cone-multi',
  CONE_PERIPHERAL = 'cone-peripheral',
  CUSTOM = 'custom',
}

export const VISION_SHAPES: readonly VisionShape[] = [
  VisionShape.DOME,
  VisionShape.CONE,
  VisionShape.CONE_BACK,
  VisionShape.CONE_MULTI,
  VisionShape.CONE_PERIPHERAL,
  VisionShape.CUSTOM,
];

/** Reads a stored vision shape, falling back to dome for anything unknown. */
export function asVisionShape(value: unknown): VisionShape {
  return typeof value === 'string' && (VISION_SHAPES as readonly string[]).includes(value)
    ? (value as VisionShape)
    : VisionShape.DOME;
}

export interface VisionLobe {
  direction: number;
  angle: number;
  rangeScale: number;
}

export interface VisionSpec {
  shape: VisionShape;
  coneAngle: number;
  coneCount: number;
  backAngle: number;
  backScale: number;
  peripheralScale: number;
  direction: number;
  lobes: string;
}

export interface MutableVisionFields {
  visionShape: string;
  visionConeAngle: number;
  visionConeCount: number;
  visionBackAngle: number;
  visionBackScale: number;
  visionPeripheralScale: number;
}

export interface VisionShapeDef {
  coneAngle: number;
  coneCount: number;
  backAngle: number;
  backScale: number;
  peripheralScale: number;
}

export const VISION_SHAPE_DEFAULTS: Record<Exclude<VisionShape, VisionShape.CUSTOM>, VisionShapeDef> = {
  [VisionShape.DOME]: { coneAngle: 360, coneCount: 1, backAngle: 90, backScale: 0.4, peripheralScale: 0.3 },
  [VisionShape.CONE]: { coneAngle: 120, coneCount: 1, backAngle: 90, backScale: 0.4, peripheralScale: 0.3 },
  [VisionShape.CONE_BACK]: { coneAngle: 120, coneCount: 1, backAngle: 90, backScale: 0.4, peripheralScale: 0.3 },
  [VisionShape.CONE_MULTI]: { coneAngle: 100, coneCount: 3, backAngle: 90, backScale: 0.4, peripheralScale: 0.3 },
  [VisionShape.CONE_PERIPHERAL]: { coneAngle: 120, coneCount: 1, backAngle: 90, backScale: 0.4, peripheralScale: 0.3 },
};

export const DOME_LOBES: readonly VisionLobe[] = [{ direction: 0, angle: 360, rangeScale: 1 }];

/**
 * What a piece with no turn on it is facing.
 *
 * A bearing of nothing points to the right of the table, which is how a light is aimed and
 * how an angle is read off a pair of coordinates. A piece with no turn on it faces up the
 * table instead, which is where its arrow points, so the two are a quarter turn apart.
 */
export const FACING_BEARING_OFFSET = -90;

/**
 * The bearing a piece looks along, from its turn and an extra offset, where no turn at all faces up
 * the table.
 */
export function facingBearing(rotateDeg: number, offsetDeg = 0): number {
  return rotateDeg + offsetDeg + FACING_BEARING_OFFSET;
}

/**
 * Sets a piece's vision shape and, for every shape but custom, resets its cone settings to that
 * shape's defaults.
 */
export function applyVisionShape(target: MutableVisionFields, shape: VisionShape): void {
  target.visionShape = shape;
  if (shape === VisionShape.CUSTOM) return;
  const def = VISION_SHAPE_DEFAULTS[shape];
  target.visionConeAngle = def.coneAngle;
  target.visionConeCount = def.coneCount;
  target.visionBackAngle = def.backAngle;
  target.visionBackScale = def.backScale;
  target.visionPeripheralScale = def.peripheralScale;
}

/**
 * The lobes a vision spec sees through, each a direction from the facing, a spread and a share of
 * the range.
 *
 * A custom spec with no readable lobes, and any unknown shape, sees all round at full range.
 */
export function visionLobesOf(spec: VisionSpec): readonly VisionLobe[] {
  const cone = clampAngle(spec.coneAngle);
  switch (spec.shape) {
    case VisionShape.CONE:
      return [{ direction: 0, angle: cone, rangeScale: 1 }];
    case VisionShape.CONE_BACK:
      return [
        { direction: 0, angle: cone, rangeScale: 1 },
        { direction: 180, angle: clampAngle(spec.backAngle), rangeScale: clampScale(spec.backScale) },
      ];
    case VisionShape.CONE_MULTI: {
      const count = Math.max(1, Math.min(12, Math.round(spec.coneCount)));
      const lobes: VisionLobe[] = [];
      for (let i = 0; i < count; i++) {
        lobes.push({ direction: (i * 360) / count, angle: cone, rangeScale: 1 });
      }
      return lobes;
    }
    case VisionShape.CONE_PERIPHERAL:
      return [
        { direction: 0, angle: cone, rangeScale: 1 },
        { direction: 0, angle: 360, rangeScale: clampScale(spec.peripheralScale) },
      ];
    case VisionShape.CUSTOM: {
      const parsed = parseVisionLobes(spec.lobes);
      return parsed.length > 0 ? parsed : DOME_LOBES;
    }
    default:
      return DOME_LOBES;
  }
}

/**
 * Reads custom lobes written as `direction/angle/scale` entries separated by semicolons.
 *
 * The scale may be left out for full range. Unreadable entries are skipped, and angles and scales
 * are held to their ranges.
 */
export function parseVisionLobes(text: string): VisionLobe[] {
  const lobes: VisionLobe[] = [];
  for (const part of text.split(';')) {
    const fields = part.split('/');
    if (fields.length < 2) continue;
    const direction = Number(fields[0]);
    const angle = Number(fields[1]);
    const rangeScale = fields.length > 2 ? Number(fields[2]) : 1;
    if (!Number.isFinite(direction) || !Number.isFinite(angle) || !Number.isFinite(rangeScale)) continue;
    lobes.push({ direction, angle: clampAngle(angle), rangeScale: clampScale(rangeScale) });
  }
  return lobes;
}

/** Writes lobes in the form parseVisionLobes reads. */
export function formatVisionLobes(lobes: readonly VisionLobe[]): string {
  return lobes.map((lobe) => `${lobe.direction}/${lobe.angle}/${lobe.rangeScale}`).join(';');
}

/**
 * The share of a piece's range that reaches a point: the largest scale among the lobes the point
 * falls in, or 0 when it falls in none.
 *
 * A point right on top of the piece is in every lobe.
 */
export function visionLobeScale(
  lobes: readonly VisionLobe[],
  facingDeg: number,
  sx: number,
  sy: number,
  x: number,
  y: number
): number {
  let best = 0;
  const dx = x - sx;
  const dy = y - sy;
  const near = dx * dx + dy * dy < 1e-12;
  const bearing = near ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
  for (const lobe of lobes) {
    const scale = clampScale(lobe.rangeScale);
    if (scale <= best) continue;
    if (near || lobe.angle >= 360) {
      best = scale;
      continue;
    }
    const delta = Math.abs(normalizeDegrees(bearing - facingDeg - lobe.direction));
    if (delta <= lobe.angle / 2) best = scale;
  }
  return best;
}

/** The largest range share among the lobes, which is the furthest the piece can possibly see. */
export function maxLobeScale(lobes: readonly VisionLobe[]): number {
  let best = 0;
  for (const lobe of lobes) best = Math.max(best, clampScale(lobe.rangeScale));
  return best;
}

function normalizeDegrees(value: number): number {
  return (((value % 360) + 540) % 360) - 180;
}

function clampAngle(value: number): number {
  if (!Number.isFinite(value)) return 360;
  return Math.max(0, Math.min(360, value));
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}
