import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DiceBotCatalogService } from '@axe/application/dice/dice-bot-catalog.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceTablePalette } from '@axe/domain/chat/chat-palette';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { DiceTable } from '@axe/domain/dice/dice-table';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'dice-table-setting',
  templateUrl: './dice-table-setting.component.html',
  host: { class: 'block h-full' },
  imports: [FormsModule, NgSelectComponent, NgOptionComponent, NgSelectWindowDirective, TranslocoModule],
})
export class DiceTableSettingComponent {
  private readonly modalService = inject(ModalService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly panelService = inject(PanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  readonly tableName = computed<string>(() => this.readSyncVar((t) => t.name));
  readonly tableDice = computed<string>(() => this.readSyncVar((t) => t.dice));
  readonly tableCommand = computed<string>(() => this.readSyncVar((t) => t.command));
  readonly gameType = computed<string>(() =>
    this.readSyncVar((t) => {
      const palette = this.findDiceTablePalette(t);
      if (palette) this.objectChange.versionOf(palette.identifier)();
      return palette?.dicebot ?? '';
    })
  );

  private readSyncVar<T>(read: (table: DiceTable) => T): T | '' {
    const table = this.selectedTable;
    if (!this.isEditable || !table) return '';
    this.objectChange.versionOf(table.identifier)();
    return read(table);
  }

  setTableName(value: string): void {
    const table = this.selectedTable;
    if (this.isWritable && table) table.name = value;
  }

  setTableDice(value: string): void {
    const table = this.selectedTable;
    if (this.isWritable && table) table.dice = value;
  }

  setTableCommand(value: string): void {
    const table = this.selectedTable;
    if (this.isWritable && table) table.command = value;
  }

  setGameType(value: string): void {
    const table = this.selectedTable;
    if (!this.isWritable || !table) return;
    const palette = this.findDiceTablePalette(table);
    if (palette) palette.dicebot = value;
  }

  get tableText(): string {
    const table = this.selectedTable;
    return this.isEditable && table ? table.text : '';
  }
  set tableText(tableText: string) {
    const table = this.selectedTable;
    if (this.isWritable && table) table.text = tableText + '';
  }

  readonly palettes = computed<readonly string[]>(() => {
    const table = this.selectedTable;
    if (!this.isEditable || !table) return [];
    this.objectChange.versionOf(table.identifier)();
    const palette = this.findDiceTablePalette(table);
    if (!palette) return [];
    this.objectChange.versionOf(palette.identifier)();
    return palette.getPalette();
  });

  private findDiceTablePalette(table: DiceTable | null): DiceTablePalette | null {
    if (!table) return null;
    for (const child of table.children) {
      if (child instanceof DiceTablePalette) return child;
    }
    return null;
  }

  loadDiceBot(gameType: string) {
    DiceBot.getHelpMessage(gameType).then((_help) => {});
  }

  private readonly diceBotCatalog = inject(DiceBotCatalogService);

  get diceBotInfos() {
    return this.diceBotCatalog.infos();
  }

  isEdit = signal(false);
  private readonly _selectedTable = signal<DiceTable | null>(null);
  get selectedTable(): DiceTable | null {
    return this._selectedTable();
  }
  set selectedTable(value: DiceTable | null) {
    this._selectedTable.set(value);
  }
  readonly editPalette = signal('');

  get isEmpty(): boolean {
    return false;
  }

  get isSelected(): boolean {
    return this.selectedTable !== null;
  }

  get isDeleted(): boolean {
    if (!this.selectedTable) return true;
    return this.objectStore.get<DiceTable>(this.selectedTable.identifier) == null;
  }

  get isEditable(): boolean {
    return !this.isEmpty && this.isSelected && !this.isDeleted;
  }

  /**
   * Whether the tables are this reader's to change.
   *
   * A dice table is kept with the room and answers for everybody who rolls on it, so making
   * one, rewriting one or throwing one away is a change to what the table has. A seat that is
   * only watching reads them and changes none.
   */
  get canEditTables(): boolean {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  }

  get isWritable(): boolean {
    return this.isEditable && this.canEditTables;
  }

  readonly isSaving = signal(false);
  readonly progressPercent = signal(0);

  constructor() {
    queueMicrotask(
      () => (this.modalService.title = this.panelService.title = this.t('feature.dice.tableSetting.title'))
    );
  }

  selectDiceTable(identifier: string) {
    this._selectedTable.set(this.objectStore.get<DiceTable>(identifier));
  }

  getDiceTables(): DiceTable[] {
    return this.objectStore.getObjects(DiceTable);
  }

  createDiceTable() {
    if (!this.canEditTables) return;
    const diceTable = DiceTable.create();
    this.selectDiceTable(diceTable.identifier);
  }

  async save() {
    if (!this.selectedTable) return;
    this.isSaving.set(true);
    this.progressPercent.set(0);

    const fileName: string = 'dice_table_' + this.selectedTable.name;

    await this.saveDataService.saveGameObjectAsync(this.selectedTable, fileName, (percent) => {
      this.progressPercent.set(percent);
    });

    setTimeout(() => {
      this.isSaving.set(false);
      this.progressPercent.set(0);
    }, 500);
  }

  delete() {
    if (!this.canEditTables) return;
    if (!this.isEmpty && this.selectedTable) {
      this.selectedTable.destroy();
    }
  }

  toggleEditMode() {
    if (!this.canEditTables) return;
    this.isEdit.update((v) => !v);
    const table = this.selectedTable;
    if (!table) return;

    const palette = this.findDiceTablePalette(table);
    if (!palette) return;

    if (this.isEdit()) {
      this.editPalette.set(palette.value + '');
    } else {
      palette.setPalette(this.editPalette());
    }
  }

  onSelectDiceTable(event: Event): void {
    this.selectDiceTable((event.target as HTMLInputElement).value);
  }
}
