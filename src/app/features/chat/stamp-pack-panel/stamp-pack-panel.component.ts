import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { StampPack } from '@axe/domain/chat/stamp-pack';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The room's own sets of stamps, to make, name and fill from the room's pictures or from files.
 *
 * Only somebody who may change the table changes anything here; anybody else is shown the sets as
 * they are.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'stamp-pack-panel',
  templateUrl: './stamp-pack-panel.component.html',
  host: { class: 'text-ui-text flex h-full flex-col gap-2 p-3 text-[13px]' },
  imports: [StampComponent, TranslocoModule],
})
export class StampPackPanelComponent {
  private readonly packService = inject(StampPackService);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly confirm = inject(ConfirmService);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly packs = this.packService.packs;
  protected readonly canManage = computed(() => this.packService.canManage);
  private readonly chosenIdentifier = signal('');

  /** The set being looked at: the one chosen, or the first while none is. */
  protected readonly chosen = computed(() => {
    const packs = this.packs();
    return packs.find((pack) => pack.identifier === this.chosenIdentifier()) ?? packs[0] ?? null;
  });

  /** What the panel has to say about the last thing tried, empty when nothing. */
  protected readonly notice = signal('');

  constructor() {
    queueMicrotask(() => (this.panelService.title = this.t('feature.chat.stampPack.title')));
  }

  protected choose(identifier: string): void {
    this.chosenIdentifier.set(identifier);
  }

  /** Makes a new set and turns to it. */
  protected createPack(): void {
    const pack = this.packService.create(this.t('feature.chat.stampPack.newPackName'));
    if (pack) this.chosenIdentifier.set(pack.identifier);
  }

  protected renamePack(name: string): void {
    const pack = this.chosenPack();
    if (pack) this.packService.rename(pack, name);
  }

  /** Takes the set away once that is confirmed; its pictures stay in the room. */
  protected async removePack(): Promise<void> {
    const pack = this.chosenPack();
    if (!pack) return;
    if (!(await this.confirm.ask(this.t('feature.chat.stampPack.removePackConfirm', { name: pack.name })))) return;
    this.packService.remove(pack);
    this.chosenIdentifier.set('');
  }

  /** Adds a picture from the room, picked from the room's pictures. */
  protected async addFromRoom(): Promise<void> {
    const pack = this.chosenPack();
    if (!pack) return;
    const identifier = await this.modalService.open<string>(FileSelecterComponent);
    if (!identifier) return;
    const image = ImageStorage.instance.get(identifier);
    if (!image) return;
    this.report(this.packService.addImages(pack, [{ identifier: image.identifier, name: image.name }]), []);
  }

  /** Adds pictures from files: they go into the room's pictures first, as any picture loaded does. */
  protected async addFromFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const pack = this.chosenPack();
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (!pack || files.length < 1) return;
    const { images, oversized } = await this.fileArchiver.loadImages(files);
    const added = this.packService.addImages(
      pack,
      images.map((image) => ({ identifier: image.identifier, name: image.name }))
    );
    this.report(added, oversized);
  }

  protected renameStamp(imageIdentifier: string, name: string): void {
    const stamp = this.chosenPack()?.stamps.find((each) => each.imageIdentifier === imageIdentifier);
    if (stamp) this.packService.renameStamp(stamp.element, name);
  }

  protected removeStamp(imageIdentifier: string): void {
    const stamp = this.chosenPack()?.stamps.find((each) => each.imageIdentifier === imageIdentifier);
    if (stamp) this.packService.removeStamp(stamp.element);
  }

  private chosenPack(): StampPack | null {
    const chosen = this.chosen();
    return chosen ? this.packService.find(chosen.identifier) : null;
  }

  private report(added: number, oversized: readonly string[]): void {
    if (oversized.length > 0) {
      this.notice.set(this.t('feature.chat.stampPack.tooLarge', { names: oversized.join(', ') }));
    } else if (added < 1) {
      this.notice.set(this.t('feature.chat.stampPack.alreadyIn'));
    } else {
      this.notice.set('');
    }
  }
}
