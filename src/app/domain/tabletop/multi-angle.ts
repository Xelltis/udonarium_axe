export type MultiAngleSeatKey = 'down' | 'left' | 'up' | 'right';
export type MultiAngleMotionMode = 'continuous' | 'quarter-turn' | 'piece-quarter-turn';
export type MultiAngleOrbitMode = Exclude<MultiAngleMotionMode, 'piece-quarter-turn'>;

export const DEFAULT_MULTI_ANGLE_REVOLUTION_SECONDS = 12;
export const DEFAULT_MULTI_ANGLE_PAUSE_SECONDS = 4;
export const DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS = 60;
export const DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND = 55;
export const MIN_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND = 20;
export const MAX_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND = 240;

export interface MultiAngleOrbitAnimation {
  readonly durationSeconds: number;
  readonly timingFunction: string;
}

export interface MultiAngleSeat {
  readonly key: MultiAngleSeatKey;
  readonly degrees: number;
}

export const MULTI_ANGLE_SEATS: readonly MultiAngleSeat[] = [
  { key: 'down', degrees: 0 },
  { key: 'left', degrees: 90 },
  { key: 'up', degrees: 180 },
  { key: 'right', degrees: 270 },
];

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function multiAngleSeatVector(degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: -Math.sin(radians),
    y: Math.cos(radians),
  };
}

export function compensateMultiAngleDegrees(degrees: number, tableDegrees: number): number {
  return normalizeDegrees(degrees - tableDegrees);
}

/** Maps a pointer around a piece to one of four 90-degree viewing areas. */
export function multiAngleDegreesFromPoint(pointX: number, pointY: number, centerX: number, centerY: number): number {
  const dx = pointX - centerX;
  const dy = pointY - centerY;
  if (dx === 0 && dy === 0) return 0;
  const degrees = normalizeDegrees((Math.atan2(-dx, dy) * 180) / Math.PI);
  return normalizeDegrees(Math.round(degrees / 90) * 90);
}

export function multiAngleNameMotionMode(mode: MultiAngleMotionMode): MultiAngleOrbitMode {
  return mode === 'quarter-turn' ? 'quarter-turn' : 'continuous';
}

export function multiAnglePieceMotionMode(mode: MultiAngleMotionMode): MultiAngleOrbitMode {
  return mode === 'continuous' ? 'continuous' : 'quarter-turn';
}

function finiteInRange(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function percentage(value: number, total: number): string {
  return `${Number(((value / total) * 100).toFixed(4))}%`;
}

/** Creates one shared CSS orbit, including smooth 90-degree turns followed by configurable holds. */
export function multiAngleOrbitAnimation(
  mode: MultiAngleOrbitMode,
  revolutionSeconds: number,
  pauseSeconds: number
): MultiAngleOrbitAnimation {
  const revolution = finiteInRange(revolutionSeconds, DEFAULT_MULTI_ANGLE_REVOLUTION_SECONDS, 1, 120);
  if (mode !== 'quarter-turn') return { durationSeconds: revolution, timingFunction: 'linear' };

  const pause = finiteInRange(pauseSeconds, DEFAULT_MULTI_ANGLE_PAUSE_SECONDS, 0, 30);
  if (pause === 0) return { durationSeconds: revolution, timingFunction: 'linear' };

  const turn = revolution / 4;
  const durationSeconds = revolution + pause * 4;
  const stops: string[] = ['0 0%'];
  for (let quarter = 1; quarter <= 4; quarter++) {
    const progress = quarter / 4;
    const turnEnd = quarter * turn + (quarter - 1) * pause;
    const pauseEnd = turnEnd + pause;
    stops.push(`${progress} ${percentage(turnEnd, durationSeconds)}`);
    stops.push(`${progress} ${percentage(pauseEnd, durationSeconds)}`);
  }
  return { durationSeconds, timingFunction: `linear(${stops.join(', ')})` };
}

/** A deterministic pseudo-random phase, so every peer sees each piece at the same angle. */
export function multiAngleRotationPhase(identifier: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < identifier.length; index++) {
    hash ^= identifier.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}
