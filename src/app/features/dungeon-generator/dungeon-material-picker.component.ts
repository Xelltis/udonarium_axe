import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DungeonMaterial } from '@axe/application/tabletop/dungeon-build.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'dungeon-material-picker',
  templateUrl: './dungeon-material-picker.component.html',
  imports: [SafePipe, TranslocoModule],
})
export class DungeonMaterialPickerComponent {
  private readonly modalService = inject(ModalService);
  private readonly imageStorage = inject(ImageStorage);

  readonly ids = input.required<readonly string[]>();
  readonly urls = input.required<Record<string, string>>();
  readonly value = input.required<DungeonMaterial>();
  readonly changed = output<DungeonMaterial>();

  protected readonly chosenTexture = computed(() => {
    const value = this.value();
    return value.kind === 'texture' ? value.id : '';
  });

  protected readonly libraryUrl = computed(() => {
    const value = this.value();
    if (value.kind !== 'library') return '';
    return this.imageStorage.get(value.identifier)?.url ?? '';
  });

  protected choose(id: string): void {
    this.changed.emit({ kind: 'texture', id });
  }

  protected chooseFromLibrary(): void {
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((identifier) => {
      if (!identifier) return;
      this.changed.emit({ kind: 'library', identifier });
    });
  }
}
