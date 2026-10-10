import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { AnimatedImageService } from '@axe/application/media/animated-image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { deserializeScene } from '@axe/features/map-editor/model/serialize';
import { livePicturesOf } from '@axe/features/tabletop/white-board/white-board-live-pictures';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { containedImageRect } from '@axe/ui/tabletop/contained-image-rect';

/**
 * A whiteboard's face seen flat, as large as the room it is given holds it: the board's colour,
 * what is drawn on it, and the moving pictures hung over that, as the board shows them on the
 * table. The pieces put on the board are not part of its face.
 *
 * It fills its host, so whoever shows it decides how large it is.
 */
@Component({
  selector: 'white-board-face',
  templateUrl: './white-board-face.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SafePipe],
  host: { class: 'relative block' },
})
export class WhiteBoardFaceComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly animatedImage = inject(AnimatedImageService);

  readonly whiteBoard = input.required<WhiteBoard>();
  /** The room kept clear round the board inside the host. */
  readonly padding = input(0);

  private readonly hostSize = signal({ width: 0, height: 0 });

  /** Reads the board's version and the arrival of pictures, then hands back the board. */
  private readonly board = computed(
    () => {
      const board = this.whiteBoard();
      this.objectChange.versionOf(board.identifier)();
      this.objectChange.fileVersion();
      return board;
    },
    { equal: () => false }
  );

  /** Where the board stands in the host, kept to its own proportions; null before the host has a size. */
  readonly box = computed(() => {
    const board = this.board();
    const { width, height } = this.hostSize();
    return containedImageRect(width, height, board.width, board.height, this.padding());
  });

  readonly color = computed(() => this.board().color);
  readonly opacity = computed(() => this.board().opacity);
  readonly imageUrl = computed(() => this.board().imageFile.url);

  private readonly scene = computed(() => deserializeScene(this.board().scene));

  /** The moving pictures, placed over the board as large as it is drawn here. */
  readonly livePictures = computed(() => {
    const box = this.box();
    if (!box) return [];
    return livePicturesOf(this.scene(), box.width, box.height, (identifier) =>
      this.animatedImage.isAnimated(identifier)
    )
      .map((picture) => ({ ...picture, url: this.imageStorage.get(picture.imageIdentifier)?.url ?? '' }))
      .filter((picture) => picture.url.length > 0);
  });

  constructor() {
    this.watchHostSize();
  }

  private watchHostSize(): void {
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      this.hostSize.set({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(this.elementRef.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
