export interface TapPoint {
  readonly x: number;
  readonly y: number;
}

export interface TapGestureOptions {
  readonly maxDurationMs?: number;
  readonly maxMoveDistance?: number;
}

export interface TapGestureHandle {
  destroy(): void;
}

const DEFAULT_MAX_DURATION_MS = 300;
const DEFAULT_MAX_MOVE_DISTANCE = 8;

/**
 * Calls onTap with the touch point when the element is tapped, until the handle is destroyed.
 *
 * A tap is one finger lifted within 300 ms after moving at most 8 px, unless the options say
 * otherwise. Only touch counts, not the mouse, and the passive listeners never cancel the touch.
 */
export function observeTap(
  element: Element,
  onTap: (point: TapPoint) => void,
  options: TapGestureOptions = {}
): TapGestureHandle {
  const maxDuration = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const maxMove = options.maxMoveDistance ?? DEFAULT_MAX_MOVE_DISTANCE;

  let startedAt = 0;
  let startPoint: TapPoint | null = null;

  const onTouchStart = (event: Event) => {
    const point = touchPoint(event);
    if (!point || touchCount(event) > 1) {
      startPoint = null;
      return;
    }
    startedAt = Date.now();
    startPoint = point;
  };

  const onTouchMove = (event: Event) => {
    if (!startPoint) return;
    const point = touchPoint(event);
    if (point && distance(startPoint, point) > maxMove) startPoint = null;
  };

  const onTouchEnd = (event: Event) => {
    const start = startPoint;
    startPoint = null;
    if (!start) return;
    if (Date.now() - startedAt > maxDuration) return;

    const point = touchPoint(event) ?? start;
    if (distance(start, point) > maxMove) return;
    onTap(point);
  };

  const onTouchCancel = () => {
    startPoint = null;
  };

  element.addEventListener('touchstart', onTouchStart, { passive: true });
  element.addEventListener('touchmove', onTouchMove, { passive: true });
  element.addEventListener('touchend', onTouchEnd, { passive: true });
  element.addEventListener('touchcancel', onTouchCancel, { passive: true });

  return {
    destroy() {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchCancel);
    },
  };
}

function touchPoint(event: Event): TapPoint | null {
  const touchEvent = event as TouchEvent;
  const touch = touchEvent.changedTouches?.[0] ?? touchEvent.touches?.[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

function touchCount(event: Event): number {
  const touchEvent = event as TouchEvent;
  return touchEvent.touches?.length ?? 1;
}

function distance(a: TapPoint, b: TapPoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
