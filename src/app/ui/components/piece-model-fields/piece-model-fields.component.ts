import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { modelScaleOf, modelTurnOf, type PieceModelFields } from '@axe/domain/tabletop/piece-model';
import { TranslocoModule } from '@jsverse/transloco';

/** A piece or a block whose 3D model is chosen here. */
export type ModelledPiece = PieceModelFields & {
  readonly identifier: string;
  modelIdentifier: string;
  modelScale: string;
  modelTurn: string;
  modelIdle: string;
  modelWalk: string;
};

/**
 * Where a piece or a block is given the 3D model a table drawn on a canvas draws it as: one of the
 * models held here, or one read from a `.glb` file, how large and how far turned it is drawn, and the
 * motions it plays standing still and walking. A table the page draws itself draws the picture still.
 */
@Component({
  selector: 'piece-model-fields',
  templateUrl: './piece-model-fields.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
  host: { class: 'flex flex-col gap-1.5' },
})
export class PieceModelFieldsComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly modelStorage = inject(ModelStorage);
  private readonly fileArchiver = inject(FileArchiver);

  /** The piece or block whose model is chosen. */
  readonly target = input.required<ModelledPiece>();

  /** The models held here in full, by name, which may be chosen. */
  protected readonly models = computed(() => {
    this.objectChange.fileVersion();
    return this.modelStorage.models
      .filter((model) => model.isReady)
      .map((model) => ({ identifier: model.identifier, name: model.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** What the target says of its model now. */
  protected readonly fields = computed(() => {
    const target = this.target();
    this.objectChange.versionOf(target.identifier)();
    return {
      identifier: target.modelIdentifier ?? '',
      scale: modelScaleOf(target.modelScale),
      turn: modelTurnOf(target.modelTurn),
      idle: target.modelIdle ?? '',
      walk: target.modelWalk ?? '',
    };
  });

  protected choose(identifier: string): void {
    this.write({ modelIdentifier: identifier });
  }

  protected setScale(value: unknown): void {
    this.write({ modelScale: `${modelScaleOf(value)}` });
  }

  protected setTurn(value: unknown): void {
    this.write({ modelTurn: `${modelTurnOf(value)}` });
  }

  protected setIdle(value: string): void {
    this.write({ modelIdle: value.trim() });
  }

  protected setWalk(value: string): void {
    this.write({ modelWalk: value.trim() });
  }

  /** Reads a `.glb` file chosen into the models held here, and gives it to the target. */
  protected async read(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length < 1) return;
    const { models } = await this.fileArchiver.load(files);
    if (models.length > 0) this.choose(models[0]);
  }

  private write(
    changes: Partial<Pick<ModelledPiece, 'modelIdentifier' | 'modelScale' | 'modelTurn' | 'modelIdle' | 'modelWalk'>>
  ): void {
    const target = this.target();
    Object.assign(target, changes);
    this.objectChange.notifyChanged(target.identifier);
  }
}
