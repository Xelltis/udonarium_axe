import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AssetOwnershipService } from '@axe/application/file/asset-ownership.service';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModelPictureService } from '@axe/application/media/model-picture.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { type ModelFile, modelNameOf } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { MODEL_TAG_ALIAS, ModelTag } from '@axe/domain/media/model-tag';
import { attachModel, MODEL_DRAG_TYPE, takesModel } from '@axe/features/media/model-library/attach-model';
import { ModelStageComponent } from '@axe/features/media/model-library/model-stage.component';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';

/** The pill that shows every model, whatever its tag. */
const EVERY_TAG = '';

/**
 * The room's 3D models as media, as the pictures and the sounds are: each shown by a picture of it,
 * sorted by its tag, and the one chosen shown turning. A seat that may change the table reads new
 * `.glb` files in, tags them, puts one on the pieces and blocks chosen on the table, or drags one
 * onto a piece, and removes them from the room as the GM may any and a player the ones they added.
 */
@Component({
  selector: 'model-library',
  templateUrl: './model-library.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModelStageComponent, TextTooltipDirective, TranslocoModule],
  host: { class: 'block' },
})
export class ModelLibraryComponent {
  private readonly modelStorage = inject(ModelStorage);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly assetRemoval = inject(AssetRemovalService);
  private readonly ownership = inject(AssetOwnershipService);
  private readonly selection = inject(SelectionSignalService);
  private readonly snackbar = inject(SnackbarService);
  private readonly pictures = inject(ModelPictureService);
  private readonly t = inject(TRANSLATE_FN);

  /** The tag the list shows the models of, or every model for none. */
  protected readonly shownTag = signal(EVERY_TAG);
  /** The models ticked, for what is done to several at once. */
  protected readonly checked = signal<ReadonlySet<string>>(new Set());
  /** The model shown turning, the last one pressed. */
  protected readonly chosen = signal<string | null>(null);
  /**
   * What tagging and removing act on: the models ticked that are held here, or, while none is, the
   * one chosen in the list, still coming or not.
   */
  protected readonly acted = computed<readonly string[]>(() => {
    this.objectChange.fileVersion();
    const held = (identifier: string | null): identifier is string =>
      identifier !== null && this.modelStorage.get(identifier) !== null;
    const checked = [...this.checked()].filter(held);
    if (checked.length > 0) return checked;
    const chosen = this.chosen();
    return held(chosen) ? [chosen] : [];
  });
  protected readonly newTag = signal('');

  protected readonly canEdit = computed(() => this.rolePermission.canEditTabletop());

  /** Every model held here, named, with its tag; a model only named by a catalogue, still to come, too. */
  private readonly held = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(MODEL_TAG_ALIAS)();
    return this.modelStorage.models
      .map((model) => {
        const tag = ModelTag.get(model.identifier);
        if (tag) this.objectChange.versionOf(tag.identifier)();
        return { model, tag: tag?.tag ?? '' };
      })
      .sort((a, b) => a.model.name.localeCompare(b.model.name));
  });

  /** The tags the models are sorted by, each once, for the pills over the list. */
  protected readonly tags = computed(() =>
    [...new Set(this.held().map((entry) => entry.tag))].filter((tag) => tag !== '').sort()
  );

  /** The models the list shows: those of the tag shown, or every one. */
  protected readonly models = computed(() => {
    const tag = this.shownTag();
    return this.held().filter((entry) => tag === EVERY_TAG || entry.tag === tag);
  });

  /** The model shown turning, while it is held here in full. */
  protected readonly chosenModel = computed(() => {
    this.objectChange.fileVersion();
    const identifier = this.chosen();
    const model = identifier ? this.modelStorage.get(identifier) : null;
    return model?.isReady ? model : null;
  });

  /** Which of the models acted on this seat may remove from the room. */
  protected readonly removable = computed(() => {
    this.ownership.track();
    this.rolePermission.canEditTabletop();
    return this.assetRemoval.removable('model', this.acted());
  });

  /** The pieces and blocks chosen on the table that a model can be put on. */
  protected readonly targets = computed(() => {
    const chosen = this.selection.selectedObjects();
    const last = this.selection.selectedObject()?.identifier;
    const identifiers = chosen.size > 0 ? [...chosen] : last ? [last] : [];
    for (const identifier of identifiers) this.objectChange.versionOf(identifier)();
    return identifiers.map((identifier) => this.objectStore.get(identifier)).filter(takesModel);
  });

  protected pictureOf(model: ModelFile): string | null {
    this.objectChange.fileVersion();
    return this.pictures.pictureOf(model);
  }

  protected nameOf(model: ModelFile): string {
    return modelNameOf(model.name);
  }

  /** Shows a model turning, ticking nothing. */
  protected choose(identifier: string): void {
    this.chosen.set(identifier);
  }

  /** Ticks a model, or unticks it, for what is done to several at once. */
  protected toggle(identifier: string): void {
    const next = new Set(this.checked());
    if (next.has(identifier)) next.delete(identifier);
    else next.add(identifier);
    this.checked.set(next);
  }

  protected startDrag(event: DragEvent, model: ModelFile): void {
    event.dataTransfer?.setData(MODEL_DRAG_TYPE, model.identifier);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  /** Reads the `.glb` files chosen into the room's models, and shows the first of them. */
  protected async read(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length < 1) return;
    const { models } = await this.fileArchiver.load(files);
    if (models.length > 0) this.chosen.set(models[0]);
  }

  /** Tags the models acted on with the tag typed, or untags them for an empty one. */
  protected tagActed(): void {
    const tag = this.newTag().trim();
    for (const identifier of this.acted()) ModelTag.tagWith(identifier, tag);
  }

  /** Puts the model shown on every piece and block chosen on the table. */
  protected putOnChosen(): void {
    const model = this.chosenModel();
    if (!model) return;
    const put = this.targets().filter((target) => attachModel(target, model.identifier)).length;
    if (put > 0)
      this.snackbar.show(this.t('feature.media.modelLibrary.attached', { count: put, name: this.nameOf(model) }));
  }

  /** Removes the models acted on from the room, after asking. */
  protected async removeActed(): Promise<void> {
    const removed = await this.assetRemoval.removeAfterAsking('model', this.acted());
    if (removed > 0) this.checked.set(new Set());
  }
}
