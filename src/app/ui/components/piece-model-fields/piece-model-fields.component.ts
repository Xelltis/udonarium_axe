import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelPortraitService } from '@axe/application/character/model-portrait.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModelNamesService, NO_MODEL_NAMES } from '@axe/application/tabletop/model-names.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { GameCharacter } from '@axe/domain/character/game-character';
import type { ModelAct, MotionRole } from '@axe/domain/tabletop/model-motions';
import { modelScaleOf, modelTurnOf } from '@axe/domain/tabletop/piece-model';
import { ModelFaceFieldsComponent } from '@axe/ui/components/piece-model-fields/model-face-fields.component';
import { ModelGivenMotionsComponent } from '@axe/ui/components/piece-model-fields/model-given-motions.component';
import { ModelLookFieldsComponent } from '@axe/ui/components/piece-model-fields/model-look-fields.component';
import { ModelMotionFieldsComponent } from '@axe/ui/components/piece-model-fields/model-motion-fields.component';
import { ModelPreviewComponent } from '@axe/ui/components/piece-model-fields/model-preview.component';
import {
  type ModelFieldChanges,
  type ModelledPiece,
  writeModelFields,
} from '@axe/ui/components/piece-model-fields/modelled-piece';
import { TranslocoModule } from '@jsverse/transloco';

export type { ModelledPiece } from '@axe/ui/components/piece-model-fields/modelled-piece';

/** What the preview is asked to try: an act, or walking. */
interface Tried {
  readonly act: ModelAct | null;
  readonly walking: boolean;
}

const NOTHING_TRIED: Tried = { act: null, walking: false };

/**
 * Where a piece or a block is given the 3D model a table drawn on a canvas draws it as: one of the
 * models held here, or one read from a `.glb` file, and how large and how far turned it is drawn.
 * Opened further, it is set up: how its materials are drawn, the motions it plays, and what it does
 * with the shapes it can be blended towards, beside a preview that shows each change at once and
 * tries the motions. A table the page draws itself draws the picture still.
 */
@Component({
  selector: 'piece-model-fields',
  templateUrl: './piece-model-fields.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslocoModule,
    ModelPreviewComponent,
    ModelLookFieldsComponent,
    ModelGivenMotionsComponent,
    ModelMotionFieldsComponent,
    ModelFaceFieldsComponent,
  ],
  host: { class: 'flex flex-col gap-1.5' },
})
export class PieceModelFieldsComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly modelStorage = inject(ModelStorage);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly modelNames = inject(ModelNamesService);
  private readonly portraits = inject(ModelPortraitService);
  private readonly preview = viewChild(ModelPreviewComponent);

  /** The piece or block whose model is chosen. */
  readonly target = input.required<ModelledPiece>();
  /**
   * Whether what is set up is a piece, which walks and fights, rather than a block, which only
   * stands: a block is given no motions to walk or fight in.
   */
  readonly fights = input(true);

  /** The models held here in full, by name, which may be chosen. */
  protected readonly models = computed(() => {
    this.objectChange.fileVersion();
    return this.modelStorage.drawableModels
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
    };
  });

  /** What the model chosen names of itself: its motions, its shapes and its materials. */
  protected readonly names = computed(() => {
    this.objectChange.fileVersion();
    const identifier = this.fields().identifier;
    return identifier ? this.modelNames.namesOf(identifier) : NO_MODEL_NAMES;
  });

  /** Whether the target is a piece with portraits, which a picture of its model may be added to. */
  protected readonly portrayed = computed(() => this.target() instanceof GameCharacter);
  /** Whether a picture of the model is being added to the piece's portraits now. */
  protected readonly portraying = signal(false);

  /** Whether the model's setting up is opened, which shows its preview. */
  protected readonly settingUp = signal(false);
  protected readonly tried = signal<Tried>(NOTHING_TRIED);
  private tries = 0;

  protected choose(identifier: string): void {
    this.write({ modelIdentifier: identifier });
  }

  protected setScale(value: unknown): void {
    this.write({ modelScale: `${modelScaleOf(value)}` });
  }

  protected setTurn(value: unknown): void {
    this.write({ modelTurn: `${modelTurnOf(value)}` });
  }

  /**
   * Has the preview try a role: stand, walk until it is asked to stand or to walk again, or act the
   * role once from now.
   */
  protected try(role: MotionRole): void {
    if (role === 'idle') this.tried.set(NOTHING_TRIED);
    else if (role === 'walk') this.tried.update((tried) => ({ act: null, walking: !tried.walking }));
    else this.tried.set({ act: { key: `tried:${++this.tries}`, role, atMs: performance.now() }, walking: false });
  }

  /**
   * Adds a picture of the model as the preview shows it, as it is set up, to the piece's portraits,
   * as the one it shows wherever its picture is shown.
   */
  protected async addPortrait(): Promise<void> {
    const target = this.target();
    const preview = this.preview();
    if (!(target instanceof GameCharacter) || !preview || this.portraying()) return;
    this.portraying.set(true);
    try {
      const picture = await preview.picture();
      if (picture) await this.portraits.addShown(target, picture, this.modelName());
    } finally {
      this.portraying.set(false);
    }
  }

  /** The name of the model the target is drawn as, as it is listed. */
  private modelName(): string {
    const identifier = this.fields().identifier;
    return (
      this.models()
        .find((model) => model.identifier === identifier)
        ?.name.replace(/\.glb$/i, '') ?? ''
    );
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

  private write(changes: ModelFieldChanges): void {
    writeModelFields(this.target(), changes, this.objectChange);
  }
}
