import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { observeSize } from '@axe/core/util/observe-size';
import { Card } from '@axe/domain/card/card';
import { CardFaceTextComponent } from '@axe/ui/components/card-face-text/card-face-text.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { containedImageRect } from '@axe/ui/tabletop/contained-image-rect';

@Component({
  selector: 'card-face-preview',
  templateUrl: './card-face-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardFaceTextComponent, SafePipe],
})
export class CardFacePreviewComponent {
  readonly card = input.required<Card>();
  readonly imageUrl = input('');
  /** A frame of nought fills whatever room the caller has given the preview. */
  readonly frameWidth = input(0);
  readonly frameHeight = input(0);
  readonly padding = input(0);
  readonly framed = input(true);

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tabletop = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly hostSize = signal({ width: 0, height: 0 });
  private readonly naturalSize = linkedSignal<string, { width: number; height: number }>({
    source: () => this.imageUrl(),
    computation: () => ({ width: 0, height: 0 }),
  });

  readonly width = computed(() => this.frameWidth() || this.hostSize().width);
  readonly height = computed(() => this.frameHeight() || this.hostSize().height);
  readonly widthCss = computed(() => (this.frameWidth() ? `${this.frameWidth()}px` : '100%'));
  readonly heightCss = computed(() => (this.frameHeight() ? `${this.frameHeight()}px` : '100%'));

  readonly imageRect = computed(() => {
    const { width, height } = this.naturalSize();
    return containedImageRect(this.width(), this.height(), width, height, this.padding());
  });

  readonly textScale = computed(() => {
    const width = this.imageRect()?.width ?? 0;
    const card = this.card();
    this.objectChange.versionOf(card.identifier)();
    const cardSize = card.size;
    const gridSize = this.tabletop.gridSize();
    return width && cardSize && gridSize ? width / (cardSize * gridSize) : 1;
  });

  constructor() {
    this.watchHostSize();
  }

  protected onImageLoad(image: HTMLImageElement): void {
    this.naturalSize.set({ width: image.naturalWidth, height: image.naturalHeight });
  }

  private watchHostSize(): void {
    this.destroyRef.onDestroy(observeSize(this.elementRef.nativeElement, (size) => this.hostSize.set(size)));
  }
}
