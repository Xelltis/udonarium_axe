import {
  afterNextRender,
  ComponentRef,
  DestroyRef,
  Directive,
  inject,
  Injectable,
  InjectionToken,
  input,
  Type,
  ViewContainerRef,
} from '@angular/core';
import { type MousePlace, PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';
import { ReloadNoticeService } from '@axe/application/ui/reload-notice.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { observeTap, TapGestureHandle, type TapPoint } from '@axe/core/input/tap-gesture';
import { Logger } from '@axe/core/logging/logger';
import { debounce } from '@axe/core/util/debounce';
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

/** Fetches the detail panel a piece's tooltip opens. The app hands it in; with none, no detail is shown. */
export const TOOLTIP_PANEL_LOADER = new InjectionToken<(() => Promise<Type<TooltipPanelInstance>>) | null>(
  'TOOLTIP_PANEL_LOADER',
  { providedIn: 'root', factory: () => null }
);

/** The detail panel is fetched the first time a piece asks for it, and kept for every piece from then on. */
@Injectable({ providedIn: 'root' })
export class TooltipPanelSource {
  load = inject(TOOLTIP_PANEL_LOADER);
  /** The panel, once it has arrived. */
  panel: Type<TooltipPanelInstance> | null = null;
  /**
   * Whether the fetch failed, after which no piece asks for the panel again: the page's files have
   * gone with a release, and the reader has been asked to reload.
   */
  failed = false;
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
  /** Where the detail was opened, the mouse resting or a finger tapping, and in which window. */
  readonly at: MousePlace;
  /** The window the detail opened in, which it is laid out by and closes with. */
  readonly view: Window;
  deleteOff?: () => void;
  /** Stops watching the thing for being moved from where a detail was opened beside it. */
  movedOff?: () => void;
  detach: () => void;
}

const OPEN_DELAY_MS = 100;
/** How far the pointer may drift during the opening delay and still count as resting. */
const HOVER_STILL_PX = 2;
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
  private readonly overlays = inject(OverlayLayers);
  private readonly panels = inject(TooltipPanelSource);
  private readonly reloadNotice = inject(ReloadNoticeService);
  /**
   * The tooltip of the thing this one's host is drawn inside, as a part's row is drawn inside its
   * body's piece: while the pointer is over this one, that one stands aside.
   */
  private readonly outer = inject(TooltipDirective, { skipSelf: true, optional: true });

  /** The one showing on screen, whichever piece raised it. */
  private static activeOwner: TooltipDirective | null = null;

  /** The thing whose detail is shown; with none the host shows no detail of its own, and one around it shows its own over it. */
  readonly tabletopObject = input.required<TabletopObject | null>({ alias: 'appTooltip' });
  /** Whether no tooltip opens for now, as over a look on the ground locked in place; one open closes. */
  readonly off = input(false, { alias: 'appTooltipOff' });

  private callbackOnMouseEnter = (e: Event) => this.onMouseEnter(e as MouseEvent);
  private callbackOnMouseLeave = (e: Event) => this.onMouseLeave(e as MouseEvent);
  private callbackOnMouseDown = (e: Event) => this.onMouseDown(e as MouseEvent);
  private callbackOnMouseMove = (e: Event) => this.onMouseMove(e as MouseEvent);
  private callbackOnPressWhileWaiting = (e: Event) => this.onPressWhileWaiting(e);

  private openTooltipTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTooltipTimer: ReturnType<typeof setTimeout> | null = null;
  private waitingForPanel = false;
  /** The body a press is heard on while the detail is fetched, to give up waiting for it. */
  private waitingIn: HTMLElement | null = null;

  private tooltipSession: TooltipSession | null = null;
  private tooltipRotationDegrees = 0;
  private tapGesture: TapGestureHandle | null = null;
  /** Whether a tap just now belonged to a tooltip inside this one's host, which has shown its own detail for it. */
  private tapTaken = false;

  constructor() {
    afterNextRender(() => {
      const element = this.viewContainerRef.element.nativeElement as Element;
      this.addEventListeners(element);
      this.tapGesture = observeTap(element, (point) => this.onTap(point));
    });
    this.destroyRef.onDestroy(() => {
      this.removeEventListeners(this.viewContainerRef.element.nativeElement);
      this.tapGesture?.destroy();
      this.tapGesture = null;
      this.clearTimer();
      this.close();
    });
  }

  private onTap(point: TapPoint) {
    if (this.tapTaken) {
      this.tapTaken = false;
      return;
    }
    if (!this.viewport.isTouch() || !this.tabletopObject()) return;
    if (this.outer) this.outer.tapTaken = true;
    this.clearTimer();
    if (this.hasTooltip()) {
      this.closeAll();
      return;
    }
    const host = this.viewContainerRef.element.nativeElement as Element;
    this.tooltipRotationDegrees = this.rotationDegreesAt(point.x, point.y);
    this.open({ document: host.ownerDocument, x: point.x, y: point.y }, true);
  }

  private onMouseEnter(e: MouseEvent) {
    if (!this.tabletopObject()) return;
    this.outer?.clearTimer();
    this.clearTimer();
    this.tooltipRotationDegrees = this.rotationDegreesAt(e.clientX, e.clientY);
    if (!this.hasTooltip()) this.startOpenTimer();
  }

  private onMouseLeave(e: MouseEvent) {
    if (!this.tabletopObject() && !this.hasTooltip()) return;
    this.clearTimer();
    if (this.hasTooltip()) this.startCloseTimer();
    const outer = this.outer;
    const next = e.relatedTarget;
    if (outer && next instanceof Node && outer.viewContainerRef.element.nativeElement.contains(next)) {
      outer.onMouseEnter(e);
    }
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
   * goes; the others carry the same reading for everyone else around the table. Where the
   * mouse is in another window than the details stand in, none hides.
   */
  private hidePanelUnderPointer(session: TooltipSession, x?: number, y?: number): void {
    if (!session.seats) return;
    const here = this.pointerDeviceService.mouseAt;
    const inView = here !== null && here.document === session.view.document;
    const pointerX = x ?? (inView ? here.x : null);
    const pointerY = y ?? (inView ? here.y : null);

    // Without a pointer to keep clear of, every detail belongs on screen.
    const follows = !this.viewport.isTouch();
    let hidden = false;
    for (const ref of [...session.refs]) {
      const covers: boolean =
        follows && !hidden && pointerX !== null && pointerY !== null && ref.instance.coversPoint(pointerX, pointerY);
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

  /**
   * Waits a moment to open the detail, starting over while the mouse moves, and opens it once the
   * mouse rests where the host is the topmost thing under it, beside the mouse in the window the host
   * is in. Where the mouse is comes from the one place that hears it in every window of the app (see
   * `PointerDeviceService.mouseAt`), so the mouse having moved on without the host hearing it leave,
   * something having come over the host, a host coming under a mouse at rest, and a host in a window
   * of its own are all one question: what is topmost where the mouse rests now.
   */
  private startOpenTimer() {
    const from = this.pointerDeviceService.mouseAt;
    this.openTooltipTimer = setTimeout(() => {
      this.openTooltipTimer = null;
      const at = this.pointerDeviceService.mouseAt;
      if (!from || !at) return;
      if (at.document !== from.document || (from.x - at.x) ** 2 + (from.y - at.y) ** 2 > HOVER_STILL_PX ** 2) {
        this.startOpenTimer();
        return;
      }
      if (this.isTopmostAt(at)) this.open(at);
    }, OPEN_DELAY_MS);
  }

  /** Whether the host is the topmost thing where the mouse is, in the host's own window, or holds what is. */
  private isTopmostAt(at: MousePlace): boolean {
    const host = this.viewContainerRef.element.nativeElement as Element;
    if (at.document !== host.ownerDocument) return false;
    const topmost = at.document.elementFromPoint(at.x, at.y);
    return topmost !== null && host.contains(topmost);
  }

  private startCloseTimer() {
    this.closeTooltipTimer = setTimeout(() => {
      this.closeTooltipTimer = null;
      const focused = (this.tooltipSession?.view.document ?? document).activeElement;
      if (focused && this.containsInTooltip(focused)) {
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
    this.stopWaitingForPanel();
  }

  /**
   * Fetches the detail panel, and shows it if this piece still wants it once it arrives.
   *
   * A touch or a press anywhere but this piece while it is on its way means the reader has moved
   * on, so it is not shown then, the same as a showing would close.
   *
   * A fetch that fails asks the reader to reload the page, as any part of the app that cannot be
   * fetched does, and is not tried again: every hover would fail the same way.
   */
  /**
   * Fetches the detail the first time it is asked for, and opens it once it has come where the mouse
   * still rests on the host, as the mouse then is, or for a tap as a tap does.
   */
  private fetchPanelThenOpen(at: MousePlace, tapped: boolean) {
    const load = this.panels.load;
    if (!load || this.panels.failed) return;
    this.waitingForPanel = true;
    this.waitingIn = at.document.body;
    this.waitingIn.addEventListener('touchstart', this.callbackOnPressWhileWaiting, true);
    this.waitingIn.addEventListener('pointerdown', this.callbackOnPressWhileWaiting, true);
    void load()
      .then((panelClass) => {
        this.panels.panel = panelClass;
        if (!this.waitingForPanel) return;
        const now = this.pointerDeviceService.mouseAt;
        if (tapped) this.open(at, true);
        else if (now && this.isTopmostAt(now)) this.open(now);
        else this.stopWaitingForPanel();
      })
      .catch((reason: unknown) => {
        Logger.warn('[Tooltip] コマの詳細を読み込めませんでした', reason);
        this.panels.failed = true;
        this.stopWaitingForPanel();
        this.reloadNotice.tellReloadNeeded();
      });
  }

  private onPressWhileWaiting(e: Event) {
    const host = this.viewContainerRef.element.nativeElement as Element;
    if (!host.contains(e.target as Node)) this.stopWaitingForPanel();
  }

  private stopWaitingForPanel() {
    if (!this.waitingForPanel) return;
    this.waitingForPanel = false;
    this.waitingIn?.removeEventListener('touchstart', this.callbackOnPressWhileWaiting, true);
    this.waitingIn?.removeEventListener('pointerdown', this.callbackOnPressWhileWaiting, true);
    this.waitingIn = null;
  }

  /**
   * Opens the detail beside the point it is opened at, the mouse resting or a finger tapping, in the
   * window of that point: laid out by that window, and closed by a press in it.
   */
  private open(at: MousePlace, tapped = false) {
    this.closeAll();
    const tabletopObject = this.tabletopObject();
    if (this.pointerDeviceService.isDragging || this.off() || !tabletopObject) return;
    const panelClass = this.panels.panel;
    if (!panelClass) {
      this.fetchPanelThenOpen(at, tapped);
      return;
    }
    this.stopWaitingForPanel();

    const parentViewContainerRef = this.overlays.layerFor(at.document) ?? this.overlays.mainLayer();
    const injector = parentViewContainerRef.injector;
    const view = (parentViewContainerRef.element.nativeElement as Node).ownerDocument?.defaultView ?? window;
    const seats = this.edgeSeats(view);
    const refs: ComponentRef<TooltipPanelInstance>[] = [];
    const session: TooltipSession = { refs, seats, at, view, detach: () => {} };
    this.tooltipSession = session;

    for (const seat of seats ?? [null]) {
      const componentRef = parentViewContainerRef.createComponent(panelClass, {
        index: parentViewContainerRef.length,
        injector,
      });
      const element = componentRef.location.nativeElement as HTMLElement;

      componentRef.instance.tabletopObject = tabletopObject;
      if (seat) {
        // A detail on the edge is there to be read, so nothing hovers or focuses it.
        componentRef.instance.edgeSeat = seat;
        componentRef.instance.rotationDegrees = seat.rotationDegrees;
        componentRef.instance.placementListener = () => this.hidePanelUnderPointer(session);
      } else {
        componentRef.instance.left = at.x;
        componentRef.instance.top = at.y;
        componentRef.instance.rotationDegrees = this.tooltipRotationDegrees;
        if (this.viewport.isTouch()) element.classList.add('tooltip-passthrough');
        this.addEventListeners(element);
        componentRef.onDestroy(() => this.removeEventListeners(element));
      }
      componentRef.onDestroy(() => {
        const index = refs.indexOf(componentRef);
        if (index >= 0) refs.splice(index, 1);
        if (refs.length === 0 && this.tooltipSession === session) this.close();
      });
      refs.push(componentRef);
    }

    const pressedIn = at.document.body;
    pressedIn.addEventListener('touchstart', this.callbackOnMouseDown, true);
    pressedIn.addEventListener('mousedown', this.callbackOnMouseDown, true);
    session.deleteOff = this.objectChange.objectDeleted$.subscribe((e) => {
      if (this.tabletopObject()?.identifier === e.identifier) this.closeAll();
    });
    if (!seats) {
      const stoodAt = placeOf(tabletopObject);
      session.movedOff = this.objectChange.onObjectChangedForIdentifier(tabletopObject.identifier, () => {
        if (this.tooltipSession === session && placeOf(tabletopObject) !== stoodAt) this.closeAll();
      });
    }

    const followViewport = debounce(() => this.onViewportChanged(session), VIEWPORT_FOLLOW_DELAY_MS);
    const host = this.viewContainerRef.element.nativeElement as Element;
    if (seats) {
      view.addEventListener('resize', followViewport, false);
      view.addEventListener('orientationchange', followViewport, false);
      host.addEventListener('mousemove', this.callbackOnMouseMove, false);
    }
    session.detach = () => {
      pressedIn.removeEventListener('touchstart', this.callbackOnMouseDown, true);
      pressedIn.removeEventListener('mousedown', this.callbackOnMouseDown, true);
      if (seats) {
        view.removeEventListener('resize', followViewport, false);
        view.removeEventListener('orientationchange', followViewport, false);
        host.removeEventListener('mousemove', this.callbackOnMouseMove, false);
      }
      followViewport.cancel();
    };

    TooltipDirective.activeOwner = this;
  }

  /** The seats to fill in the window the detail opens in, or null when the detail belongs beside the piece as it always has. */
  private edgeSeats(view: Window): EdgeDetailSeat[] | null {
    const display = this.tabletopService.display();
    if (!this.tabletopService.mode2d() || asHoverDetailPlacement(display.hoverDetailPlacement) !== 'screen-edges') {
      return null;
    }
    return makeEdgeDetailSeats(view.innerWidth, view.innerHeight);
  }

  /** A screen that changed shape may want other seats; one that only grew just wants the panels moved. */
  private onViewportChanged(session: TooltipSession): void {
    if (this.tooltipSession !== session || !session.seats) return;

    if (!sameEdgeDetailSeats(session.seats, makeEdgeDetailSeats(session.view.innerWidth, session.view.innerHeight))) {
      // Building the seats again clears the timers, so a detail on its way out keeps going.
      const wasClosing = this.closeTooltipTimer !== null;
      this.open(session.at);
      if (wasClosing && this.hasTooltip()) this.startCloseTimer();
      return;
    }
    for (const ref of [...session.refs]) ref.instance.applyEdgePlacement();
  }

  private rotationDegreesAt(pointerX: number, pointerY: number): number {
    const object = this.tabletopObject();
    const display = this.tabletopService.display();
    if (!(object instanceof GameCharacter) || !this.tabletopService.mode2d() || !display.multiAngleEnabled) return 0;

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
    session.movedOff?.();
    session.movedOff = undefined;
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

/**
 * Where a thing stands, as one text. A detail opened beside a piece stays where the pointer was;
 * left there once the piece is put down somewhere else, it can lie over the piece and take the
 * presses meant for it, so it is put away as soon as its piece stands anywhere else.
 */
function placeOf(object: TabletopObject): string {
  return `${object.location.x},${object.location.y},${object.posZ}`;
}
