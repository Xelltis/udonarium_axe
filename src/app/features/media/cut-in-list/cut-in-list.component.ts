import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
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
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-cut-in-list',
  templateUrl: './cut-in-list.component.html',
  imports: [FormsModule, CutInEditorComponent, CutInSceneEditorComponent, TranslocoModule],
})
export class CutInListComponent {
  private readonly modalService = inject(ModalService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly panelService = inject(PanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);

  selectedCutIn: CutIn | null = null;

  /**
   * How many ways a cut-in faces on a table seen from above.
   *
   * It belongs to the screen this reader is watching, so a cut-in reaches the people sitting
   * around a flat screen from four sides, and everyone else the way it always did.
   */
  private readonly display = inject(TabletopDisplayService);
  protected readonly multiDirectionModes = CUT_IN_MULTI_DIRECTION_MODES;

  get multiDirectionMode(): CutInMultiDirectionMode {
    return this.display.settingsNow().cutInMultiDirectionMode;
  }
  set multiDirectionMode(value: CutInMultiDirectionMode) {
    this.display.set({ cutInMultiDirectionMode: asCutInMultiDirectionMode(value) });
  }

  /** The settings a cut-in has always had, and the layers it may now be built from. */
  readonly tabs = ['Basic', 'Scene'] as const;
  readonly activeTab = signal<(typeof this.tabs)[number]>('Basic');

  readonly isSaving = signal(false);
  readonly progressPercent = signal(0);

  constructor() {
    queueMicrotask(
      () => (this.modalService.title = this.panelService.title = this.t('feature.media.cutIn.panelTitle'))
    );
  }

  get isSelected(): boolean {
    return this.selectedCutIn !== null;
  }

  /**
   * Whether the cut-ins are this reader's to change.
   *
   * A cut-in plays to the whole table and is kept with the room, so making one or throwing one
   * away is a change to what everybody has. A seat that is only watching makes neither.
   */
  get canEditCutIns(): boolean {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  }

  get isEditable(): boolean {
    return !this.isEmpty && this.isSelected && this.canEditCutIns;
  }

  get isEmpty(): boolean {
    return this.getCutIns().length <= 0;
  }

  getCutIns(): CutIn[] {
    return this.objectStore.getObjects(CutIn);
  }

  selectCutIn(identifier: string) {
    this.selectedCutIn = this.objectStore.get<CutIn>(identifier);
  }

  onSelectCutIn(event: Event): void {
    this.selectCutIn((event.target as HTMLInputElement).value);
  }

  createCutIn() {
    if (!this.canEditCutIns) return;
    const cutIn = new CutIn();
    cutIn.name = this.t('feature.media.cutIn.defaultName');
    cutIn.imageIdentifier = 'testTableBackgroundImage_image';
    cutIn.initialize();
    this.selectCutIn(cutIn.identifier);
  }

  async save() {
    if (!this.selectedCutIn) return;
    this.isSaving.set(true);
    this.progressPercent.set(0);

    this.selectedCutIn.selected = true;
    const fileName: string = 'cut_' + this.selectedCutIn.name;

    await this.saveDataService.saveGameObjectAsync(this.selectedCutIn, fileName, (percent) => {
      this.progressPercent.set(percent);
    });

    setTimeout(() => {
      this.isSaving.set(false);
      this.progressPercent.set(0);
    }, 500);
  }

  delete() {
    if (!this.canEditCutIns) return;
    if (!this.isEmpty && this.selectedCutIn) {
      this.selectedCutIn.destroy();
      this.selectedCutIn = null;
    }
  }
}
