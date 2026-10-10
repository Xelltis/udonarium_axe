import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CoinFlipService } from '@axe/application/coin/coin-flip.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Coin, CoinFace } from '@axe/domain/coin/coin';
import { DataElement } from '@axe/domain/data/data-element';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-coin-sheet',
  templateUrl: './coin-sheet.component.html',
  host: { class: 'block box-border h-full overflow-y-auto p-3 text-ui-text bg-ui-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class CoinSheetComponent {
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly imageService = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly coinFlip = inject(CoinFlipService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _coin = signal<Coin | null>(null);

  /** The coin this sheet edits, handed in by whoever opens the panel. */
  get coin(): Coin | null {
    return this._coin();
  }
  set coin(value: Coin | null) {
    this._coin.set(value);
  }

  readonly faces = computed(() => {
    this.objectChange.fileVersion();
    const coin = this._coin();
    if (!coin) return [];
    this.objectChange.versionOf(coin.identifier)();
    return [
      { face: 'front' as CoinFace, imageUrl: this.imageService.getEmptyOr(coin.frontImage).url },
      { face: 'back' as CoinFace, imageUrl: this.imageService.getEmptyOr(coin.backImage).url },
    ].map((entry) => ({ ...entry, isCurrent: coin.face === entry.face }));
  });

  constructor() {
    this.objectChange.objectDeleted$.subscribe((e) => {
      const coin = this._coin();
      if (coin && coin.identifier === e.identifier) this.panelService.close();
    }, this.destroyRef);
  }

  /** The coin's name; setting it writes the name data element, which syncs to every peer. */
  get name(): string {
    return this._coin()?.name ?? '';
  }
  set name(value: string) {
    const coin = this._coin();
    const element = coin?.commonDataElement?.getFirstElementByName('name');
    if (element) element.value = value;
  }

  /** The coin's size on the table in cells; it reads 1 while there is no coin. */
  get size(): number {
    return this._coin()?.size ?? 1;
  }
  set size(value: number) {
    const coin = this._coin();
    if (coin) coin.size = value;
  }

  /** The translated name of a face, as the chat announcement words it. */
  faceLabel(face: CoinFace): string {
    return this.coinFlip.faceLabel(face);
  }

  /** Turns the coin to a face directly, without a flip and without announcing anything in chat. */
  selectFace(face: CoinFace) {
    const coin = this._coin();
    if (coin) coin.face = face;
  }

  /**
   * Flips the coin to a random face and announces the result in chat, as the flip in its context
   * menu does.
   */
  flip() {
    const coin = this._coin();
    if (coin) this.coinFlip.flip(coin);
  }

  /**
   * Lets the user pick a picture for a face; closing the picker without choosing leaves the face as
   * it was.
   */
  openFaceImageModal(face: CoinFace) {
    const coin = this._coin();
    if (!coin) return;
    this.modalService.open<string>(FileSelecterComponent).then((value) => {
      if (value == null) return;
      this.faceElement(coin, face)!.value = value;
    });
  }

  /** Takes the picture off a face, leaving it blank. */
  clearFaceImage(face: CoinFace) {
    const coin = this._coin();
    if (!coin) return;
    const element = this.faceElement(coin, face);
    if (element) element.value = '';
  }

  private faceElement(coin: Coin, face: CoinFace): DataElement | null {
    return (coin.imageDataElement?.getFirstElementByName(face) as DataElement | null) ?? null;
  }
}
