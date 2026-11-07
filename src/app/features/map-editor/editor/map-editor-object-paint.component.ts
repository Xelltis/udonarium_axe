import { PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { type ObjectArrangement, type ObjectPaintSpec } from '@axe/domain/tabletop/function-paint';
import {
  PLACEABLE_MODEL_GROUPS,
  PLACEABLE_MODELS,
  type PlaceableModelGroup,
  placeableModelGroupLabelKey,
  placeableModelIconUrl,
  placeableModelLabelKey,
  placeableModelOf,
} from '@axe/domain/tabletop/placeable-models';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TranslocoModule } from '@jsverse/transloco';

/** A shelf of the model list: one of the bundled models', or the models held in the room. */
type ModelShelf = PlaceableModelGroup | 'room';

/** The largest seed a brush's scattering is drawn from. */
const MOST_SEED = 2 ** 31 - 1;

/**
 * The settings of the brush that sets 3D objects out over the cells it paints: which model, one to
 * a cell or scattered, how large and how turned, and whether each stands in the way and hides what
 * is behind it, which choosing a bundled model sets as that model is wont to.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'map-editor-object-paint',
  templateUrl: './map-editor-object-paint.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, PercentPipe, TranslocoModule],
})
export class MapEditorObjectPaintComponent {
  protected readonly state = inject(MapEditorState);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly modelStorage = inject(ModelStorage);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly arrangements: readonly ObjectArrangement[] = ['scatter', 'cell'];

  /** The shelves of the model list, the bundled models' and then the room's. */
  protected readonly shelves: readonly { shelf: ModelShelf; labelKey: string }[] = [
    ...PLACEABLE_MODEL_GROUPS.map((group) => ({ shelf: group, labelKey: placeableModelGroupLabelKey(group) })),
    { shelf: 'room', labelKey: 'feature.mapEditor.object.group_room' },
  ];

  /** The bundled models, by shelf, each with its name and the picture it is shown by. */
  private readonly bundledByShelf = new Map(
    PLACEABLE_MODEL_GROUPS.map((group) => [
      group,
      PLACEABLE_MODELS.filter((model) => model.group === group).map((model) => ({
        id: model.id,
        labelKey: placeableModelLabelKey(model.id),
        icon: placeableModelIconUrl(model.id) ?? '',
      })),
    ])
  );

  /** The models held in the room in full, by name, which may be painted as well. */
  protected readonly roomModels = computed(() => {
    this.objectChange.fileVersion();
    return this.modelStorage.models
      .filter((model) => model.isReady)
      .map((model) => ({ identifier: model.identifier, name: model.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly spec = computed(() => this.state.functionSpec().object);

  /** The shelf the model list shows: the one the brush's model is on, until another is opened. */
  protected readonly shelf = linkedSignal<ModelShelf>(() => placeableModelOf(this.spec().model)?.group ?? 'room');

  /** The bundled models on the shelf shown; none where it is the room's. */
  protected readonly shelfModels = computed(() => {
    const shelf = this.shelf();
    return shelf === 'room' ? [] : (this.bundledByShelf.get(shelf) ?? []);
  });

  /** What the brush's model is called, as the model list names it. */
  protected readonly modelName = computed(() => {
    const model = this.spec().model;
    if (placeableModelOf(model)) return this.t(placeableModelLabelKey(model));
    return this.roomModels().find((held) => held.identifier === model)?.name ?? model;
  });

  /** Whether the brush's model is a bundled one, whose proportions decide how tall it stands. */
  protected readonly bundled = computed(() => placeableModelOf(this.spec().model) !== null);

  protected setObjectPaint(patch: Partial<ObjectPaintSpec>): void {
    const spec = this.state.functionSpec();
    this.state.setFunctionSpec({ ...spec, object: { ...spec.object, ...patch } });
  }

  /**
   * Takes up a model for the brush, named after it on the table: a bundled one at its own size,
   * standing in the way and hiding what is behind it as it is wont to, scattered where it grows in
   * open country and one to a cell otherwise; one held in the room a cell across and a cell tall,
   * standing in the way, one to a cell.
   */
  protected chooseModel(model: string): void {
    const bundled = placeableModelOf(model);
    if (bundled) {
      this.setObjectPaint({
        model,
        name: this.t(placeableModelLabelKey(model)),
        size: bundled.size,
        blocksMove: bundled.blocksMove,
        blocksSight: bundled.blocksSight,
        arrangement: bundled.group === 'nature' ? 'scatter' : 'cell',
      });
      return;
    }
    const held = this.modelStorage.get(model);
    this.setObjectPaint({
      model,
      name: (held?.name ?? '').replace(/\.glb$/i, ''),
      size: 1,
      height: 1,
      blocksMove: true,
      blocksSight: false,
      arrangement: 'cell',
    });
  }

  /** Sets the brush's objects out another way, from another seed. */
  protected rearrange(): void {
    this.setObjectPaint({ seed: 1 + Math.floor(Math.random() * MOST_SEED) });
  }

  /** Reads a `.glb` file chosen into the room's models, and takes it up for the brush. */
  protected async readModel(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length < 1) return;
    const { models } = await this.fileArchiver.load(files);
    if (models.length > 0) this.chooseModel(models[0]);
  }
}
