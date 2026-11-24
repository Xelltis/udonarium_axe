import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  AS_MADE,
  type MaterialLook,
  MAX_MODEL_GLOW,
  MAX_MODEL_LOOK_MATERIALS,
  mayChangeMaterial,
  MODEL_AS_MADE,
  MODEL_FINISHES,
  type ModelFinish,
  type ModelLook,
  modelLookOf,
  withMaterialLook,
  writeModelLook,
} from '@axe/domain/tabletop/model-look';
import {
  MODEL_LOOK_PRESET_NAMES,
  type ModelLookPreset,
  presetModelLook,
} from '@axe/domain/tabletop/model-look-presets';
import {
  MODEL_FIELD_STYLES,
  type ModelledPiece,
  writeModelFields,
} from '@axe/ui/components/piece-model-fields/modelled-piece';
import { TranslocoModule } from '@jsverse/transloco';

/** The colour a tint or a glow starts from when it is first turned on. */
const FIRST_TINT = '#ffffff';
const FIRST_GLOW = '#ffd27a';

/**
 * Where a piece or a block is given how its model's materials are drawn: a ready-made look, the
 * finish, and what is changed of all its materials or of one of them alone, by name. Every change is
 * written to the piece at once, so the model on the table and in the preview follows it; a slider or
 * a colour once it is let go, not at each step of a drag, as each look is a copy of the model made
 * over on every screen of the room.
 */
@Component({
  selector: 'model-look-fields',
  templateUrl: './model-look-fields.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
  host: { class: 'flex flex-col gap-1.5' },
})
export class ModelLookFieldsComponent {
  private readonly objectChange = inject(ObjectChangeService);

  /** The piece or block whose model's look is set. */
  readonly target = input.required<ModelledPiece>();
  /** The materials of its model, each by the key it is told apart by. */
  readonly materials = input<readonly string[]>([]);

  protected readonly styles = MODEL_FIELD_STYLES;
  protected readonly presets = MODEL_LOOK_PRESET_NAMES;
  protected readonly finishes = MODEL_FINISHES;
  protected readonly mostGlow = MAX_MODEL_GLOW;

  /** The material being set, or empty for the whole model; back to the whole where the model has no such material. */
  protected readonly scope = linkedSignal<readonly string[], string>({
    source: () => this.materials(),
    computation: (materials, before) => (before && materials.includes(before.value) ? before.value : ''),
  });

  /** The look the piece keeps now. */
  protected readonly look = computed<ModelLook>(() => {
    const target = this.target();
    this.objectChange.versionOf(target.identifier)();
    return modelLookOf(target.modelLook);
  });

  /** What is set of the material being set alone, or of the whole model. */
  protected readonly set = computed<MaterialLook>(() => {
    const scope = this.scope();
    return scope ? (this.look().materials[scope] ?? AS_MADE) : this.look();
  });

  /** The ready-made look the whole model is drawn in, or empty where it is none of them. */
  protected readonly preset = computed<ModelLookPreset | ''>(() => {
    const whole = writeModelLook({ ...this.look(), materials: {} });
    return this.presets.find((name) => writeModelLook(presetModelLook(name)) === whole) ?? '';
  });

  /** The materials given a look of their own, which the list marks. */
  protected readonly changed = computed(() => new Set(Object.keys(this.look().materials)));

  /** Whether a material may be chosen to be set apart: not one more once as many as are kept have been. */
  protected mayChoose(material: string): boolean {
    return mayChangeMaterial(this.look(), material);
  }

  /** As many materials as may be set apart, which the list says once they all have been. */
  protected readonly mostMaterials = MAX_MODEL_LOOK_MATERIALS;

  protected choosePreset(preset: ModelLookPreset | ''): void {
    if (preset === '') return;
    this.write({ ...presetModelLook(preset), materials: this.look().materials });
  }

  protected setFinish(finish: ModelFinish): void {
    this.write({ ...this.look(), finish });
  }

  /** Changes what is set of the material being set, or of the whole model. */
  protected change(changes: Partial<MaterialLook>): void {
    const scope = this.scope();
    const look = this.look();
    if (scope) this.write(withMaterialLook(look, scope, { ...(look.materials[scope] ?? AS_MADE), ...changes }));
    else this.write({ ...look, ...changes, hidden: false });
  }

  protected tint(on: boolean): void {
    this.change({ tint: on ? FIRST_TINT : '' });
  }

  protected glow(on: boolean): void {
    this.change(on ? { glow: FIRST_GLOW, glowStrength: 1 } : { glow: '', glowStrength: null });
  }

  /** Sets a number from what a slider says, or leaves it to the model where it is turned off. */
  protected number(field: 'metalness' | 'roughness' | 'glowStrength', value: unknown, on = true): void {
    const number = Number(value);
    this.change({ [field]: on && Number.isFinite(number) ? number : null });
  }

  /** Sets how solid the material is, left to the model where it is as solid as can be. */
  protected opacity(value: unknown): void {
    const number = Number(value);
    this.change({ opacity: Number.isFinite(number) && number < 1 ? number : null });
  }

  /** Draws the whole model, and every material of it, as it was made again. */
  protected reset(): void {
    this.write(MODEL_AS_MADE);
  }

  private write(look: ModelLook): void {
    writeModelFields(this.target(), { modelLook: writeModelLook(look) }, this.objectChange);
  }
}
