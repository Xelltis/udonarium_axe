import { DestroyRef, Directive, ElementRef, inject, input, output } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PlacedRulerService } from '@axe/application/tabletop/placed-ruler.service';
import { liftedBy, RulerService } from '@axe/application/tabletop/ruler.service';
import { RulerReadingService } from '@axe/application/tabletop/ruler-reading.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { ALTITUDE_STEP_CELLS } from '@axe/domain/tabletop/altitude-step';
import { RulerEnd, RulerLine } from '@axe/domain/tabletop/ruler/ruler-line';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';
import { TableRuler } from '@axe/domain/tabletop/table-ruler';
import { InputHandler } from '@axe/ui/directives/input-handler';

/** Which of a ruler's ends a grab moves: one of them, or both together. */
export type RulerGrabbed = 'from' | 'to' | 'both';

/** A grab under way: the ruler as it lay when grabbed, and how far the moved end has been lifted since. */
interface Grab {
  readonly line: RulerLine;
  readonly points: { readonly from: Vec3; readonly to: Vec3 };
  /** Where on the level of the ruler's middle the pointer was when it was grabbed by its middle. */
  readonly startedAt: { readonly x: number; readonly y: number } | null;
  lift: number;
}

/**
 * Moves a ruler left lying on the table by an end or by its middle.
 *
 * An end is laid again where it is dragged, as the ruler in hand lays its ends: held to a piece it is
 * dragged onto, or kept to the middle of a square unless Alt is held, and the wheel lifts and lowers
 * it. A ruler dragged by its middle moves both its ends together over the table, let go of the pieces
 * they were held to. It is drawn where it is being moved for this seat alone, and written for everyone
 * once let go. A locked ruler, and a seat that may not change the table, moves nothing.
 */
@Directive({ selector: '[appRulerGrab]' })
export class RulerGrabDirective {
  readonly ruler = input.required<TableRuler>({ alias: 'appRulerGrab' });
  readonly grabbed = input<RulerGrabbed>('both', { alias: 'rulerGrabbed' });
  readonly grabStart = output<void>();
  readonly grabEnd = output<void>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly placed = inject(PlacedRulerService);
  private readonly readings = inject(RulerReadingService);
  private readonly rulers = inject(RulerService);
  private readonly pick = inject(TablePickService);
  private readonly permission = inject(RolePermissionService);
  private readonly input = new InputHandler(this.element);
  private grab: Grab | null = null;

  private readonly onWheel = (e: WheelEvent) => this.lift(e);

  constructor() {
    this.input.onStart = (e) => this.start(e);
    this.input.onMove = (e) => this.move(e);
    this.input.onEnd = () => this.letGo(true);
    inject(DestroyRef).onDestroy(() => {
      this.letGo(false);
      this.input.destroy();
    });
  }

  private start(e: MouseEvent | TouchEvent): void {
    const ruler = this.ruler();
    const shown = this.placed.placedOf(ruler.identifier);
    const button = (e as MouseEvent).button;
    if (!shown || ruler.isLock || !this.permission.canEditTabletop() || button === 1 || button === 2) {
      this.input.cancel();
      return;
    }
    e.stopPropagation();
    const pointer = this.input.pointer;
    const middleZ = (shown.from.z + shown.to.z) / 2;
    this.grab = {
      line: shown.line,
      points: { from: shown.from, to: shown.to },
      startedAt: this.grabbed() === 'both' ? this.levelAt(pointer.x, pointer.y, middleZ) : null,
      lift: 0,
    };
    this.element.ownerDocument.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    this.grabStart.emit();
  }

  private move(e: MouseEvent | TouchEvent): void {
    const grab = this.grab;
    if (!grab) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    const pointer = this.input.pointer;
    const line = this.moved(grab, pointer.x, pointer.y, (e as MouseEvent).altKey === true);
    if (line) this.placed.hold(this.ruler().identifier, line);
  }

  /** The ruler as the grab has moved it with the pointer at a point of the page, or null where that cannot be told. */
  private moved(grab: Grab, pageX: number, pageY: number, free: boolean): RulerLine | null {
    const which = this.grabbed();
    if (which === 'both') {
      const middleZ = (grab.points.from.z + grab.points.to.z) / 2;
      const now = this.levelAt(pageX, pageY, middleZ);
      if (!now || !grab.startedAt) return null;
      const shift = (point: Vec3): RulerEnd => ({
        x: point.x + now.x - grab.startedAt!.x,
        y: point.y + now.y - grab.startedAt!.y,
        z: point.z,
      });
      return { from: shift(grab.points.from), to: shift(grab.points.to) };
    }
    const end = this.rulers.endAt(pageX, pageY, free);
    if (!end) return null;
    return { ...grab.line, [which]: liftedBy(end, grab.lift) };
  }

  /** Lifts or lowers the end being moved by a step of altitude for each turn of the wheel. */
  private lift(e: WheelEvent): void {
    const grab = this.grab;
    if (!grab || this.grabbed() === 'both' || e.deltaY === 0) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    const step = (e.deltaY < 0 ? 1 : -1) * ALTITUDE_STEP_CELLS * this.readings.gridSize();
    grab.lift += step;
    const held = this.placed.placedOf(this.ruler().identifier)?.line ?? grab.line;
    const which = this.grabbed() as 'from' | 'to';
    this.placed.hold(this.ruler().identifier, { ...held, [which]: liftedBy(held[which], step) });
  }

  /** Where the line of sight through a point of the page crosses the level of a height over the table. */
  private levelAt(pageX: number, pageY: number, height: number): { x: number; y: number } | null {
    return this.pick.levelAt(pageX, pageY, height);
  }

  private letGo(keep: boolean): void {
    if (!this.grab) return;
    this.grab = null;
    this.element.ownerDocument.removeEventListener('wheel', this.onWheel, { capture: true });
    this.placed.letGo(this.ruler().identifier, keep);
    this.grabEnd.emit();
  }
}
