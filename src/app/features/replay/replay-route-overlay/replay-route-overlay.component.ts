import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { distanceBetween, type ReplayRoutePoint, routeLength } from '@axe/domain/replay/replay-route';

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

@Component({
  selector: 'replay-route-overlay',
  templateUrl: './replay-route-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [NgStyle],
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

  protected segmentStyle(segment: ReplayRouteSegment): Record<string, string> {
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: segment.length + 'px',
      height: TRAIL_THICKNESS + 'px',
      'border-radius': TRAIL_THICKNESS / 2 + 'px',
      background: segment.isTravelled ? TRAIL_DONE_COLOR : TRAIL_COLOR,
      'transform-origin': '0 0',
      transform:
        'translate3d(' +
        segment.x +
        'px, ' +
        segment.y +
        'px, ' +
        (segment.z + TRAIL_LIFT) +
        'px) rotateZ(' +
        segment.angle +
        'deg) translateY(-50%)',
      'pointer-events': 'none',
    };
  }

  protected endStyle(point: ReplayRoutePoint): Record<string, string> {
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: MARKER_SIZE + 'px',
      height: MARKER_SIZE + 'px',
      'border-radius': '50%',
      border: '2px solid ' + TRAIL_COLOR,
      'transform-origin': '0 0',
      transform:
        'translate3d(' + point.x + 'px, ' + point.y + 'px, ' + (point.z + TRAIL_LIFT) + 'px) translate(-50%, -50%)',
      'pointer-events': 'none',
    };
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
