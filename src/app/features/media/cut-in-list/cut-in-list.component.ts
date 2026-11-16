import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { SaveProgress } from '@axe/application/file/save-progress';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CutIn } from '@axe/domain/media/cut-in';
import {
  asCutInMultiDirectionMode,
  CUT_IN_MULTI_DIRECTION_MODES,
  CutInMultiDirectionMode,
} from '@axe/domain/tabletop/cut-in-multi-direction';
import { CutInSceneEditorComponent } from '@axe/features/media/cut-in-editor/cut-in-scene-editor.component';
import { CutInEditorComponent } from '@axe/features/media/cut-in-list/cut-in-editor.component';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'cut-in-list',
  templateUrl: './cut-in-list.component.html',
  imports: [TextTooltipDirective, FormsModule, CutInEditorComponent, CutInSceneEditorComponent, TranslocoModule],
})
export class CutInListComponent {
  private readonly modalService = inject(ModalService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly panelService = inject(PanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);

  /** The cut-in picked in the list for editing, or null when none is. */
  readonly selectedCutIn = signal<CutIn | null>(null);

  /**
   * How many ways a cut-in faces on a table seen from above.
   *
   * It belongs to the screen this reader is watching, so a cut-in reaches the people sitting
   * around a flat screen from four sides, and everyone else the usual way.
   */
  private readonly display = inject(TabletopDisplayService);
  protected readonly multiDirectionModes = CUT_IN_MULTI_DIRECTION_MODES;

  /**
   * How cut-ins face the sides of a table seen from above, kept in this screen's display settings
   * rather than in the room.
   */
  get multiDirectionMode(): CutInMultiDirectionMode {
    return this.display.settingsNow().cutInMultiDirectionMode;
  }
  set multiDirectionMode(value: CutInMultiDirectionMode) {
    this.display.set({ cutInMultiDirectionMode: asCutInMultiDirectionMode(value) });
  }

  /** The settings every cut-in has, and the layers it may be built from. */
  readonly tabs = ['Basic', 'Scene'] as const;
  readonly activeTab = signal<(typeof this.tabs)[number]>('Basic');

  private readonly saveProgress = new SaveProgress();
  readonly isSaving = this.saveProgress.isSaving;
  readonly progressPercent = this.saveProgress.percent;

  constructor() {
    queueMicrotask(
      () => (this.modalService.title = this.panelService.title = this.t('feature.media.cutIn.panelTitle'))
    );
  }

  /** Whether a cut-in is picked in the list. */
  get isSelected(): boolean {
    return this.selectedCutIn() !== null;
  }

  /**
   * Whether the cut-ins are this reader's to change.
   *
   * A cut-in plays to the whole table and is kept with the room, so making one or throwing one
   * away is a change to what everybody has. A seat that is only watching makes neither.
   */
  get canEditCutIns(): boolean {
    return this.rolePermission.canEditTabletop();
  }

  /**
   * Whether the editors accept changes: a cut-in is picked, there are cut-ins, and the reader may
   * edit them.
   */
  get isEditable(): boolean {
    return !this.isEmpty && this.isSelected && this.canEditCutIns;
  }

  /** Whether the room has no cut-ins. */
  get isEmpty(): boolean {
    return this.cutIns().length <= 0;
  }

  /**
   * Every cut-in in the room, for the list. The room's cut-ins coming and going are followed, so the
   * list is drawn again when one goes after a question asked elsewhere has been answered.
   */
  readonly cutIns = computed<CutIn[]>(() => {
    this.objectChange.collectionOf(CutIn.aliasName)();
    return this.objectStore.getObjects(CutIn);
  });

  /** Picks the cut-in with the given identifier for editing, or clears the pick when it is not found. */
  selectCutIn(identifier: string) {
    this.selectedCutIn.set(this.objectStore.get<CutIn>(identifier));
  }

  /** Picks the cut-in named by a select element's value, from its change event. */
  onSelectCutIn(event: Event): void {
    this.selectCutIn((event.target as HTMLInputElement).value);
  }

  /**
   * Makes a new cut-in in the room with the default name and sample picture, and picks it; does
   * nothing for a reader who may not edit cut-ins.
   */
  createCutIn() {
    if (!this.canEditCutIns) return;
    const cutIn = new CutIn();
    cutIn.name = this.t('feature.media.cutIn.defaultName');
    cutIn.imageIdentifier = 'testTableBackgroundImage_image';
    cutIn.initialize();
    this.selectCutIn(cutIn.identifier);
  }

  /** Saves the picked cut-in to a file named after it, showing progress while the file is written. */
  async save() {
    const cutIn = this.selectedCutIn();
    if (!cutIn) return;
    await this.saveProgress.run((onProgress) => {
      cutIn.selected = true;
      return this.saveDataService.saveGameObjectAsync(cutIn, 'cut_' + cutIn.name, onProgress);
    });
  }

  /**
   * Destroys the picked cut-in for everyone and clears the pick, once the reader has said they mean
   * it; does nothing for a reader who may not edit cut-ins.
   *
   * Nothing is destroyed when another cut-in was picked while the question was open.
   */
  async delete(): Promise<void> {
    if (!this.canEditCutIns) return;
    const cutIn = this.selectedCutIn();
    if (this.isEmpty || !cutIn) return;
    const sure = await this.confirm.ask({
      message: this.t('feature.media.cutIn.deleteConfirm', { name: cutIn.name }),
      okLabel: this.t('common.button.delete'),
      danger: true,
    });
    if (!sure) return;
    if (this.selectedCutIn() !== cutIn || !this.canEditCutIns) return;
    cutIn.destroy();
    this.selectedCutIn.set(null);
  }
}
