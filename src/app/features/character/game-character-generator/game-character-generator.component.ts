import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewContainerRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'game-character-generator',
  templateUrl: './game-character-generator.component.html',
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class GameCharacterGeneratorComponent {
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectSerializer = inject(ObjectSerializer);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  name: string = this.t('feature.character.generator.defaultName');
  size: number = 1;
  xml: string = '';

  minSize: number = 1;
  maxSize: number = 20;

  readonly tableBackgroundImage = signal<ImageFile>(ImageFile.createEmpty('null'));

  constructor() {
    queueMicrotask(() => (this.panelService.title = this.t('feature.character.panel.generator')));
    this.objectChange.selectFile$.subscribe((event) => {
      const file = this.imageStorage.get(event.fileIdentifier);
      if (file) this.tableBackgroundImage.set(file);
    }, this.destroyRef);
  }

  /** Whether this player's role may put pieces on the table, which the create buttons are disabled on. */
  get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  /**
   * Creates a character piece from the name, size and picture entered in the panel.
   *
   * The piece is owned by this player, and a game master's piece starts out shown to the game
   * master only. Does nothing for a role that may not edit the table.
   */
  createGameCharacter() {
    if (!this.canEdit) return;
    const character = GameCharacter.create(this.name, this.size, this.tableBackgroundImage().identifier);
    character.owner = PeerCursor.myCursor?.userId ?? '';
    if (PeerCursor.isMyselfGameMaster) character.disclosureMode = DisclosureMode.GameMaster;
    character.update();
  }
  /** Lays a 5x5 map mask on the table being viewed; nothing happens without one or without edit rights. */
  createGameTableMask() {
    if (!this.canEdit) return;
    const viewTable = this.tableSelecter.viewTable;
    if (!viewTable) return;
    const tableMask = GameTableMask.create(this.t('feature.character.generator.defaultMaskName'), 5, 5, 100);
    viewTable.appendChild(tableMask);
  }

  /** Builds whatever objects an XML save fragment describes, for a role that may edit the table. */
  createGameCharacterForXML(xml: string) {
    if (!this.canEdit) return;
    this.objectSerializer.parseXml(xml);
  }

  /**
   * Opens the image picker for the new character's picture.
   *
   * The choice comes back through the object-change file selection event, not the modal's result.
   */
  openModal() {
    this.modalService.open(FileSelecterComponent);
  }

  /** Opens the room panel that imports a character from an external character sheet service. */
  openImportCharacter() {
    this.roomPanels.open('characterImport', { left: 100, top: 100 });
  }
}
