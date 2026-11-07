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
  untracked,
  viewChild,
} from '@angular/core';
import { MODEL_VIEWER_LOADER } from '@axe/application/media/model-viewer-loader';
import { observeSize } from '@axe/core/util/observe-size';
import type { ModelStage } from '@axe/infrastructure/model-viewer/model-viewer-port';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * A 3D model on a canvas of its own, turning slowly unless the reader asks for less motion, and
 * turned by hand as it is dragged. What draws it is loaded the first time one is shown.
 */
@Component({
  selector: 'model-stage',
  templateUrl: './model-stage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: { class: 'block' },
})
export class ModelStageComponent {
  /** The URL of the model's bytes held here, or empty for none. */
  readonly url = input('');
  /** Whether nothing can draw the model here, as where the browser cannot draw on the canvas. */
  private readonly cannotDraw = signal(false);
  /** The model last shown, and whether it could be. */
  private readonly settled = signal<{ readonly url: string; readonly shown: boolean } | null>(null);
  /** Whether the model asked for is still coming, is shown, or cannot be shown. */
  protected readonly state = computed<'loading' | 'shown' | 'failed'>(() => {
    if (this.cannotDraw()) return 'failed';
    const settled = this.settled();
    if (settled?.url !== this.url()) return 'loading';
    return settled.shown ? 'shown' : 'failed';
  });
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly stage = signal<ModelStage | null>(null);
  private readonly loadViewer = inject(MODEL_VIEWER_LOADER);
  private dragFrom: { x: number; y: number } | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => void this.start(destroyRef));
    effect(() => {
      const stage = this.stage();
      const url = this.url();
      if (stage) void stage.show(url).then((shown) => this.settled.set({ url, shown }));
    });
    destroyRef.onDestroy(() => untracked(this.stage)?.dispose());
  }

  /** Loads what draws the model and stands the model on the canvas, unless the stage is gone by then. */
  private async start(destroyRef: DestroyRef): Promise<void> {
    const viewer = await this.loadViewer();
    if (destroyRef.destroyed) return;
    const canvas = this.canvas().nativeElement;
    const stage = viewer?.createModelStage(canvas) ?? null;
    if (!stage) {
      this.cannotDraw.set(true);
      return;
    }
    stage.setTurning(!(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false));
    destroyRef.onDestroy(observeSize(canvas, () => stage.resize()));
    this.stage.set(stage);
  }

  /** Stops the model turning on its own and starts turning it by hand. */
  protected press(event: PointerEvent): void {
    this.dragFrom = { x: event.clientX, y: event.clientY };
    this.stage()?.setTurning(false);
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }

  protected move(event: PointerEvent): void {
    if (!this.dragFrom) return;
    this.stage()?.turnBy(event.clientX - this.dragFrom.x, event.clientY - this.dragFrom.y);
    this.dragFrom = { x: event.clientX, y: event.clientY };
  }

  protected letGo(): void {
    this.dragFrom = null;
  }
}
