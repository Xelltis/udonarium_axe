import { PieceGauge } from '@axe/domain/character/piece-gauge';

export const MAX_MULTI_ANGLE_RESOURCE_GAUGES = 4;

export interface MultiAngleResourceGaugeSegment {
  readonly gauge: PieceGauge;
  readonly rotationDegrees: number;
  readonly segmentDegrees: number;
  readonly trackDashArray: string;
  readonly fillDashArray: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly labelRotationDegrees: number;
}

export interface MultiAngleResourceGaugeSeparator {
  readonly angleDegrees: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface MultiAngleResourceGaugeLayout {
  readonly svgSize: number;
  readonly offset: number;
  readonly center: number;
  readonly radius: number;
  readonly strokeWidth: number;
  readonly separatorStrokeWidth: number;
  readonly fontSize: number;
  readonly outerExtent: number;
  readonly segments: readonly MultiAngleResourceGaugeSegment[];
  readonly separators: readonly MultiAngleResourceGaugeSeparator[];
}

export interface MultiAngleBuffOrbitLayout {
  readonly radius: number;
  readonly iconSize: number;
  readonly angles: readonly number[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

/** Divides one pedestal ring evenly between at most four configured resources. */
export function makeMultiAngleResourceGauge(
  gauges: readonly PieceGauge[],
  pieceDiameter: number
): MultiAngleResourceGaugeLayout {
  const diameter = Math.max(1, pieceDiameter);
  const visibleGauges = gauges.slice(0, MAX_MULTI_ANGLE_RESOURCE_GAUGES);
  const count = visibleGauges.length;
  const segmentDegrees = count > 0 ? 360 / count : 0;
  const strokeWidth = clamp(diameter * 0.1, 5, 9);
  const separatorStrokeWidth = clamp(strokeWidth * 0.4, 2, 3);
  const radius = diameter / 2 + strokeWidth / 2;
  const outerExtent = radius + strokeWidth / 2 + 2;
  const svgSize = outerExtent * 2;
  const center = svgSize / 2;
  const fontSize = clamp(diameter * 0.16, 8, 12);
  const segments = visibleGauges.map((gauge, index): MultiAngleResourceGaugeSegment => {
    const rotationDegrees = -90 + index * segmentDegrees;
    const filledDegrees = segmentDegrees * clamp(gauge.ratio, 0, 1);
    const labelDegrees = rotationDegrees + segmentDegrees / 2;
    const labelRadians = (labelDegrees * Math.PI) / 180;
    const labelX = center + Math.cos(labelRadians) * radius;
    const labelY = center + Math.sin(labelRadians) * radius;
    return {
      gauge,
      rotationDegrees: rounded(rotationDegrees),
      segmentDegrees: rounded(segmentDegrees),
      trackDashArray: `${rounded(segmentDegrees)} ${rounded(360 - segmentDegrees)}`,
      fillDashArray: `${rounded(filledDegrees)} ${rounded(360 - filledDegrees)}`,
      labelX: rounded(labelX),
      labelY: rounded(labelY),
      labelRotationDegrees: rounded(labelDegrees + 90),
    };
  });
  const separatorInnerRadius = radius - strokeWidth / 2 - 1;
  const separatorOuterRadius = radius + strokeWidth / 2 + 1;
  const separators =
    count < 2
      ? []
      : Array.from({ length: count }, (_, index): MultiAngleResourceGaugeSeparator => {
          const angleDegrees = -90 + index * segmentDegrees;
          const angleRadians = (angleDegrees * Math.PI) / 180;
          return {
            angleDegrees: rounded(angleDegrees),
            x1: rounded(center + Math.cos(angleRadians) * separatorInnerRadius),
            y1: rounded(center + Math.sin(angleRadians) * separatorInnerRadius),
            x2: rounded(center + Math.cos(angleRadians) * separatorOuterRadius),
            y2: rounded(center + Math.sin(angleRadians) * separatorOuterRadius),
          };
        });

  return {
    svgSize,
    offset: diameter / 2 - center,
    center,
    radius,
    strokeWidth,
    separatorStrokeWidth,
    fontSize,
    outerExtent,
    segments,
    separators,
  };
}

/** Places every buff evenly outside the name and resource rings, expanding when needed. */
export function makeMultiAngleBuffOrbit(
  buffCount: number,
  pieceDiameter: number,
  innerExtent: number
): MultiAngleBuffOrbitLayout {
  const count = Math.max(0, Math.floor(buffCount));
  const diameter = Math.max(1, pieceDiameter);
  const iconSize = clamp(diameter * 0.28, 14, 20);
  const baseRadius = innerExtent + iconSize / 2 + 5;
  const nonOverlappingRadius = count > 1 ? (count * (iconSize + 3)) / (2 * Math.PI) : 0;
  const radius = Math.max(baseRadius, nonOverlappingRadius);
  const angles = Array.from({ length: count }, (_, index) => rounded((index * 360) / count));
  return { radius, iconSize, angles };
}
