import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { distanceBetween, type ReplayRoutePoint, routeLength } from '@axe/domain/replay/replay-route';
import { type FloorMarkLayer, floorMarkLayersOf, layFloorMarks } from '@axe/ui/tabletop/floor-marks';

const TRAIL_COLOR = 'rgba(120, 200, 255, 0.85)';
const TRAIL_DONE_COLOR = 'rgba(120, 200, 255, 0.28)';
const TRAIL_THICKNESS = 5;
const TRAIL_LIFT = 3;
const MARKER_SIZE = 14;

export interface ReplayRouteSegment {
  index: number;
  x: number;
  y: number;
  z: number;
  length: number;
  angle: number;
  isTravelled: boolean;
}

/**
 * The marks a replayed route is drawn with on the floor: each straight run, fainter once the playback
 * has passed it, and a ring at either end, each at the height its run starts at.
 */
export function replayRouteMarksOf(
  segments: readonly ReplayRouteSegment[],
  ends: readonly ReplayRoutePoint[]
): FloorMarkLayer[] {
  const laid: FloorMarkLayer[] = segments.map((segment) => {
    const turn = (segment.angle * Math.PI) / 180;
    return {
      heightPx: segment.z + TRAIL_LIFT,
      marks: [
        {
          kind: 'line',
          points: [
            { x: segment.x, y: segment.y },
            { x: segment.x + Math.cos(turn) * segment.length, y: segment.y + Math.sin(turn) * segment.length },
          ],
          stroke: {
            colour: segment.isTravelled ? TRAIL_DONE_COLOR : TRAIL_COLOR,
            widthPx: TRAIL_THICKNESS,
            round: true,
          },
        },
      ],
    };
  });
  for (const point of ends) {
    laid.push({
      heightPx: point.z + TRAIL_LIFT,
      marks: [
        { kind: 'circle', x: point.x, y: point.y, r: MARKER_SIZE / 2, stroke: { colour: TRAIL_COLOR, widthPx: 2 } },
      ],
    });
  }
  return floorMarkLayersOf(laid);
}

/**
 * Draws the route a piece takes in the replay on the floor, over the ground's rise and fall: its
 * runs, fainter once passed, and a ring at either end. What is drawn is listed on the page as well,
 * unseen.
 */
@Component({
  selector: 'replay-route-overlay',
  templateUrl: './replay-route-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class ReplayRouteOverlayComponent {
  private readonly playback = inject(ReplayPlaybackService);

  protected readonly segments = computed<ReplayRouteSegment[]>(() => {
    const trail = this.playback.routeTrail();
    if (!trail || trail.points.length < 2) return [];
    return buildSegments(trail.points, trail.progress);
  });

  protected readonly ends = computed<ReplayRoutePoint[]>(() => {
    const trail = this.playback.routeTrail();
    if (!trail || trail.points.length < 2) return [];
    return [trail.points[0], trail.points[trail.points.length - 1]];
  });

  constructor() {
    layFloorMarks('replay-route', () => replayRouteMarksOf(this.segments(), this.ends()));
  }
}

/**
 * The straight runs of a replayed route, for drawing its trail.
 *
 * Steps of no length are skipped. Each run carries its start point, length and heading in degrees,
 * and is marked travelled once the playback, as a share of the whole route clamped to 0 to 1, has
 * passed its end.
 */
export function buildSegments(points: readonly ReplayRoutePoint[], progress: number): ReplayRouteSegment[] {
  const total = routeLength(points);
  const travelled = total * Math.max(0, Math.min(1, progress));
  const segments: ReplayRouteSegment[] = [];
  let walked = 0;

  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const length = distanceBetween(start, end);
    if (length <= 0) continue;

    segments.push({
      index,
      x: start.x,
      y: start.y,
      z: start.z,
      length,
      angle: (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
      isTravelled: walked + length <= travelled,
    });
    walked += length;
  }
  return segments;
}
