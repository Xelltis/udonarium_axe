import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

const SWEEP_DEGREES = 270;
const START_DEGREES = -135;
const DRAG_PIXELS_FOR_FULL_TURN = 160;
const FINE_DRAG_FACTOR = 0.2;
const RADIUS = 13;
const CENTRE = 18;

/** A point on the knob's ring at an angle in degrees, 0 straight up and growing clockwise. */
function pointAt(degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return { x: CENTRE + RADIUS * Math.sin(radians), y: CENTRE - RADIUS * Math.cos(radians) };
}

/** The SVG path of the ring from one angle to another, clockwise. */
function arc(from: number, to: number): string {
  if (Math.abs(to - from) < 0.5) return '';
  const start = pointAt(Math.min(from, to));
  const end = pointAt(Math.max(from, to));
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/**
 * A round knob, as on a DJ mixer: dragged up or down to turn it, with the wheel or the arrow keys
 * for small steps, and a double click to bring it back to its resting place.
 *
 * The ring lights from the resting place to where the knob stands, so a knob that rests in the
 * middle, such as a filter, lights either way. Holding Shift while dragging turns it finely. It
 * reports each turn as it happens and once more when let go, so whoever holds it can preview a
 * change at once and share it when it settles; it keeps no value of its own. The keys it turns by
 * go no further, so the arrows that move the table leave it alone.
 */
@Component({
  selector: 'ui-knob',
  templateUrl: './knob.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex flex-col items-center' },
})
export class UiKnobComponent {
  /** Where the knob stands, from `min` to `max`. */
  readonly value = input.required<number>();
  readonly min = input(0);
  readonly max = input(1);
  /** Where the knob rests, which a double click brings it back to and its ring lights from; `min` when not given. */
  readonly rest = input<number | null>(null);
  /** How far one press of an arrow key or one notch of the wheel turns it. */
  readonly step = input(0.05);
  readonly label = input('');
  /** What the knob stands at, in words, for assistive technology; the number when empty. */
  readonly valueText = input('');
  readonly disabled = input(false);
  /** The name by which forms and tests find the knob. */
  readonly name = input('');

  /** Where the knob was turned to, sent as it turns. */
  readonly valueChange = output<number>();
  /** Where the knob was left, sent once a turn is over. */
  readonly settle = output<number>();

  private dragFrom: { y: number; value: number; turnedTo: number } | null = null;

  protected readonly restingAt = computed(() => this.rest() ?? this.min());

  protected readonly angle = computed(() => this.angleOf(this.value()));

  protected readonly track = arc(START_DEGREES, START_DEGREES + SWEEP_DEGREES);

  protected readonly lit = computed(() => arc(this.angleOf(this.restingAt()), this.angle()));

  protected readonly pointer = computed(() => {
    const tip = pointAt(this.angle());
    const radians = (this.angle() * Math.PI) / 180;
    return {
      x1: CENTRE + 4 * Math.sin(radians),
      y1: CENTRE - 4 * Math.cos(radians),
      x2: tip.x,
      y2: tip.y,
    };
  });

  private angleOf(value: number): number {
    const span = this.max() - this.min();
    const share = span > 0 ? (value - this.min()) / span : 0;
    return START_DEGREES + SWEEP_DEGREES * Math.min(1, Math.max(0, share));
  }

  private clamp(value: number): number {
    return Math.min(this.max(), Math.max(this.min(), value));
  }

  private turnTo(value: number, settled: boolean): void {
    const next = this.clamp(value);
    this.valueChange.emit(next);
    if (settled) this.settle.emit(next);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.disabled() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.dragFrom = { y: event.clientY, value: this.value(), turnedTo: this.value() };
  }

  protected onPointerMove(event: PointerEvent): void {
    const from = this.dragFrom;
    if (!from) return;
    const span = this.max() - this.min();
    const factor = event.shiftKey ? FINE_DRAG_FACTOR : 1;
    from.turnedTo = this.clamp(from.value + ((from.y - event.clientY) / DRAG_PIXELS_FOR_FULL_TURN) * span * factor);
    this.valueChange.emit(from.turnedTo);
  }

  protected onPointerUp(): void {
    const from = this.dragFrom;
    if (!from) return;
    this.dragFrom = null;
    this.settle.emit(from.turnedTo);
  }

  protected onWheel(event: WheelEvent): void {
    if (this.disabled() || event.deltaY === 0) return;
    event.preventDefault();
    this.turnTo(this.value() + (event.deltaY < 0 ? 1 : -1) * this.step(), true);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (this.disabled()) return;
    const span = this.max() - this.min();
    const moves: Record<string, number> = {
      ArrowUp: this.step(),
      ArrowRight: this.step(),
      ArrowDown: -this.step(),
      ArrowLeft: -this.step(),
      PageUp: span / 10,
      PageDown: -span / 10,
    };
    if (event.key === 'Home') this.turnTo(this.min(), true);
    else if (event.key === 'End') this.turnTo(this.max(), true);
    else if (event.key in moves) this.turnTo(this.value() + moves[event.key], true);
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  protected onDoubleClick(): void {
    if (this.disabled()) return;
    this.turnTo(this.restingAt(), true);
  }
}
