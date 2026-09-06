import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { ChatTickerSelectionService } from '@axe/application/chat/chat-ticker-selection.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { TICKER_CHAT_TAB_IDENTIFIER } from '@axe/domain/chat/constants';
import {
  DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
  MAX_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
  MIN_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
} from '@axe/domain/tabletop/multi-angle';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import {
  formatChatTickerMessage,
  makeChatTickerPath,
  makeChatTickerRepeatOffsets,
  pointAtChatTickerDistance,
} from '@axe/features/chat/chat-ticker/chat-ticker-layout';

const TICKER_FONT_SIZE_PX = 18;
const TICKER_OUTLINE_WIDTH_PX = 4;
const TICKER_LETTER_GAP_PX = 1;
const TICKER_COPY_MINIMUM_GAP_PX = 48;
const MAX_DEVICE_PIXEL_RATIO = 2;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-ticker',
  templateUrl: './chat-ticker.component.html',
})
export class ChatTickerComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatTickerSelection = inject(ChatTickerSelectionService);
  private readonly tabletopService = inject(TabletopService);
  private readonly objectStore = inject(ObjectStore);
  private readonly chatTabList = inject(ChatTabList);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  private readonly currentText = signal('');
  private readonly seenMessageIdentifiers = new Set<string>();
  private cycleStartedAt: number | null = null;
  private animationFrame: number | null = null;

  readonly isVisible = computed(() => {
    const display = this.tabletopService.tabletopDisplaySettings;
    return display.enabled() && display.multiAngleTickerEnabled() && this.currentText().length > 0;
  });

  constructor() {
    const tickerTab = this.chatTabList.ensureTickerTab();
    this.seedFromHistory(tickerTab);

    this.objectChange.messageAdded$.subscribe((event) => {
      if (event.tabIdentifier !== TICKER_CHAT_TAB_IDENTIFIER) return;
      const message = this.objectStore.get<ChatMessage>(event.messageIdentifier);
      if (message) this.enqueueMessage(message);
    }, this.destroyRef);

    this.chatTickerSelection.selection$.subscribe((event) => {
      const message = this.objectStore.get<ChatMessage>(event.messageIdentifier);
      if (message instanceof ChatMessage) this.replaceMessage(message);
    }, this.destroyRef);

    this.objectChange.objectDeleted$.subscribe((event) => {
      if (event.identifier !== TICKER_CHAT_TAB_IDENTIFIER) return;
      queueMicrotask(() => this.chatTabList.ensureTickerTab());
    }, this.destroyRef);

    effect(() => {
      const visible = this.isVisible();
      afterNextRender(() => (visible ? this.startAnimation() : this.stopAnimation()), { injector: this.injector });
    });

    this.destroyRef.onDestroy(() => this.stopAnimation());
  }

  private seedFromHistory(tab: ChatTab): void {
    let latest: string | null = null;
    for (const message of tab.chatMessages) {
      this.seenMessageIdentifiers.add(message.identifier);
      const text = formatChatTickerMessage(message);
      if (text) latest = text;
    }
    if (latest) {
      this.currentText.set(latest);
    }
  }

  private enqueueMessage(message: ChatMessage): void {
    if (this.seenMessageIdentifiers.has(message.identifier)) return;
    this.seenMessageIdentifiers.add(message.identifier);
    this.replaceMessage(message);
  }

  private replaceMessage(message: ChatMessage): void {
    const text = formatChatTickerMessage(message);
    if (!text) return;

    // A full perimeter takes one to two minutes at the default speed on a desktop screen.
    // Waiting for that lap made replacements look lost, so a selected or newly posted
    // public message becomes the ticker text on the next animation frame.
    this.currentText.set(text);
    this.cycleStartedAt = null;
    if (this.isVisible()) this.startAnimation();
  }

  private startAnimation(): void {
    if (this.animationFrame != null || !this.isVisible()) return;
    this.animationFrame = requestAnimationFrame((timestamp) => this.draw(timestamp));
  }

  private stopAnimation(): void {
    if (this.animationFrame != null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.cycleStartedAt = null;
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);
  }

  private draw(timestamp: number): void {
    this.animationFrame = null;
    if (!this.isVisible()) return;

    const canvas = this.canvas()?.nativeElement;
    if (!canvas) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const ratio = Math.min(MAX_DEVICE_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const context = canvas.getContext('2d');
    const fontSize = this.fontSizePx();
    const path = makeChatTickerPath(width, height, fontSize);
    if (!context || !path) {
      this.startAnimation();
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const speed = this.pixelsPerSecond();
    if (this.cycleStartedAt == null) this.cycleStartedAt = timestamp;
    if ((timestamp - this.cycleStartedAt) * (speed / 1000) >= path.perimeter) {
      this.cycleStartedAt = timestamp;
    }

    const travelled = (timestamp - this.cycleStartedAt) * (speed / 1000);
    this.drawText(context, path, this.currentText(), travelled, fontSize);
    this.startAnimation();
  }

  /** The table setting scales the text, and the path margin follows it. */
  private fontSizePx(): number {
    return (
      TICKER_FONT_SIZE_PX *
      multiAngleFontScaleFactor(this.tabletopService.tabletopDisplaySettings.multiAngleFontScale())
    );
  }

  private pixelsPerSecond(): number {
    const value = Number(this.tabletopService.tabletopDisplaySettings.multiAngleTickerPixelsPerSecond());
    return Number.isFinite(value)
      ? Math.min(MAX_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND, Math.max(MIN_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND, value))
      : DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND;
  }

  private drawText(
    context: CanvasRenderingContext2D,
    path: NonNullable<ReturnType<typeof makeChatTickerPath>>,
    text: string,
    travelled: number,
    fontSize: number
  ): void {
    context.font = `700 ${fontSize}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.lineWidth = (TICKER_OUTLINE_WIDTH_PX * fontSize) / TICKER_FONT_SIZE_PX;
    context.strokeStyle = 'rgba(0, 0, 0, 0.92)';
    context.fillStyle = '#fff';

    const glyphs = fitGlyphsToPerimeter(context, text, path.perimeter * 0.9);
    if (glyphs.length < 1) return;
    const textWidth = glyphs.reduce((sum, glyph) => sum + glyph.advance, 0);
    const repeatOffsets = makeChatTickerRepeatOffsets(path.perimeter, textWidth, TICKER_COPY_MINIMUM_GAP_PX);
    const bottomLength = path.segments[0].length;
    const startDistance = bottomLength - glyphs[0].advance;
    for (const repeatOffset of repeatOffsets) {
      let cursor = 0;
      for (const glyph of glyphs) {
        const point = pointAtChatTickerDistance(
          path,
          startDistance + repeatOffset + cursor + glyph.advance / 2 - travelled
        );
        context.save();
        context.translate(point.x, point.y);
        context.rotate((point.degrees * Math.PI) / 180);
        context.strokeText(glyph.text, 0, 0);
        context.fillText(glyph.text, 0, 0);
        context.restore();
        cursor += glyph.advance;
      }
    }
  }
}

interface TickerGlyph {
  readonly text: string;
  readonly advance: number;
}

function fitGlyphsToPerimeter(context: CanvasRenderingContext2D, text: string, maximumWidth: number): TickerGlyph[] {
  const all = Array.from(text).map((character) => ({
    text: character,
    advance: Math.max(1, context.measureText(character).width + TICKER_LETTER_GAP_PX),
  }));
  const total = all.reduce((sum, glyph) => sum + glyph.advance, 0);
  if (total <= maximumWidth) return all;

  const ellipsis: TickerGlyph = {
    text: '…',
    advance: Math.max(1, context.measureText('…').width + TICKER_LETTER_GAP_PX),
  };
  const fitted: TickerGlyph[] = [];
  let used = ellipsis.advance;
  for (const glyph of all) {
    if (maximumWidth < used + glyph.advance) break;
    fitted.push(glyph);
    used += glyph.advance;
  }
  fitted.push(ellipsis);
  return fitted;
}
