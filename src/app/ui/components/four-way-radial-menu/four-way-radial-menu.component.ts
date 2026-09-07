import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuService,
  ContextMenuType,
} from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelRotationDegrees, PanelService } from '@axe/application/ui/panel.service';
import {
  DEFAULT_RADIAL_MENU_ROTATION_SPEED,
  MAX_RADIAL_MENU_ROTATION_SPEED,
  MIN_RADIAL_MENU_ROTATION_SPEED,
} from '@axe/domain/tabletop/radial-menu';
import { ContextMenuComponent } from '@axe/ui/components/context-menu/context-menu.component';
import {
  annularSectorLabelPoint,
  annularSectorLabelWidth,
  annularSectorPolygon,
  clampRadialCenter,
  nearestCardinalRotation,
  outwardRotationOnRing,
  pointAtAngle,
  pointOnRing,
  RadialMenuSeat,
  RadialPoint,
  seatAngle,
  seatTextRotation,
} from '@axe/ui/components/four-way-radial-menu/four-way-radial-menu-geometry';
import { TranslocoModule } from '@jsverse/transloco';

interface ActionPresentation {
  label: string;
  kind: 'checkbox' | 'radio' | 'selected' | 'none';
  checked: boolean | null;
  icon: string | null;
}

interface RadialFlyout {
  action: ContextMenuAction;
  actions: ContextMenuAction[];
  left: number;
  top: number;
  rotation: PanelRotationDegrees;
}

const SEATS: RadialMenuSeat[] = ['north', 'east', 'south', 'west'];
const GUIDE_BOUNDARY_ANGLES = [-135, -45, 45, 135];
const DIRECTION_GUIDE_ANGLES = [-90, 0, 90, 180];
const LAUNCHER_RADIUS_PX = 70;
const LAUNCHER_HALF_EXTENT_PX = 28;
const ITEM_HALF_EXTENT_PX = 60;
const RING_CLEARANCE_GAP_PX = 8;
const GUIDE_OCCLUSION_GAP_PX = 2;
const ROOT_BAND_HALF_DEPTH_PX = 28;
const CHILD_LIST_GAP_PX = 8;
const CHILD_LIST_WIDTH_PX = 128;
const CHILD_ITEM_HEIGHT_PX = 28;
const ROOT_LABEL_HEIGHT_PX = 28;
const CHILD_ITEM_GAP_PX = 2;
const CHILD_LIST_VERTICAL_PADDING_PX = 8;
const DETACHED_BRANCH_ITEMS_ENABLED = true;
const SECTOR_GAP_PX = 3;
const MENU_VIEWPORT_MARGIN_PX = 12;
const PARENT_CLICK_PAUSE_MS = 3000;
const FULL_ROTATION_DEGREES = 360;
const FORCED_ROTATION_STEP_DEGREES = 45;
const ROTATION_EPSILON = 1e-9;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'four-way-radial-menu',
  templateUrl: './four-way-radial-menu.component.html',
  imports: [ContextMenuComponent, TranslocoModule],
  host: {
    class: 'block',
    '(window:resize)': 'onResize()',
  },
})
export class FourWayRadialMenuComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly contextMenuService = inject(ContextMenuService);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly seatOptions = SEATS;
  protected readonly guideBoundaryAngles = GUIDE_BOUNDARY_ANGLES;
  protected readonly directionGuideAngles = DIRECTION_GUIDE_ANGLES;
  protected readonly selectedSeat = signal<RadialMenuSeat | null>(null);
  protected readonly ringStartAngle = -90;
  protected readonly manualRotationDegrees = signal(0);
  protected readonly manualRotationTransitionEnabled = signal(true);
  protected readonly manualRotationStyleDegrees = computed(() => Number(this.manualRotationDegrees().toFixed(6)));
  protected readonly detachedBranchItemsEnabled = DETACHED_BRANCH_ITEMS_ENABLED;
  protected readonly pausedParentIndex = signal<number | null>(null);
  protected readonly flyout = signal<RadialFlyout | null>(null);
  protected readonly flyoutItems = computed(() => {
    const flyout = this.flyout();
    return flyout ? [flyout] : [];
  });
  protected readonly ringPaused = computed(() => this.pausedParentIndex() !== null || this.flyout() !== null);
  private readonly viewport = signal({ width: window.innerWidth, height: window.innerHeight });
  private readonly actionRotationDegrees = signal<PanelRotationDegrees>(0);
  private parentPauseTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly radialGroups = computed(() =>
    this.contextMenuService.radialGroups.filter((group) => this.actionItems(group.actions).length > 0)
  );
  protected readonly ringItemCount = computed(() => this.radialGroups().length + 1);
  protected readonly maxChildCount = computed(() =>
    this.radialGroups().reduce((maximum, group) => Math.max(maximum, this.actionItems(group.actions).length), 0)
  );
  protected readonly clearanceRadius = computed(() => {
    const radius = Number(this.contextMenuService.radialMenuClearanceRadius);
    return Number.isFinite(radius) ? Math.max(0, radius) : 0;
  });
  protected readonly launcherRadius = computed(() =>
    Math.max(LAUNCHER_RADIUS_PX, this.clearanceRadius() + LAUNCHER_HALF_EXTENT_PX)
  );
  protected readonly ringRadius = computed(() => {
    const shortestSide = Math.min(this.viewport().width, this.viewport().height);
    const baseRadius = Math.max(82, Math.min(138, shortestSide / 2 - ITEM_HALF_EXTENT_PX - 12));
    return Math.max(baseRadius, this.clearanceRadius() + ITEM_HALF_EXTENT_PX + RING_CLEARANCE_GAP_PX);
  });
  protected readonly rootInnerRadius = computed(() => Math.max(1, this.ringRadius() - ROOT_BAND_HALF_DEPTH_PX));
  protected readonly rootOuterRadius = computed(() => this.ringRadius() + ROOT_BAND_HALF_DEPTH_PX);
  protected readonly menuExtent = computed(() => {
    const childCount = this.maxChildCount();
    if (childCount < 1) return this.rootOuterRadius() + MENU_VIEWPORT_MARGIN_PX;

    const listHeight =
      childCount * this.childItemHeight() +
      (DETACHED_BRANCH_ITEMS_ENABLED
        ? Math.max(0, childCount - 1) * CHILD_ITEM_GAP_PX
        : CHILD_LIST_VERTICAL_PADDING_PX);
    const farEdge = this.childListAnchorRadius() + listHeight;
    return Math.hypot(farEdge, this.childListWidth() / 2) + MENU_VIEWPORT_MARGIN_PX;
  });
  protected readonly center = computed(() =>
    clampRadialCenter(this.contextMenuService.position, this.viewport(), this.menuExtent())
  );
  protected readonly connectorVisible = computed(() => {
    const center = this.center();
    const anchor = this.anchor;
    return Math.hypot(center.x - anchor.x, center.y - anchor.y) > 4;
  });
  protected readonly guideOcclusionHalfExtent = computed(() =>
    this.connectorVisible() || this.contextMenuService.radialMenuOcclusionHalfExtent <= 0
      ? 0
      : this.contextMenuService.radialMenuOcclusionHalfExtent + GUIDE_OCCLUSION_GAP_PX
  );

  constructor() {
    afterNextRender(() => this.focusFirstControl());
    this.destroyRef.onDestroy(() => this.clearParentPauseTimer());
  }

  protected get title(): string {
    return this.contextMenuService.title;
  }

  protected get anchor(): RadialPoint {
    return this.contextMenuService.radialAnchorPosition ?? this.contextMenuService.position;
  }

  protected ringDurationSeconds(): number {
    const configured = Number(this.contextMenuService.radialMenuRotationSpeed);
    const speed = Number.isFinite(configured)
      ? Math.max(MIN_RADIAL_MENU_ROTATION_SPEED, Math.min(configured, MAX_RADIAL_MENU_ROTATION_SPEED))
      : DEFAULT_RADIAL_MENU_ROTATION_SPEED;
    return 360 / speed;
  }

  protected onResize(): void {
    this.viewport.set({ width: window.innerWidth, height: window.innerHeight });
  }

  protected close(): void {
    this.clearParentPauseTimer();
    this.contextMenuService.close();
  }

  protected onBackdropPointerDown(event: PointerEvent): void {
    if (event.button === 2 && this.contextMenuService.radialMenuEnabled) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    if (this.flyout()) {
      this.closeFlyout();
      return;
    }
    this.close();
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.contextMenuService.radialMenuEnabled) {
      this.closeFlyout();
      this.rotateMenuByFixedStep();
    }
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.flyout()) {
        this.closeFlyout();
        return;
      }
      this.close();
      return;
    }
    if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return;

    const controls = this.focusableControls();
    if (controls.length < 1) return;
    event.preventDefault();
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    controls[(current + delta + controls.length) % controls.length]?.focus();
  }

  protected chooseSeat(seat: RadialMenuSeat): void {
    this.selectedSeat.set(seat);
    this.actionRotationDegrees.set(seatTextRotation(seat) as PanelRotationDegrees);
    this.openFullMenu();
  }

  protected pauseAtGroup(index: number): void {
    this.closeFlyout();
    this.rememberItemDirection(index, this.ringItemCount());
    this.pausedParentIndex.set(index);
    this.clearParentPauseTimer();
    this.parentPauseTimer = setTimeout(() => {
      this.pausedParentIndex.set(null);
      this.parentPauseTimer = null;
    }, PARENT_CLICK_PAUSE_MS);
  }

  protected chooseAction(action: ContextMenuAction, parentIndex: number, event: MouseEvent): void {
    if (!this.actionEnabled(action)) return;
    this.rememberItemDirection(parentIndex, this.ringItemCount());
    const subActions = this.actionItems(action.subActions ?? []);
    if (subActions.length > 0) {
      if (this.flyout()?.action === action) {
        this.closeFlyout();
        return;
      }
      const button = event.currentTarget as HTMLElement | null;
      const rect = button?.getBoundingClientRect();
      const rotation = this.selectedRotationDegrees();
      this.contextMenuService.rotationDegrees = rotation;
      this.flyout.set({
        action,
        actions: subActions,
        left: rect?.right ?? this.center().x,
        top: rect ? rect.top + rect.height / 2 : this.center().y,
        rotation,
      });
      return;
    }
    if (action.action) {
      this.runAction(action);
    }
  }

  protected closeFlyout(): void {
    this.flyout.set(null);
  }

  protected isFlyoutAction(action: ContextMenuAction): boolean {
    return this.flyout()?.action === action;
  }

  protected openFullMenu(): void {
    this.contextMenuService.openDirectional(
      this.fullMenuPosition(),
      this.contextMenuService.actions,
      this.selectedRotationDegrees(),
      this.contextMenuService.title
    );
  }

  protected rotateMenuByFixedStep(): void {
    this.manualRotationDegrees.update((degrees) => {
      const next = degrees + FORCED_ROTATION_STEP_DEGREES;
      const fullTurn = Math.round(next / FULL_ROTATION_DEGREES) * FULL_ROTATION_DEGREES;
      return Math.abs(next - fullTurn) < ROTATION_EPSILON ? fullTurn : next;
    });
  }

  protected onManualRotationTransitionEnd(event: TransitionEvent): void {
    if (event.propertyName !== 'rotate') return;

    const degrees = this.manualRotationDegrees();
    const normalized = degrees % FULL_ROTATION_DEGREES;
    if (Math.abs(degrees - normalized) < ROTATION_EPSILON) return;

    this.manualRotationTransitionEnabled.set(false);
    this.manualRotationDegrees.set(Math.abs(normalized) < ROTATION_EPSILON ? 0 : normalized);
    requestAnimationFrame(() => this.manualRotationTransitionEnabled.set(true));
  }

  protected launcherPoint(seat: RadialMenuSeat): RadialPoint {
    return pointAtAngle(seatAngle(seat), this.launcherRadius());
  }

  protected guideBoundaryPoint(angle: number): RadialPoint {
    const radius = this.ringRadius();
    const offset = pointAtAngle(angle, radius);
    return { x: radius + offset.x, y: radius + offset.y };
  }

  protected guideArrowTransform(angle: number): string {
    const radius = this.ringRadius();
    return `translate(${radius} ${radius}) rotate(${angle}) translate(${radius * 0.52} 0)`;
  }

  protected guidePanelRotation(angle: number): PanelRotationDegrees {
    return nearestCardinalRotation(angle + 270);
  }

  protected groupActions(group: ContextMenuRadialGroup): ContextMenuAction[] {
    return this.actionItems(group.actions);
  }

  protected rootSectorSize(): number {
    return this.rootOuterRadius() * 2;
  }

  protected rootSectorClipPath(index: number): string {
    return annularSectorPolygon(
      index,
      this.ringItemCount(),
      this.rootInnerRadius(),
      this.rootOuterRadius(),
      SECTOR_GAP_PX,
      this.ringStartAngle
    );
  }

  protected rootLabelPoint(index: number): RadialPoint {
    const radius = this.ringRadius();
    const point = annularSectorLabelPoint(index, this.ringItemCount(), radius, this.ringStartAngle);
    return { x: this.rootOuterRadius() + point.x, y: this.rootOuterRadius() + point.y };
  }

  protected rootLabelWidth(): number {
    return annularSectorLabelWidth(this.ringRadius(), this.ringItemCount(), SECTOR_GAP_PX);
  }

  /** Larger text needs a wider list, but never wider than the gap to the neighbouring branch. */
  protected childListWidth(): number {
    const scaled = CHILD_LIST_WIDTH_PX * this.fontScale();
    const neighbourSpacing =
      2 * this.childListAnchorRadius() * Math.sin(Math.PI / Math.max(1, this.ringItemCount())) - CHILD_LIST_GAP_PX;
    return Math.round(Math.min(scaled, Math.max(CHILD_LIST_WIDTH_PX, neighbourSpacing)));
  }

  protected childItemHeight(): number {
    return Math.round(CHILD_ITEM_HEIGHT_PX * this.fontScale());
  }

  protected rootLabelHeight(): number {
    return Math.round(ROOT_LABEL_HEIGHT_PX * this.fontScale());
  }

  /** How much larger than usual the menu draws its text; see {@link ContextMenuService.fontScale}. */
  protected fontScale(): number {
    const scale = Number(this.contextMenuService.fontScale);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  protected childListAnchorPoint(parentIndex: number): RadialPoint {
    return pointOnRing(parentIndex, this.ringItemCount(), this.childListAnchorRadius(), this.ringStartAngle);
  }

  protected childListRotation(parentIndex: number): number {
    return outwardRotationOnRing(parentIndex, this.ringItemCount(), this.ringStartAngle);
  }

  protected itemTransform(index: number): string {
    return `translate(-50%, -50%) rotate(${outwardRotationOnRing(
      index,
      this.ringItemCount(),
      this.ringStartAngle
    )}deg)`;
  }

  protected launcherTransform(seat: RadialMenuSeat): string {
    return `translate(-50%, -50%) rotate(${seatTextRotation(seat)}deg)`;
  }

  protected seatLabel(seat: RadialMenuSeat): string {
    return this.t(`ui.contextMenu.radial.seat${seat.charAt(0).toUpperCase()}${seat.slice(1)}`);
  }

  protected actionName(action: ContextMenuAction): string {
    return this.actionPresentation(action).label;
  }

  protected actionPresentation(action: ContextMenuAction): ActionPresentation {
    const match = action.name.match(/^([☑☐◉○✔])\s*/);
    const label = match ? action.name.slice(match[0].length) : action.name;
    switch (match?.[1]) {
      case '☑':
        return { label, kind: 'checkbox', checked: true, icon: 'check_box' };
      case '☐':
        return { label, kind: 'checkbox', checked: false, icon: 'check_box_outline_blank' };
      case '◉':
        return { label, kind: 'radio', checked: true, icon: 'radio_button_checked' };
      case '○':
        return { label, kind: 'radio', checked: false, icon: 'radio_button_unchecked' };
      case '✔':
        return { label, kind: 'selected', checked: true, icon: 'check' };
      default:
        return { label, kind: 'none', checked: null, icon: null };
    }
  }

  protected hasSubActions(action: ContextMenuAction): boolean {
    return this.actionItems(action.subActions ?? []).length > 0;
  }

  protected returnTitle(): string {
    return this.t('common.button.close');
  }

  protected actionEnabled(action: ContextMenuAction): boolean {
    return action.enabled !== false;
  }

  private actionItems(actions: ContextMenuAction[]): ContextMenuAction[] {
    return actions.filter((action) => action.type !== ContextMenuType.SEPARATOR && action.name.length > 0);
  }

  private runAction(action: ContextMenuAction): void {
    if (!this.actionEnabled(action) || !action.action) return;
    const rotationDegrees = this.selectedRotationDegrees();
    this.panelService.runWithInitialRotation(rotationDegrees, () =>
      this.modalService.runWithInitialRotation(rotationDegrees, action.action!)
    );
    this.close();
  }

  private selectedRotationDegrees(): PanelRotationDegrees {
    return this.actionRotationDegrees();
  }

  private childListAnchorRadius(): number {
    return this.rootOuterRadius() + CHILD_LIST_GAP_PX;
  }

  private fullMenuPosition(): RadialPoint {
    const seat = this.selectedSeat();
    if (!seat) return this.contextMenuService.position;

    const center = this.center();
    const offset = this.launcherPoint(seat);
    return { x: center.x + offset.x, y: center.y + offset.y };
  }

  private rememberItemDirection(index: number, count: number): void {
    const itemRotation = outwardRotationOnRing(index, count, this.ringStartAngle);
    this.actionRotationDegrees.set(
      nearestCardinalRotation(itemRotation + this.currentRingRotationDegrees() + this.manualRotationDegrees())
    );
  }

  private currentRingRotationDegrees(): number {
    const ring = this.elementRef.nativeElement.querySelector<HTMLElement>('[data-radial-ring]');
    if (!ring) return 0;
    const transform = getComputedStyle(ring).transform;
    if (!transform || transform === 'none') return 0;

    const matrix2d = transform.match(/^matrix\(([^)]+)\)$/);
    const matrix3d = transform.match(/^matrix3d\(([^)]+)\)$/);
    const values = (matrix2d?.[1] ?? matrix3d?.[1])?.split(',').map(Number);
    if (!values || values.length < 2 || values.some((value) => !Number.isFinite(value))) return 0;
    return (Math.atan2(values[1]!, values[0]!) * 180) / Math.PI;
  }

  private clearParentPauseTimer(): void {
    if (!this.parentPauseTimer) return;
    clearTimeout(this.parentPauseTimer);
    this.parentPauseTimer = null;
  }

  private focusFirstControl(): void {
    this.focusableControls()[0]?.focus();
  }

  private focusableControls(): HTMLButtonElement[] {
    return Array.from(
      this.elementRef.nativeElement.querySelectorAll<HTMLButtonElement>('button[data-radial-control]:not([disabled])')
    );
  }
}
