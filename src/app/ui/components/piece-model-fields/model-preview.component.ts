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
import { EFFECT_STAGE_LOADER } from '@axe/application/effect/effect-stage-loader';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { observeSize } from '@axe/core/util/observe-size';
import type { ModelAct } from '@axe/domain/tabletop/model-motions';
import { pieceModelOf } from '@axe/domain/tabletop/piece-model';
import type { FigureStage, StageFigure } from '@axe/infrastructure/table-3d/table-3d-port';
import type { ModelledPiece } from '@axe/ui/components/piece-model-fields/modelled-piece';
import { TranslocoModule } from '@jsverse/transloco';

/** How far the figure is turned from facing the reader when it is first shown, in degrees. */
const FIRST_TURN_DEG = -25;
/** How far a pixel of a drag turns the figure, in degrees. */
const DRAG_TURN_DEG = 0.8;
/** How much room is kept round the figure, in pixels. */
const ROOM_PX = 10;

/**
 * The model of a piece or a block as it is set up, on a small canvas of its own: drawn and moved as
 * the table draws and moves it, so what is changed of its look, its motions and its shapes shows at
 * once, turned by hand as it is dragged, and walking or acting what it is asked to try. A cut-in that
 * shows a model shows it by the same canvas, bare. What draws it is loaded the first time one is
 * shown.
 */
@Component({
  selector: 'model-preview',
  templateUrl: './model-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: { class: 'block' },
})
export class ModelPreviewComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly modelStorage = inject(ModelStorage);
  private readonly motion = inject(MotionService);
  private readonly loadStage = inject(EFFECT_STAGE_LOADER);

  /** The piece or block whose model is shown. */
  readonly target = input.required<ModelledPiece>();
  /** What the model is asked to act, to be tried. */
  readonly act = input<ModelAct | null>(null);
  /** Whether the model walks, to be tried. */
  readonly walking = input(false);
  /**
   * Whether it is shown bare, filling what holds it with no frame of its own and nothing said while
   * the model is coming, as a cut-in shows a model, rather than as the boxed preview of a setting up.
   */
  readonly bare = input(false);
  /** Whether a drag across turns the figure. */
  readonly turnable = input(true);
  /** How far the figure is turned from facing the reader, in degrees clockwise seen from above, before any drag. */
  readonly turned = input(FIRST_TURN_DEG);
  /** Whether the piece is speaking, which moves the mouth of a model that has a shape for one. */
  readonly speaking = input(false);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly stage = signal<FigureStage | null>(null);
  private readonly cannotDraw = signal(false);
  private readonly size = signal({ width: 0, height: 0 });
  /** How far a drag has turned the figure on from where it was first shown. */
  private readonly draggedDeg = signal(0);
  /** One more each time a model has been read, or could not be, so that what is shown of it is asked after again. */
  private readonly arrivals = signal(0);
  private dragFromX: number | null = null;

  /** The figure stood on the canvas, or null while the piece names no model held here or the canvas has no room. */
  private readonly figure = computed<StageFigure | null>(() => {
    const target = this.target();
    this.objectChange.versionOf(target.identifier)();
    this.objectChange.fileVersion();
    const model = pieceModelOf(target);
    const held = model ? this.modelStorage.get(model.identifier) : null;
    const { width, height } = this.size();
    if (!model || !held?.isReady || width <= ROOM_PX * 2 || height <= ROOM_PX * 2) return null;
    const act = this.act();
    return {
      key: target.identifier,
      url: held.url,
      model: { ...model, scale: 1, turnDeg: 0 },
      at: { x: width / 2, y: height - ROOM_PX, z: 0 },
      widthPx: width - ROOM_PX * 2,
      heightPx: height - ROOM_PX * 2,
      turnDeg: this.turned() + this.draggedDeg(),
      walking: this.walking(),
      ...(act ? { act } : {}),
      ...(this.speaking() ? { speaking: true } : {}),
    };
  });

  /** Whether the model is still coming, is shown, or cannot be shown. */
  protected readonly state = computed<'loading' | 'shown' | 'failed'>(() => {
    if (this.cannotDraw()) return 'failed';
    this.arrivals();
    const stage = this.stage();
    const figure = this.figure();
    if (!stage || !figure) return 'loading';
    return stage.stands(figure.key) ? 'shown' : 'loading';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => void this.start(destroyRef));
    effect(() => {
      const stage = this.stage();
      const figure = this.figure();
      const { width, height } = this.size();
      if (stage && width > 0 && height > 0) stage.show(figure ? [figure] : [], { front: { width, height } });
    });
    effect(() => this.stage()?.setMoving(this.motion.enabled()));
    destroyRef.onDestroy(() => untracked(this.stage)?.dispose());
  }

  /** Loads what draws the model and makes the stage on the canvas, unless the preview is gone by then. */
  private async start(destroyRef: DestroyRef): Promise<void> {
    const canvas = this.canvas().nativeElement;
    destroyRef.onDestroy(observeSize(canvas, (size) => this.size.set(size)));
    const module = await this.loadStage();
    if (destroyRef.destroyed) return;
    const stage = (await module?.createFigureStage(canvas)) ?? null;
    if (destroyRef.destroyed) {
      stage?.dispose();
      return;
    }
    if (!stage) {
      this.cannotDraw.set(true);
      return;
    }
    stage.onArrival(() => this.arrivals.update((count) => count + 1));
    this.stage.set(stage);
  }

  protected press(event: PointerEvent): void {
    if (!this.turnable()) return;
    this.dragFromX = event.clientX;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }

  protected move(event: PointerEvent): void {
    if (this.dragFromX === null) return;
    this.draggedDeg.update((turn) => turn + (event.clientX - this.dragFromX!) * DRAG_TURN_DEG);
    this.dragFromX = event.clientX;
  }

  protected letGo(): void {
    this.dragFromX = null;
  }
}
