import {
  afterNextRender,
  ComponentRef,
  DestroyRef,
  Directive,
  inject,
  input,
  Type,
  ViewContainerRef,
} from '@angular/core';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { observeTap, TapGestureHandle } from '@axe/core/input/tap-gesture';
import { GameCharacter } from '@axe/domain/character/game-character';
import { asHoverDetailPlacement } from '@axe/domain/tabletop/hover-detail-placement';
import { multiAngleDegreesFromPoint } from '@axe/domain/tabletop/multi-angle';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { EdgeDetailSeat, makeEdgeDetailSeats, sameEdgeDetailSeats } from '@axe/ui/tabletop/edge-detail-layout';

export interface TooltipPanelInstance {
  tabletopObject: TabletopObject | null;
  left: number;
  top: number;
  rotationDegrees: number;
  edgeSeat: EdgeDetailSeat | null;
  placementListener: (() => void) | null;
  applyEdgePlacement(): void;
  coversPoint(x: number, y: number): boolean;
  setPointerHidden(hidden: boolean): void;
}

/**
 * One showing of the detail, however many panels it puts on screen.
 *
 * The panels of a showing appear and go together, so what they share — the deletion
 * watch, the listeners that close them, the follow-up that keeps them placed — belongs
 * to the showing rather than to any one panel.
 */
interface TooltipSession {
  readonly refs: ComponentRef<TooltipPanelInstance>[];
  readonly seats: EdgeDetailSeat[] | null;
  deleteOff?: () => void;
  detach: () => void;
}

const OPEN_DELAY_MS = 100;
const CLOSE_DELAY_MS = 400;
/** Later than the 250ms an orientation change gives DraggableDirective, so the seats are placed last. */
const VIEWPORT_FOLLOW_DELAY_MS = 300;

@Directive({ selector: '[appTooltip]' })
export class TooltipDirective {
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly viewport = inject(ViewportService);
  private readonly destroyRef = inject(DestroyRef);

  static TooltipPanelComponentClass: Type<TooltipPanelInstance> | null = null;

  /** The one showing on screen, whichever piece raised it. */
  private static activeOwner: TooltipDirective | null = null;

  readonly tabletopObject = input.required<TabletopObject>({ alias: 'appTooltip' });

  private callbackOnMouseEnter = (e: Event) => this.onMouseEnter(e as MouseEvent);
  private callbackOnMouseLeave = (e: Event) => this.onMouseLeave(e as MouseEvent);
  private callbackOnMouseDown = (e: Event) => this.onMouseDown(e as MouseEvent);
  private callbackOnMouseMove = (e: Event) => this.onMouseMove(e as MouseEvent);

  private openTooltipTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTooltipTimer: ReturnType<typeof setTimeout> | null = null;

  private tooltipSession: TooltipSession | null = null;
  private tooltipRotationDegrees = 0;
  private tapGesture: TapGestureHandle | null = null;

  constructor() {
    afterNextRender(() => {
      const element = this.viewContainerRef.element.nativeElement as Element;
      this.addEventListeners(element);
      this.tapGesture = observeTap(element, () => this.onTap());
    });
    this.destroyRef.onDestroy(() => {
      this.removeEventListeners(this.viewContainerRef.element.nativeElement);
      this.tapGesture?.destroy();
      this.tapGesture = null;
      this.clearTimer();
      this.close();
    });
  }

  private onTap() {
    if (!this.viewport.isTouch()) return;
    this.clearTimer();
    if (this.hasTooltip()) {
      this.closeAll();
      return;
    }
    this.open();
  }

  private onMouseEnter(e: MouseEvent) {
    this.clearTimer();
    this.tooltipRotationDegrees = this.rotationDegreesAt(e.clientX, e.clientY);
    if (!this.hasTooltip()) this.startOpenTimer();
  }

  private onMouseLeave(_e: MouseEvent) {
    this.clearTimer();
    if (this.hasTooltip()) this.startCloseTimer();
  }

  private onMouseDown(e: MouseEvent) {
    if (!this.hasTooltip()) return;
    if (
      !this.containsInTooltip(e.target as Node) &&
      !this.viewContainerRef.element.nativeElement.contains(e.target as Node)
    ) {
      this.closeAll();
    }
  }

  private onMouseMove(e: MouseEvent) {
    const session = this.tooltipSession;
    if (session?.seats) this.hidePanelUnderPointer(session, e.clientX, e.clientY);
  }

  /**
   * Keeps the pointer's own corner of the table clear.
   *
   * A detail that has come to rest over the piece being pointed at hides itself, so that
   * the piece and the table under it stay in view. Only the one panel under the pointer
   * goes; the others carry the same reading for everyone else around the table.
   */
  private hidePanelUnderPointer(
    session: TooltipSession,
    pointerX: number = this.pointerDeviceService.pointerX,
    pointerY: number = this.pointerDeviceService.pointerY
  ): void {
    if (!session.seats) return;

    // Without a pointer to keep clear of, every detail belongs on screen.
    const follows = !this.viewport.isTouch();
    let hidden = false;
    for (const ref of [...session.refs]) {
      const covers: boolean = follows && !hidden && ref.instance.coversPoint(pointerX, pointerY);
      ref.instance.setPointerHidden(covers);
      hidden = hidden || covers;
    }
  }

  private hasTooltip(): boolean {
    return (this.tooltipSession?.refs.length ?? 0) > 0;
  }

  private containsInTooltip(target: Node): boolean {
    return this.tooltipSession?.refs.some((ref) => ref.location.nativeElement.contains(target)) ?? false;
  }

  private startOpenTimer() {
    const pointerX = this.pointerDeviceService.pointerX;
    const pointerY = this.pointerDeviceService.pointerY;

    this.openTooltipTimer = setTimeout(() => {
      this.openTooltipTimer = null;
      const magnitude =
        (pointerX - this.pointerDeviceService.pointerX) ** 2 + (pointerY - this.pointerDeviceService.pointerY) ** 2;
      if (magnitude > 4) {
        this.startOpenTimer();
      } else {
        this.open();
      }
    }, OPEN_DELAY_MS);
  }

  private startCloseTimer() {
    this.closeTooltipTimer = setTimeout(() => {
      this.closeTooltipTimer = null;
      if (document.activeElement && this.containsInTooltip(document.activeElement)) {
        this.startCloseTimer();
      } else {
        this.closeAll();
      }
    }, CLOSE_DELAY_MS);
  }

  private clearTimer() {
    if (this.closeTooltipTimer) clearTimeout(this.closeTooltipTimer);
    if (this.openTooltipTimer) clearTimeout(this.openTooltipTimer);
    this.closeTooltipTimer = this.openTooltipTimer = null;
  }

  private open() {
    this.closeAll();
    if (this.pointerDeviceService.isDragging) return;
    const panelClass = TooltipDirective.TooltipPanelComponentClass;
    if (!panelClass) return;

    const parentViewContainerRef = ContextMenuService.defaultParentViewContainerRef;
    const injector = parentViewContainerRef.injector;
    const seats = this.edgeSeats();
    const refs: ComponentRef<TooltipPanelInstance>[] = [];
    const session: TooltipSession = { refs, seats, detach: () => {} };
    this.tooltipSession = session;

    for (const seat of seats ?? [null]) {
      const componentRef = parentViewContainerRef.createComponent(panelClass, {
        index: parentViewContainerRef.length,
        injector,
      });
      const element = componentRef.location.nativeElement as HTMLElement;

      componentRef.instance.tabletopObject = this.tabletopObject();
      if (seat) {
        // A detail on the edge is there to be read, so nothing hovers or focuses it.
        componentRef.instance.edgeSeat = seat;
        componentRef.instance.rotationDegrees = seat.rotationDegrees;
        componentRef.instance.placementListener = () => this.hidePanelUnderPointer(session);
      } else {
        componentRef.instance.left = this.pointerDeviceService.pointerX;
        componentRef.instance.top = this.pointerDeviceService.pointerY;
        componentRef.instance.rotationDegrees = this.tooltipRotationDegrees;
        if (this.viewport.isTouch()) element.classList.add('tooltip-passthrough');
        this.addEventListeners(element);
        componentRef.onDestroy(() => this.removeEventListeners(element));
      }
      componentRef.onDestroy(() => {
        const index = refs.indexOf(componentRef);
        if (index >= 0) refs.splice(index, 1);
      });
      refs.push(componentRef);
    }

    document.body.addEventListener('touchstart', this.callbackOnMouseDown, true);
    document.body.addEventListener('mousedown', this.callbackOnMouseDown, true);
    session.deleteOff = this.objectChange.objectDeleted$.subscribe((e) => {
      if (this.tabletopObject() && this.tabletopObject().identifier === e.identifier) this.closeAll();
    });

    let followTimer: ReturnType<typeof setTimeout> | null = null;
    const followViewport = () => {
      if (followTimer) clearTimeout(followTimer);
      followTimer = setTimeout(() => {
        followTimer = null;
        this.onViewportChanged(session);
      }, VIEWPORT_FOLLOW_DELAY_MS);
    };
    const host = this.viewContainerRef.element.nativeElement as Element;
    if (seats) {
      window.addEventListener('resize', followViewport, false);
      window.addEventListener('orientationchange', followViewport, false);
      host.addEventListener('mousemove', this.callbackOnMouseMove, false);
    }
    session.detach = () => {
      document.body.removeEventListener('touchstart', this.callbackOnMouseDown, true);
      document.body.removeEventListener('mousedown', this.callbackOnMouseDown, true);
      if (seats) {
        window.removeEventListener('resize', followViewport, false);
        window.removeEventListener('orientationchange', followViewport, false);
        host.removeEventListener('mousemove', this.callbackOnMouseMove, false);
      }
      if (followTimer) clearTimeout(followTimer);
      followTimer = null;
    };

    TooltipDirective.activeOwner = this;
  }

  /** The seats to fill, or null when the detail belongs beside the piece as it always has. */
  private edgeSeats(): EdgeDetailSeat[] | null {
    const display = this.tabletopService.tabletopDisplaySettings;
    if (!display.enabled() || asHoverDetailPlacement(display.hoverDetailPlacement()) !== 'screen-edges') return null;
    return makeEdgeDetailSeats(window.innerWidth, window.innerHeight);
  }

  /** A screen that changed shape may want other seats; one that only grew just wants the panels moved. */
  private onViewportChanged(session: TooltipSession): void {
    if (this.tooltipSession !== session || !session.seats) return;

    if (!sameEdgeDetailSeats(session.seats, makeEdgeDetailSeats(window.innerWidth, window.innerHeight))) {
      // Building the seats again clears the timers, so a detail on its way out keeps going.
      const wasClosing = this.closeTooltipTimer !== null;
      this.open();
      if (wasClosing && this.hasTooltip()) this.startCloseTimer();
      return;
    }
    for (const ref of [...session.refs]) ref.instance.applyEdgePlacement();
  }

  private rotationDegreesAt(pointerX: number, pointerY: number): number {
    const object = this.tabletopObject();
    const display = this.tabletopService.tabletopDisplaySettings;
    if (!(object instanceof GameCharacter) || !display.enabled() || !display.multiAngleEnabled()) return 0;

    const host = this.viewContainerRef.element.nativeElement as Element;
    const piece = host.querySelector('[data-testid="piece-body"]') ?? host;
    const rect = piece.getBoundingClientRect();
    return multiAngleDegreesFromPoint(pointerX, pointerY, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  private close() {
    const session = this.tooltipSession;
    if (!session) return;

    this.tooltipSession = null;
    if (TooltipDirective.activeOwner === this) TooltipDirective.activeOwner = null;
    session.deleteOff?.();
    session.deleteOff = undefined;
    session.detach();
    this.clearTimer();

    for (const componentRef of [...session.refs]) componentRef.destroy();
    session.refs.length = 0;
  }

  private closeAll() {
    const owner = TooltipDirective.activeOwner;
    if (owner && owner !== this) owner.close();
    this.close();
  }

  private addEventListeners(element: Element) {
    element.addEventListener('mouseenter', this.callbackOnMouseEnter, false);
    element.addEventListener('mouseleave', this.callbackOnMouseLeave, false);
  }

  private removeEventListeners(element: Element) {
    element.removeEventListener('mouseenter', this.callbackOnMouseEnter, false);
    element.removeEventListener('mouseleave', this.callbackOnMouseLeave, false);
  }
}
