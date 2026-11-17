import { DestroyRef, Directive, ElementRef, inject, input, output } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { SolidRangeService } from '@axe/application/tabletop/solid-range.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { ALTITUDE_STEP_CELLS } from '@axe/domain/tabletop/altitude-step';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { RangeArea } from '@axe/domain/tabletop/range';
import { rotationSnapStep } from '@axe/domain/tabletop/rotation-snap';
import { aimOf, clampIntoReach, PITCH_SNAP_DEGREES, snapAim, SolidAim } from '@axe/domain/tabletop/solid/solid-reach';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';
import { InputHandler } from '@axe/ui/directives/input-handler';

/** What a hold on a tip is: the height the point aimed at is held at, and how far the pointer was off it when taken. */
interface Hold {
  height: number;
  offset: { x: number; y: number };
  last: { x: number; y: number } | null;
  snapping: boolean;
}

/**
 * The handle at the tip of a cone or a beam standing up off the table, which points it.
 *
 * Dragging it moves the point it is aimed at over the table at the height the point is held at, the
 * wheel lifts and lowers that point a cell a time, and the cone or beam points from its tip at
 * the point, within the room round its tip that is drawn while it is held. With Alt held its turn
 * keeps to the grid's directions and its tip to steps of fifteen degrees. The way is drawn for this
 * seat alone while held and written for everyone once let go.
 */
@Directive({ selector: '[appSolidAim]' })
export class SolidAimDirective {
  readonly range = input.required<RangeArea>({ alias: 'appSolidAim' });
  readonly aimStart = output<void>();
  readonly aimEnd = output<void>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly solidRanges = inject(SolidRangeService);
  private readonly pick = inject(TablePickService);
  private readonly tabletop = inject(TabletopService);
  private readonly rotationGuide = inject(RotationGuideService);
  private readonly permission = inject(RolePermissionService);
  private readonly input = new InputHandler(this.element);
  private hold: Hold | null = null;

  private readonly onWheel = (e: WheelEvent) => this.lift(e);
  private readonly onKey = (e: KeyboardEvent) => this.snapKey(e);

  constructor() {
    this.input.onStart = (e) => this.start(e);
    this.input.onMove = (e) => this.move(e);
    this.input.onEnd = () => this.end();
    inject(DestroyRef).onDestroy(() => {
      this.letGo(false);
      this.input.destroy();
    });
  }

  private start(e: MouseEvent | TouchEvent): void {
    const range = this.range();
    const placed = this.solidRanges.placedOf(range.identifier);
    const button = (e as MouseEvent).button;
    if (!placed || range.isLock || !this.permission.canEditTabletop() || button === 1 || button === 2) {
      this.input.cancel();
      return;
    }
    e.stopPropagation();
    const point = this.solidRanges.heldPointOf(placed);
    const pointer = this.input.pointer;
    const ground = this.groundAt(pointer.x, pointer.y, point.z);
    this.hold = {
      height: point.z,
      offset: ground ? { x: point.x - ground.x, y: point.y - ground.y } : { x: 0, y: 0 },
      last: { x: pointer.x, y: pointer.y },
      snapping: false,
    };
    const document = this.element.ownerDocument;
    document.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    document.addEventListener('keydown', this.onKey, true);
    document.addEventListener('keyup', this.onKey, true);
    this.aimStart.emit();
  }

  private move(e: MouseEvent | TouchEvent): void {
    const hold = this.hold;
    if (!hold) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    const pointer = this.input.pointer;
    hold.last = { x: pointer.x, y: pointer.y };
    hold.snapping = (e as MouseEvent).altKey === true;
    this.aimAtPointer();
  }

  private end(): void {
    this.letGo(true);
  }

  /** Lifts or lowers the point aimed at by a step of altitude for each turn of the wheel, up or down. */
  private lift(e: WheelEvent): void {
    const hold = this.hold;
    if (!hold || e.deltaY === 0) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    const gridSize = this.gridSize();
    hold.height += (e.deltaY < 0 ? 1 : -1) * ALTITUDE_STEP_CELLS * gridSize;
    this.aimAtPointer();
  }

  private snapKey(e: KeyboardEvent): void {
    const hold = this.hold;
    if (!hold || e.key !== 'Alt') return;
    e.preventDefault();
    const snapping = e.type === 'keydown';
    if (snapping === hold.snapping) return;
    hold.snapping = snapping;
    this.aimAtPointer();
  }

  /** Points the range at the point under the pointer, at the height held, within its room. */
  private aimAtPointer(): void {
    const hold = this.hold;
    const placed = this.solidRanges.placedOf(this.range().identifier);
    if (!hold?.last || !placed) return;
    const ground = this.groundAt(hold.last.x, hold.last.y, hold.height);
    if (!ground) return;
    let point: Vec3 = { x: ground.x + hold.offset.x, y: ground.y + hold.offset.y, z: hold.height };
    const room = this.solidRanges.roomOf(placed);
    if (room) point = clampIntoReach(point, room);
    const found = aimOf(placed.origin, point);
    if (!found) return;
    const step = rotationSnapStep(this.tabletop.currentTable.gridType ?? GridType.SQUARE);
    const aim: SolidAim = hold.snapping ? snapAim(found, step, PITCH_SNAP_DEGREES) : found;
    this.solidRanges.holdAim(this.range().identifier, aim);
    this.rotationGuide.report(this, {
      angle: Math.round(aim.yaw) % 360,
      step,
      snapping: hold.snapping,
      pitch: Math.round(aim.pitch),
    });
  }

  /** Where the line of sight through a point of the page crosses the level of a height over the table. */
  private groundAt(pageX: number, pageY: number, height: number): { x: number; y: number } | null {
    return this.pick.levelAt(pageX, pageY, height);
  }

  private gridSize(): number {
    const size = this.tabletop.currentTable.gridSize;
    return size > 0 ? size : 50;
  }

  /** Stops holding the tip: the way pointed is written for everyone when kept, and dropped otherwise. */
  private letGo(keep: boolean): void {
    if (!this.hold) return;
    this.hold = null;
    const document = this.element.ownerDocument;
    document.removeEventListener('wheel', this.onWheel, { capture: true });
    document.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('keyup', this.onKey, true);
    this.rotationGuide.end(this);
    const identifier = this.range().identifier;
    if (keep) this.solidRanges.letGoAim(identifier);
    else this.solidRanges.dropAim(identifier);
    this.aimEnd.emit();
  }
}
