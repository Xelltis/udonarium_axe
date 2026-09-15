import { NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CardGameService } from '@axe/application/card/card-game.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { findTrumpPairs } from '@axe/domain/card/trump-card';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { HandDrawPanelComponent } from '@axe/features/card/hand-draw/hand-draw-panel.component';
import { elementsAt } from '@axe/features/card/hand-rail/elements-at';
import { reorderHandCards, selectHandCards } from '@axe/features/card/hand-rail/hand-cards';
import { HandDragService } from '@axe/features/card/hand-rail/hand-drag.service';
import {
  fitHandFanOptions,
  HAND_CARD_HEIGHT_PX,
  HAND_CARD_WIDTH_PX,
  HAND_FAN_ARC_PX,
  HandCardLayout,
  handFanDropIndex,
  HandFanOptions,
  handFanWidthPx,
  layoutHandFan,
} from '@axe/features/card/hand-rail/hand-fan';
import { HandRailService } from '@axe/features/card/hand-rail/hand-rail.service';
import { CardFacePreviewComponent } from '@axe/ui/components/card-face-preview/card-face-preview.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-hand-rail',
  templateUrl: './hand-rail.component.html',
  imports: [DraggableDirective, NgClass, TranslocoModule, CardFacePreviewComponent],
})
export class HandRailComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly viewport = inject(ViewportService);
  private readonly mobileLayout = inject(MobileLayoutService);
  protected readonly isCompact = this.viewport.isCompact;
  protected readonly isTouch = this.viewport.isTouch;
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly tableFocus = inject(TableFocusService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly tabletopService = inject(TabletopService);
  protected readonly rail = inject(HandRailService);
  protected readonly drag = inject(HandDragService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly panelService = inject(PanelService);
  private readonly cardGame = inject(CardGameService);

  private dragPending: { card: Card; startX: number; startY: number; dragging: boolean } | null = null;
  private activePointerId: number | null = null;

  private readonly railRef = viewChild<ElementRef<HTMLElement>>('rail');
  private readonly fanRef = viewChild<ElementRef<HTMLElement>>('fan');
  private savedLeft: string | null = null;
  private savedTop: string | null = null;

  constructor() {
    effect((onCleanup) => {
      const el = this.railRef()?.nativeElement;
      if (!el) return;
      const { width: viewportWidth, height: viewportHeight } = this.viewportSize();
      const isMobile = this.mobileLayout.isActive();
      const bottom = isMobile ? viewportHeight * this.mobileLayout.tableRatio() : viewportHeight;

      const place = () => {
        if (!isMobile && this.savedLeft !== null && this.savedTop !== null) {
          el.style.left = this.savedLeft;
          el.style.top = this.savedTop;
          return;
        }
        const centered = (viewportWidth - el.offsetWidth) / 2;
        el.style.left = `${Math.max(0, Math.min(centered, viewportWidth - el.offsetWidth))}px`;
        el.style.top = `${Math.max(8, bottom - el.offsetHeight - 8)}px`;
      };

      place();
      const settle = requestAnimationFrame(place);

      onCleanup(() => {
        cancelAnimationFrame(settle);
        this.savedLeft = el.style.left;
        this.savedTop = el.style.top;
      });
    });

    const clearTouchSelection = (event: Event) => {
      if (!this.isTouch() || this.hovered() === null) return;
      const rail = this.railRef()?.nativeElement;
      if (rail && rail.contains(event.target as Node)) return;
      this.hovered.set(null);
    };
    document.addEventListener('pointerdown', clearTouchSelection, true);

    const onResize = () => this.viewportSize.set({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('pointerdown', clearTouchSelection, true);
      window.removeEventListener('resize', onResize);
    });
  }

  readonly canHoldCards = computed(() => {
    this.objectChange.trackMyCursor();
    return canRoleEdit(PeerCursor.myRole);
  });

  readonly cards = computed<Card[]>(() => {
    this.objectChange.collectionOf(Card.aliasName)();
    this.objectChange.trackMyCursor();
    const userId = this.cardGame.myUserId();
    const all = this.objectStore.getObjects<Card>(Card);
    for (const card of all) this.objectChange.versionOf(card.identifier)();
    return selectHandCards(all, userId);
  });

  protected readonly cardWidthPx = HAND_CARD_WIDTH_PX;
  protected readonly cardHeightPx = HAND_CARD_HEIGHT_PX;
  protected readonly fanHeightPx = HAND_CARD_HEIGHT_PX + HAND_FAN_ARC_PX;

  private readonly viewportSize = signal({ width: window.innerWidth, height: window.innerHeight });

  private readonly fanOptions = computed<HandFanOptions>(() => fitHandFanOptions(this.viewportSize().width));
  protected readonly fanWidthPx = computed(() => handFanWidthPx(this.fanOptions()));

  protected readonly hovered = signal<string | null>(null);
  protected readonly draggingId = signal<string | null>(null);
  private readonly insertAt = signal<number | null>(null);

  private readonly fanLayout = computed(() => layoutHandFan(this.cards().length, this.fanOptions()));

  private readonly previewIndex = computed(() => {
    const cards = this.cards();
    const dragging = this.draggingId();
    const insertAt = this.insertAt();
    const from = dragging ? cards.findIndex((card) => card.identifier === dragging) : -1;
    const order = insertAt === null || from < 0 ? cards : reorderHandCards(cards, from, insertAt);
    return new Map(order.map((card, index) => [card.identifier, index]));
  });

  private layoutOf(card: Card): HandCardLayout | undefined {
    return this.fanLayout()[this.previewIndex().get(card.identifier) ?? -1];
  }

  protected cardTransform(card: Card): string {
    const layout = this.layoutOf(card);
    if (!layout) return '';
    if (this.draggingId() === card.identifier) {
      return `translate(${layout.leftPx}px, ${layout.topPx}px) rotate(${layout.rotateDeg}deg) scale(0.94)`;
    }
    if (this.hovered() === card.identifier) {
      return `translate(${layout.leftPx}px, -10px) scale(1.35)`;
    }
    return `translate(${layout.leftPx}px, ${layout.topPx}px) rotate(${layout.rotateDeg}deg)`;
  }

  protected cardZIndex(card: Card): number {
    if (this.hovered() === card.identifier) return this.cards().length + 1;
    return this.layoutOf(card)?.zIndex ?? 0;
  }

  protected isDragging(card: Card): boolean {
    return this.draggingId() === card.identifier;
  }

  protected imageUrl(card: Card): string {
    return card.frontImage?.url ?? '';
  }

  protected displayName(card: Card): string {
    return card.name.length ? card.name : this.t('feature.card.hand.unnamed');
  }

  protected playFaceUp(card: Card, focus = true): void {
    card.playFaceUp();
    SoundEffect.play(PresetSound.cardDraw);
    this.afterPlay(card, focus);
  }

  protected playFaceDown(card: Card, focus = true): void {
    card.playFaceDown();
    SoundEffect.play(PresetSound.cardPut);
    this.afterPlay(card, focus);
  }

  private afterPlay(card: Card, focus: boolean): void {
    card.toTopmost();
    card.update();
    this.objectChange.notifyChanged(card.identifier);
    this.selectionSignalService.selectObject(card.identifier, card.aliasName);
    if (focus) this.tableFocus.focusOn(card);
  }

  protected readonly pairCount = computed(() => findTrumpPairs(this.cards()).length);

  protected openDrawPanel(): void {
    this.panelService.open(HandDrawPanelComponent, {
      title: this.t('feature.card.drawPanel.title'),
      width: 420,
      height: 380,
    });
  }

  protected discardPairs(): void {
    this.cardGame.discardPairs(this.cards());
  }

  protected close(): void {
    this.rail.close();
  }

  protected onCardPointerDown(event: PointerEvent, card: Card): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.dragPending = { card, startX: event.clientX, startY: event.clientY, dragging: false };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected onCardPointerMove(event: PointerEvent): void {
    const pending = this.dragPending;
    if (!pending || this.activePointerId !== event.pointerId) return;
    if (!pending.dragging) {
      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < 6) return;
      pending.dragging = true;
      this.hovered.set(null);
      this.draggingId.set(pending.card.identifier);
      this.drag.begin(pending.card, event.clientX, event.clientY);
    } else {
      this.drag.move(event.clientX, event.clientY);
    }
    this.insertAt.set(this.insertIndexAt(event.clientX, event.clientY));
  }

  private insertIndexAt(clientX: number, clientY: number): number | null {
    const fan = this.fanRef()?.nativeElement;
    if (!fan) return null;
    if (!elementsAt(clientX, clientY).some((element) => element.closest('.hand-rail'))) return null;
    return handFanDropIndex(clientX - fan.getBoundingClientRect().left, this.cards().length, this.fanOptions());
  }

  protected setHovered(card: Card | null): void {
    if (this.isTouch()) return;
    this.hovered.set(card?.identifier ?? null);
  }

  protected onCardPointerUp(event: PointerEvent): void {
    const pending = this.dragPending;
    if (!pending || this.activePointerId !== event.pointerId) return;
    this.dragPending = null;
    this.activePointerId = null;
    this.releaseCapture(event);
    const insertAt = this.insertAt();
    const wasDragging = pending.dragging;
    const previousSelection = this.hovered();
    this.endDragState();
    if (!wasDragging) {
      if (this.isTouch() && previousSelection !== pending.card.identifier) {
        this.hovered.set(pending.card.identifier);
      }
      return;
    }

    const targets = elementsAt(event.clientX, event.clientY);
    if (targets.some((element) => element.closest('.hand-rail'))) {
      if (insertAt !== null) this.reorderTo(pending.card, insertAt);
      return;
    }

    const surface = targets.map((element) => element.closest<HTMLElement>('[data-surface]')).find(Boolean);
    if (!surface) return;

    const local = this.coordinateService.calcTabletopLocalCoordinate(
      { x: event.clientX, y: event.clientY, z: 0 },
      surface
    );
    pending.card.location.x = local.x - (pending.card.size * this.gridSize) / 2;
    pending.card.location.y = local.y - (pending.card.size * this.gridSize) / 2;
    pending.card.posZ = local.z;
    this.playFaceUp(pending.card, false);
  }

  protected onCardPointerCancel(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    this.dragPending = null;
    this.activePointerId = null;
    this.releaseCapture(event);
    this.endDragState();
  }

  private endDragState(): void {
    this.drag.end();
    this.draggingId.set(null);
    this.insertAt.set(null);
    this.hovered.set(null);
  }

  private releaseCapture(event: PointerEvent): void {
    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
  }

  private reorderTo(card: Card, insertAt: number): void {
    const cards = this.cards();
    const from = cards.findIndex((entry) => entry.identifier === card.identifier);
    if (from < 0) return;

    const reordered = reorderHandCards(cards, from, insertAt);
    reordered.forEach((entry, index) => {
      if (entry.handOrder === index) return;
      entry.handOrder = index;
      entry.update();
      this.objectChange.notifyChanged(entry.identifier);
    });
    SoundEffect.play(PresetSound.cardPick);
  }

  private get gridSize(): number {
    return this.tabletopService.gridSize();
  }
}
