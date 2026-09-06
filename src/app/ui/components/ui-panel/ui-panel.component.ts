import { NgClass, NgComponentOutlet, NgStyle } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { KeyboardInsetService } from '@axe/application/ui/keyboard-inset.service';
import { PanelRotationDegrees, PanelService } from '@axe/application/ui/panel.service';
import { PanelTransparencyService } from '@axe/application/ui/panel-transparency.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CutIn } from '@axe/domain/media/cut-in';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { ResizableDirective } from '@axe/ui/directives/resizable.directive';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';

const PANEL_FLOOR_OPACITY = 0.25;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ui-panel',
  templateUrl: './ui-panel.component.html',
  host: { class: 'block' },
  providers: [PanelService],
  imports: [DraggableDirective, ResizableDirective, NgClass, NgComponentOutlet, NgStyle, TextTooltipDirective],
})
export class UIPanelComponent {
  panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly viewport = inject(ViewportService);
  private readonly panelTransparency = inject(PanelTransparencyService);
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
  readonly scrollablePanel = viewChild.required<ElementRef<HTMLDivElement>>('scrollablePanel');
  readonly titleBar = viewChild.required<ElementRef<HTMLDivElement>>('titleBar');
  readonly content = viewChild.required('content', { read: ViewContainerRef });

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
      if (minimized === this.isMinimized()) return;
      this.toggleMinimize();
    }, this.destroyRef);
    this.panelService.resizeRequest$.subscribe((size) => this.resizeTo(size), this.destroyRef);
    afterNextRender({
      write: () => {
        this.panelService.setDefaultScrollablePanel(this.scrollablePanel().nativeElement);
        this.clampPanelToViewport(this.draggablePanel().nativeElement);
        if (this.panelService.cutInIdentifier) {
          this.timerCheckWindowSize = setInterval(() => {
            this.chkeWindowMinSize();
          }, 500);
        }
      },
    });
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

    const body = this.scrollablePanel().nativeElement;
    const panel = this.draggablePanel().nativeElement;
    if (this.isMinimized()) {
      this.isMinimized.set(false);
      this.panelService.isMinimized.set(false);
      body.style.display = '';
      if (this.panelService.minimizeToContent) this.width = this.preWidth;
      this.height = this.preHeight;
    } else {
      this.preHeight = panel.offsetHeight;
      this.isMinimized.set(true);
      this.panelService.isMinimized.set(true);
      if (this.panelService.minimizeToContent) {
        this.preWidth = panel.offsetWidth;
        body.style.display = '';
        this.width = 128;
      } else {
        body.style.display = 'none';
        this.height = this.titleBar().nativeElement.offsetHeight;
      }
    }
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

    // Angular の次回描画を待たず、直後の getBoundingClientRect() に新しい向きを反映する。
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
    if (this.panelService) this.panelService.close();
  }

  backGroundSetting(isWhiteLog: boolean): string {
    if (isWhiteLog) return 'background: linear-gradient(-30deg, rgba(255,255,255, 1.0), rgba(255, 255, 255, 1.0)); ';
    else return 'background: linear-gradient(-30deg, rgba(240,218,189, 0.9), rgba(255, 244, 232, 0.9));';
  }
}
