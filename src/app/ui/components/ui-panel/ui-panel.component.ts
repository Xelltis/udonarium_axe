import { NgClass, NgComponentOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  Type,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { KeyboardInsetService } from '@axe/application/ui/keyboard-inset.service';
import { PanelFrame, PanelRotationDegrees, PanelService } from '@axe/application/ui/panel.service';
import { PanelDragService, PanelDropFrame, PanelHandoff } from '@axe/application/ui/panel-drag.service';
import { PanelDropZone, pointerOf, tearOffBox } from '@axe/application/ui/panel-drag-helpers';
import { PanelTransparencyService } from '@axe/application/ui/panel-transparency.service';
import { SkinService } from '@axe/application/ui/skin.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CutIn } from '@axe/domain/media/cut-in';
import { PanelTabSlotComponent } from '@axe/ui/components/ui-panel/panel-tab-slot.component';
import { PanelTabStripComponent } from '@axe/ui/components/ui-panel/panel-tab-strip.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { ResizableDirective } from '@axe/ui/directives/resizable.directive';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';

const PANEL_FLOOR_OPACITY = 0.25;

/** Tells one frame from another while a panel is dragged between them. */
let framesOpened = 0;

/** One panel standing in a frame: what it is, where it is drawn, and what it was built into. */
export interface PanelTabHandle {
  panel: PanelService;
  slot: ComponentRef<PanelTabSlotComponent>;
  body: ComponentRef<unknown>;
  /** The size it wants back when it stands in a frame of its own again. */
  box: { width: number; height: number };
}

interface PanelTab extends PanelTabHandle {
  /** Dropped when the panel leaves, or the frame goes on answering for a panel it lost. */
  unsubscribe: () => void;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ui-panel',
  templateUrl: './ui-panel.component.html',
  host: { class: 'block' },
  providers: [PanelService],
  imports: [
    DraggableDirective,
    ResizableDirective,
    NgClass,
    NgComponentOutlet,
    TextTooltipDirective,
    PanelTabStripComponent,
  ],
})
export class UIPanelComponent implements PanelFrame, PanelDropFrame {
  panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly viewport = inject(ViewportService);
  private readonly tabletopDisplay = inject(TabletopDisplayService);
  private readonly panelTransparency = inject(PanelTransparencyService);
  private readonly panelDrag = inject(PanelDragService);
  private readonly t = inject(TRANSLATE_FN);

  readonly isCompact = this.viewport.isCompact;
  readonly keyboardInset = inject(KeyboardInsetService).inset;

  get menuTitle(): string {
    return this.t('ui.panel.menuTitle');
  }

  get transparencyLabel(): string {
    return this.t('ui.panel.transparency');
  }

  readonly transparency = computed(() => this.panelTransparency.valueOf(this.panelService.panelKind()));

  /** The shelf this panel was opened on, where whatever opened it asked for one. */
  protected layer(): number {
    return this.panelService.layer;
  }

  readonly restingOpacity = computed(() => 1 - (this.transparency() / 100) * (1 - PANEL_FLOOR_OPACITY));

  private readonly hasFocus = signal(false);
  private readonly barHasFocus = signal(false);

  readonly panelOpacity = computed(() => (this.hasFocus() && !this.barHasFocus() ? 1 : this.restingOpacity()));

  setTransparency(value: number): void {
    this.panelTransparency.set(this.panelService.panelKind(), value);
  }

  protected onTransparencyInput(event: Event): void {
    this.setTransparency(Number((event.target as HTMLInputElement).value));
  }

  protected onFocusIn(): void {
    this.hasFocus.set(true);
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.draggablePanel().nativeElement.contains(next)) return;
    this.hasFocus.set(false);
  }

  protected onBarFocus(focused: boolean): void {
    this.barHasFocus.set(focused);
  }

  readonly draggablePanel = viewChild.required<ElementRef<HTMLElement>>('draggablePanel');
  readonly titleBar = viewChild.required<ElementRef<HTMLDivElement>>('titleBar');
  private readonly slots = viewChild.required('slots', { read: ViewContainerRef });

  readonly tabs = signal<readonly PanelTab[]>([]);
  readonly activeIndex = signal(0);

  /**
   * The panel this frame is wearing: its name, its buttons, the kind it is faded by.
   *
   * A frame nothing was ever built into answers with its own, which is what a frame put up
   * by hand is.
   */
  readonly activePanel = computed<PanelService>(() => this.tabs()[this.activeIndex()]?.panel ?? this.panelService);

  readonly dragKey = `panel-${(framesOpened += 1)}`;
  /** Whether a panel let go of now would join this frame. */
  protected readonly isDropTarget = computed(() => this.panelDrag.target()?.dragKey === this.dragKey);

  measureDropZone(): PanelDropZone | null {
    if (this.isCompact() || !this.activePanel().isTabbable || !this.showsTitleBar) return null;
    const strip = this.draggablePanel().nativeElement.querySelector('[role="tablist"]');
    return {
      bar: this.titleBar().nativeElement.getBoundingClientRect(),
      strip: strip ? strip.getBoundingClientRect() : null,
      z: Number(this.draggablePanel().nativeElement.style.zIndex) || 0,
    };
  }

  handOverAll(): PanelHandoff[] {
    return this.tabs()
      .map((tab) => this.releaseTab(tab.panel))
      .filter((handle): handle is PanelTabHandle => handle !== null);
  }

  handOver(panel: PanelService): PanelHandoff | null {
    return this.releaseTab(panel);
  }

  takeIn(handoff: PanelHandoff): void {
    this.adoptTab(handoff as PanelTabHandle);
  }

  panelCount(): number {
    return this.tabCount();
  }

  dismissFrame(): void {
    this.self?.destroy();
  }

  /** A panel is folded into another by its bar; taking hold of its middle only moves it. */
  protected onFrameDragStart(event: MouseEvent | TouchEvent): void {
    const from = event.target;
    if (!(from instanceof Node) || !this.titleBar().nativeElement.contains(from)) return;
    if (this.isCompact() || !this.activePanel().isTabbable) return;
    this.panelDrag.begin(this);
  }

  protected onFrameDragMove(event: MouseEvent | TouchEvent): void {
    const at = pointerOf(event);
    if (at) this.panelDrag.move(at.x, at.y);
  }

  protected onFrameDragEnd(): void {
    const target = this.panelDrag.end();
    if (!target || target === (this as PanelDropFrame)) return;
    for (const handoff of this.handOverAll()) target.takeIn(handoff);
    this.dismissFrame();
  }

  /** Whether the frame is showing a row of names, which it does only when it holds several. */
  readonly showsTabs = computed(() => this.tabs().length > 1 && !this.isCompact());
  readonly tabLabels = computed(() => this.tabs().map((tab) => tab.panel.title));

  closeTabAt(index: number): void {
    this.tabs()[index]?.panel.close();
  }

  /** A name taken hold of: from here it may land on another frame, or on nothing at all. */
  protected onTabGrabbed(): void {
    this.panelDrag.begin(this);
  }

  protected onTabDragged(at: { x: number; y: number }): void {
    this.panelDrag.move(at.x, at.y);
  }

  protected onTabMoved(move: { from: number; to: number }): void {
    const held = this.tabs()[move.from];
    if (!held) return;
    const rest = this.tabs().filter((tab) => tab !== held);
    this.tabs.set([...rest.slice(0, move.to), held, ...rest.slice(move.to)]);
    this.selectTab(this.tabs().indexOf(held));
  }

  /**
   * A panel pulled out of the row: into whatever frame it was dropped on, or into one of its own.
   *
   * It stands at the size it had when it was folded in rather than at the size of the group,
   * or a panel pulled out of a large frame would come away enormous.
   */
  protected onTabTakenOut(taken: { index: number; x: number; y: number }): void {
    const target = this.panelDrag.end();
    const tab = this.tabs()[taken.index];
    if (!tab) return;
    const handle = this.releaseTab(tab.panel);
    if (!handle) return;

    if (target && target !== (this as PanelDropFrame)) {
      target.takeIn(handle);
    } else {
      const at = tearOffBox(taken, handle.box, { width: window.innerWidth, height: window.innerHeight });
      this.panelService
        .openFrame({ left: at.left, top: at.top, width: handle.box.width, height: handle.box.height })
        .takeIn(handle);
    }
    if (this.tabCount() === 0) this.dismissFrame();
  }

  /** Builds a panel into a place of its own in this frame. */
  openTab<T>(childComponent: Type<T>, panel: PanelService): ComponentRef<T> {
    const slot = this.slots().createComponent(PanelTabSlotComponent);
    const body = slot.instance.content().createComponent(childComponent);
    panel.setDefaultScrollablePanel(slot.instance.scrollable().nativeElement);
    this.holdTab({ panel, slot, body, box: { width: this.width, height: this.height } });
    return body;
  }

  /** Takes a panel in from another frame, the ground it stands on and all. */
  adoptTab(handle: PanelTabHandle): void {
    this.slots().insert(handle.slot.hostView);
    handle.panel.attachTo(this);
    this.holdTab(handle);
  }

  /** Hands a panel out without taking it down. The frame stays, emptied, for the caller to end. */
  releaseTab(panel: PanelService): PanelTabHandle | null {
    const tab = this.tabOf(panel);
    if (!tab) return null;
    this.dropTab(tab);
    return { panel: tab.panel, slot: tab.slot, body: tab.body, box: tab.box };
  }

  /** Puts one panel away. The frame goes with the last of them. */
  closeTab(panel: PanelService): void {
    const tab = this.tabOf(panel);
    if (!tab) {
      this.self?.destroy();
      return;
    }
    this.dropTab(tab);
    tab.body.destroy();
    tab.slot.destroy();
    if (this.tabs().length === 0) this.self?.destroy();
  }

  tabCount(): number {
    return this.tabs().length;
  }

  selectTab(index: number): void {
    const tabs = this.tabs();
    if (index < 0 || index >= tabs.length) return;
    this.activeIndex.set(index);
    for (const [at, tab] of tabs.entries()) tab.panel.isActiveTab.set(at === index);
    const shown = tabs[index];
    afterNextRender({ read: () => shown.panel.activated$.emit() }, { injector: this.injector });
  }

  private tabOf(panel: PanelService): PanelTab | null {
    return this.tabs().find((tab) => tab.panel === panel) ?? null;
  }

  private holdTab(handle: PanelTabHandle): void {
    const tab: PanelTab = { ...handle, unsubscribe: this.listenTo(handle.panel) };
    this.tabs.update((held) => [...held, tab]);
    this.selectTab(this.tabs().length - 1);
  }

  /**
   * Follows what a panel asks of the frame it stands in.
   *
   * The frame's own panel is already followed from where the frame was built, so only the
   * ones folded in from elsewhere are taken up here. What a panel asks for while it is behind
   * another is not the frame's business: it would shrink or stretch around something nobody
   * is looking at.
   */
  private listenTo(panel: PanelService): () => void {
    if (panel === this.panelService) return () => undefined;
    const stopMinimize = panel.minimizeRequest$.subscribe((minimized) => {
      if (panel !== this.activePanel() || minimized === this.isMinimized()) return;
      this.toggleMinimize();
    });
    const stopResize = panel.resizeRequest$.subscribe((size) => {
      if (panel === this.activePanel()) this.resizeTo(size);
    });
    return () => {
      stopMinimize();
      stopResize();
    };
  }

  private dropTab(tab: PanelTab): void {
    tab.unsubscribe();
    this.tabs.update((held) => held.filter((entry) => entry !== tab));
    this.activeIndex.set(Math.min(this.activeIndex(), Math.max(0, this.tabs().length - 1)));
    this.selectTab(this.activeIndex());
  }

  private scrollablePanel(): ElementRef<HTMLDivElement> | null {
    return this.tabs()[this.activeIndex()]?.slot.instance.scrollable() ?? null;
  }

  readonly titleInput = input('', { alias: 'title' });
  readonly leftInput = input(0, { alias: 'left' });
  readonly topInput = input(0, { alias: 'top' });
  readonly widthInput = input(100, { alias: 'width' });
  readonly heightInput = input(100, { alias: 'height' });
  readonly minWidthInput = input(100, { alias: 'minWidth' });
  readonly minHeightInput = input(100, { alias: 'minHeight' });
  readonly showTitle = input(true);
  readonly overflowVisible = input(false);

  constructor() {
    effect(() => {
      this.panelService.title = this.titleInput();
      this.panelService.left = this.leftInput();
      this.panelService.top = this.topInput();
      this.panelService.width = this.widthInput();
      this.panelService.height = this.heightInput();
      this.panelService.minWidth = this.minWidthInput();
      this.panelService.minHeight = this.minHeightInput();
    });
    this.panelService.minimizeRequest$.subscribe((minimized) => {
      if (this.activePanel() !== this.panelService || minimized === this.isMinimized()) return;
      this.toggleMinimize();
    }, this.destroyRef);
    this.panelService.resizeRequest$.subscribe((size) => {
      if (this.activePanel() === this.panelService) this.resizeTo(size);
    }, this.destroyRef);
    effect(() => {
      const active = this.activeIndex();
      for (const [at, tab] of this.tabs().entries()) {
        tab.slot.setInput('padding', this.padding_);
        tab.slot.setInput('top', this.bodyTop());
        tab.slot.setInput('overflowVisible', this.overflowVisible());
        tab.slot.setInput('contentMinimized', this.contentMinimized);
        tab.slot.setInput('active', at === active);
      }
    });
    afterNextRender({
      write: () => {
        const ground = this.scrollablePanel();
        if (ground) this.panelService.setDefaultScrollablePanel(ground.nativeElement);
        this.clampPanelToViewport(this.draggablePanel().nativeElement);
        if (this.panelService.cutInIdentifier) {
          this.timerCheckWindowSize = setInterval(() => {
            this.chkeWindowMinSize();
          }, 500);
        }
      },
    });
    this.destroyRef.onDestroy(this.panelDrag.register(this));
    this.destroyRef.onDestroy(() => {
      if (this.timerCheckWindowSize) {
        clearInterval(this.timerCheckWindowSize);
        this.timerCheckWindowSize = null;
      }
    });
  }

  get title(): string {
    return this.panelService.title;
  }
  set title(title: string) {
    this.panelService.title = title;
  }
  get left() {
    return this.panelService.left;
  }
  set left(left: number) {
    this.panelService.left = left;
  }
  get top() {
    return this.panelService.top;
  }
  set top(top: number) {
    this.panelService.top = top;
  }
  /** Bumped when the size is written from outside a template binding, so the panel redraws. */
  private readonly sizeVersion = signal(0);

  get width() {
    this.sizeVersion();
    return this.panelService.width;
  }
  set width(width: number) {
    this.panelService.width = width;
  }
  get height() {
    this.sizeVersion();
    return this.panelService.height;
  }
  set height(height: number) {
    this.panelService.height = height;
  }
  get minWidth() {
    return this.panelService.minWidth;
  }
  set minWidth(minWidth: number) {
    this.panelService.minWidth = minWidth;
  }
  get minHeight() {
    return this.panelService.minHeight;
  }
  set minHeight(minHeight: number) {
    this.panelService.minHeight = minHeight;
  }

  private preLeft: number = 0;
  private preTop: number = 0;
  private preWidth: number = 100;
  private preHeight: number = 100;

  readonly isFullScreen = signal(false);
  readonly isMinimized = signal(false);
  /** The turn button is part of the flat-screen work, so it waits to be asked for. */
  readonly showsRotation = computed(() => this.tabletopDisplay.settings().panelRotationEnabled);

  readonly rotationDegrees = signal<PanelRotationDegrees>(0);

  setInitialRotation(degrees: PanelRotationDegrees): void {
    this.rotationDegrees.set(degrees);
  }

  get rotate90Title(): string {
    return this.t('ui.panel.rotate90');
  }

  get isSideways(): boolean {
    return this.rotationDegrees() === 90 || this.rotationDegrees() === 270;
  }

  get contentMinimized(): boolean {
    return this.panelService.minimizeToContent && this.isMinimized();
  }

  get frameless(): boolean {
    return this.panelService.frameless;
  }

  /** The pictures the skin papers a panel with, underneath first. */
  protected readonly skinLayers = inject(SkinService).panelLayers;

  /** Wearing no box of its own: shrunk to its content, asked to play without a frame, or gone ghost. */
  get unboxed(): boolean {
    return this.contentMinimized || this.frameless || this.panelService.isGhost();
  }

  /** A ghost keeps its buttons: they are the only thing left to take hold of it by. */
  get isGhost(): boolean {
    return this.panelService.isGhost();
  }

  get showsTitleBar(): boolean {
    return this.showTitle() && !this.frameless;
  }

  protected readonly portraitDispByMouse = signal(true);
  private timerCheckWindowSize: ReturnType<typeof setInterval> | null = null;

  protected get chatPortraitComponent() {
    return PanelService.chatPortraitComponentClass;
  }
  protected get cardStackListComponent() {
    return PanelService.cardStackListComponentClass;
  }

  get isPointerDragging(): boolean {
    return this.pointerDeviceService.isDragging;
  }

  private self: { destroy: () => void } | null = null;

  claimSelf(self: { destroy: () => void }): void {
    this.self = self;
  }

  showPortrait(flag: boolean) {
    this.portraitDispByMouse.set(flag);
  }

  chkeWindowMinSize() {
    const id = this.panelService.cutInIdentifier;
    if (!id) return;
    const cutIn = this.objectStore.get<CutIn>(id);
    if (!cutIn) return;
    if (!cutIn.videoId) return;

    const panel = this.draggablePanel().nativeElement;

    const nowW = parseInt(panel.style.width);
    const nowH = parseInt(panel.style.height);
    if (nowW < cutIn.minSizeWidth(true)) {
      panel.style.width = cutIn.minSizeWidth(true) + 'px';
    }
    if (nowH < cutIn.minSizeHeight(true)) {
      panel.style.height = cutIn.minSizeHeight(true) + 'px';
    }
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const offsetL: number = panel.offsetLeft;
    const offsetT: number = panel.offsetTop;

    const overR = offsetL + cutIn.minSizeWidth(true) - winW;
    if (overR >= 0) {
      const newOffL = offsetL - overR <= 0 ? 0 : offsetL - overR;
      panel.style.left = newOffL + 'px';
    }

    const overB = offsetT + cutIn.minSizeHeight(true) - winH;
    if (overB >= 0) {
      const newOffT = offsetT - overB <= 0 ? 0 : offsetT - overB;
      panel.style.top = newOffT + 'px';
    }
  }

  /**
   * Grows the panel to a size its content asked for, or gives back the one it had.
   *
   * The size it had is put aside on the way out and given back on the way in, so a panel that
   * grew to show everything returns to whatever the reader had set it to.
   */
  private resizeTo(size: { width: number; height: number } | null): void {
    if (this.isFullScreen() || this.isCompact()) return;

    if (size) {
      if (!this.sizeBeforeFit) this.sizeBeforeFit = { width: this.width, height: this.height };
      this.width = Math.max(this.minWidth, Math.min(size.width, window.innerWidth));
      this.height = Math.max(this.minHeight, Math.min(size.height, window.innerHeight));
    } else {
      if (!this.sizeBeforeFit) return;
      this.width = this.sizeBeforeFit.width;
      this.height = this.sizeBeforeFit.height;
      this.sizeBeforeFit = null;
    }
    this.sizeVersion.update((version) => version + 1);
  }

  private sizeBeforeFit: { width: number; height: number } | null = null;

  toggleMinimize() {
    if (this.isFullScreen()) return;
    const id = this.panelService.cutInIdentifier;
    if (id) {
      const cutIn = this.objectStore.get<CutIn>(id);
      if (cutIn?.videoId) {
        return;
      }
    }

    const body = this.scrollablePanel()?.nativeElement ?? null;
    const panel = this.draggablePanel().nativeElement;
    if (this.isMinimized()) {
      this.isMinimized.set(false);
      this.markMinimized(false);
      if (body) body.style.display = '';
      if (this.panelService.minimizeToContent) this.width = this.preWidth;
      this.height = this.preHeight;
    } else {
      this.preHeight = panel.offsetHeight;
      this.isMinimized.set(true);
      this.markMinimized(true);
      if (this.panelService.minimizeToContent) {
        this.preWidth = panel.offsetWidth;
        if (body) body.style.display = '';
        this.width = 128;
      } else {
        if (body) body.style.display = 'none';
        this.height = this.titleBar().nativeElement.offsetHeight;
      }
    }
  }

  /** Every panel the frame holds is shrunk with it, since what shrinks is the frame. */
  private markMinimized(minimized: boolean): void {
    this.panelService.isMinimized.set(minimized);
    for (const tab of this.tabs()) tab.panel.isMinimized.set(minimized);
  }

  toggleFullScreen() {
    if (this.isMinimized()) return;

    const panel = this.draggablePanel().nativeElement;
    if (this.isFullScreen()) {
      this.isFullScreen.set(false);
    } else {
      this.isFullScreen.set(true);
    }

    if (this.isFullScreen()) {
      this.preLeft = panel.offsetLeft;
      this.preTop = panel.offsetTop;
      this.preWidth = panel.offsetWidth;
      this.preHeight = panel.offsetHeight;

      this.applyFullScreenLayout(panel);
    } else {
      this.applyPanelBox(panel, this.preLeft, this.preTop, this.preWidth, this.preHeight);
      this.clampPanelToViewport(panel);
    }
  }

  rotatePanelClockwise(): void {
    if (this.isCompact()) return;

    const next = ((this.rotationDegrees() + 90) % 360) as PanelRotationDegrees;
    const panel = this.draggablePanel().nativeElement;
    this.rotationDegrees.set(next);

    // Written straight onto the element so the measurement below reads the new orientation,
    // rather than the one Angular has yet to paint.
    panel.style.rotate = `${next}deg`;
    if (this.isFullScreen()) {
      this.applyFullScreenLayout(panel);
    } else {
      this.clampPanelToViewport(panel);
    }
  }

  onPanelResizeEnd(): void {
    const panel = this.draggablePanel().nativeElement;
    this.left = panel.offsetLeft;
    this.top = panel.offsetTop;
    this.width = panel.offsetWidth;
    this.height = panel.offsetHeight;
    this.clampPanelToViewport(panel);
  }

  private applyFullScreenLayout(panel: HTMLElement): void {
    const width = this.isSideways ? window.innerHeight : window.innerWidth;
    const height = this.isSideways ? window.innerWidth : window.innerHeight;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    this.applyPanelBox(panel, left, top, width, height);
  }

  private applyPanelBox(panel: HTMLElement, left: number, top: number, width: number, height: number): void {
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
  }

  private clampPanelToViewport(panel: HTMLElement): void {
    const rect = panel.getBoundingClientRect();
    let diffX = 0;
    let diffY = 0;

    if (window.innerWidth < rect.width) diffX = window.innerWidth / 2 - (rect.left + rect.width / 2);
    else if (rect.left < 0) diffX = -rect.left;
    else if (window.innerWidth < rect.right) diffX = window.innerWidth - rect.right;

    if (window.innerHeight < rect.height) diffY = window.innerHeight / 2 - (rect.top + rect.height / 2);
    else if (rect.top < 0) diffY = -rect.top;
    else if (window.innerHeight < rect.bottom) diffY = window.innerHeight - rect.bottom;

    if (diffX === 0 && diffY === 0) return;
    this.left = panel.offsetLeft + diffX;
    this.top = panel.offsetTop + diffY;
    panel.style.left = `${this.left}px`;
    panel.style.top = `${this.top}px`;
  }

  /** Where the title bar leaves off, which is where a row of names goes. */
  protected barBottom(): string {
    if (!this.showsTitleBar) return '0';
    return this.isCompact() ? 'calc(2.75rem + env(safe-area-inset-top))' : '28px';
  }

  /** How far down the body starts: under the bar, and under the names when there are any. */
  private bodyTop(): string {
    if (!this.showsTabs()) return this.barBottom();
    return this.showsTitleBar ? '56px' : '28px';
  }

  get padding_(): string {
    if (this.panelService.isCutIn) return '0px';
    else return '8px';
  }

  get isCutIn(): boolean {
    return this.panelService.isCutIn;
  }

  close() {
    if (this.timerCheckWindowSize) {
      clearInterval(this.timerCheckWindowSize);
      this.timerCheckWindowSize = null;
    }
    if (this.tabs().length > 0) this.self?.destroy();
    else this.panelService.close();
  }

  backGroundSetting(isWhiteLog: boolean): string {
    if (isWhiteLog) return 'background: linear-gradient(-30deg, rgba(255,255,255, 1.0), rgba(255, 255, 255, 1.0)); ';
    else return 'background: linear-gradient(-30deg, rgba(240,218,189, 0.9), rgba(255, 244, 232, 0.9));';
  }
}
