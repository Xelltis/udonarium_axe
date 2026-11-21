import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  MAX_FACE_SWAYS,
  MAX_FACE_WEIGHTS,
  MAX_SWAY_MS,
  MIN_SWAY_MS,
  type ModelFace,
  modelFaceOf,
  NO_SHAPE,
  shapesFor,
  type ShapeSway,
  type ShapeUse,
  writeModelFace,
} from '@axe/domain/tabletop/model-face';
import {
  MODEL_FIELD_STYLES,
  type ModelledPiece,
  writeModelFields,
} from '@axe/ui/components/piece-model-fields/modelled-piece';
import { TranslocoModule } from '@jsverse/transloco';

/** How long a shape added to those swayed between takes to sway once, in milliseconds. */
const FIRST_SWAY_MS = 3000;

/**
 * Where a piece is given what its model does with the shapes it can be blended towards: which it
 * blinks, speaks and breathes with, the expression it is held in, and the shapes it sways between
 * as it stands, which make a model with no motion of its own stand alive.
 */
@Component({
  selector: 'model-face-fields',
  templateUrl: './model-face-fields.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
  host: { class: 'flex flex-col gap-1.5' },
})
export class ModelFaceFieldsComponent {
  private readonly objectChange = inject(ObjectChangeService);

  /** The piece whose model's shapes are set. */
  readonly target = input.required<ModelledPiece>();
  /** The shapes its model can be blended towards, by name. */
  readonly shapes = input<readonly string[]>([]);

  protected readonly styles = MODEL_FIELD_STYLES;
  protected readonly uses: readonly ShapeUse[] = ['blink', 'mouth', 'breath'];
  protected readonly none = NO_SHAPE;
  protected readonly swaySeconds = { least: MIN_SWAY_MS / 1000, most: MAX_SWAY_MS / 1000 };

  /** What the piece keeps of its model's shapes now. */
  protected readonly face = computed<ModelFace>(() => {
    const target = this.target();
    this.objectChange.versionOf(target.identifier)();
    return modelFaceOf(target.modelFace);
  });

  /** The shapes the model uses for each use where the piece leaves it to the model, told by their names. */
  protected readonly own = computed<Record<ShapeUse, string>>(() => {
    const shapes = this.shapes();
    const named = (use: ShapeUse) => shapesFor(use, shapes, '').join(' + ');
    return { blink: named('blink'), mouth: named('mouth'), breath: named('breath') };
  });

  /** The shapes the model is held in, as an expression, in the order of their names. */
  protected readonly held = computed(() =>
    Object.keys(this.face().weights)
      .sort()
      .map((name) => ({ name, weight: this.face().weights[name] }))
  );

  /** The shapes that may still be added to those the model is held in, and to those it sways between. */
  protected readonly toHold = computed(() =>
    Object.keys(this.face().weights).length >= MAX_FACE_WEIGHTS
      ? []
      : this.shapes().filter((name) => !(name in this.face().weights))
  );
  protected readonly toSway = computed(() => {
    const swayed = new Set(this.face().sways.map((sway) => sway.name));
    return swayed.size >= MAX_FACE_SWAYS ? [] : this.shapes().filter((name) => !swayed.has(name));
  });

  protected setUse(use: ShapeUse, name: string): void {
    this.write({ ...this.face(), [use]: name });
  }

  /** Holds the model in a shape so far, or lets go of the shape where it is held in none of it. */
  protected hold(name: string, weight: unknown): void {
    const weights = { ...this.face().weights };
    const number = Number(weight);
    if (Number.isFinite(number) && number > 0) weights[name] = number;
    else delete weights[name];
    this.write({ ...this.face(), weights });
  }

  protected addHeld(name: string): void {
    if (name) this.hold(name, 1);
  }

  protected addSway(name: string): void {
    if (name)
      this.write({ ...this.face(), sways: [...this.face().sways, { name, periodMs: FIRST_SWAY_MS, amount: 1 }] });
  }

  protected changeSway(index: number, changes: Partial<ShapeSway>): void {
    this.write({
      ...this.face(),
      sways: this.face().sways.map((sway, at) => (at === index ? { ...sway, ...changes } : sway)),
    });
  }

  protected setSwaySeconds(index: number, seconds: unknown): void {
    const number = Number(seconds);
    if (Number.isFinite(number) && number > 0) this.changeSway(index, { periodMs: number * 1000 });
  }

  protected removeSway(index: number): void {
    this.write({ ...this.face(), sways: this.face().sways.filter((_, at) => at !== index) });
  }

  private write(face: ModelFace): void {
    writeModelFields(this.target(), { modelFace: writeModelFace(modelFaceOf(face)) }, this.objectChange);
  }
}
