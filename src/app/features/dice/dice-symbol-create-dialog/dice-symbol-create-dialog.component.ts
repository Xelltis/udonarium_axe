import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  type DiceCreateDialogOption,
  type DiceCreateRequest,
  type DiceOwnerCandidate,
  getDiceMenuItems,
} from '@axe/application/tabletop/tabletop-action-helpers';
import { ModalService } from '@axe/application/ui/modal.service';
import { TranslocoModule } from '@jsverse/transloco';

/** As many as a handful thrown at once, which is as many as a row of them stays readable at. */
const DEFAULT_MAX_COUNT = 30;

@Component({
  selector: 'dice-symbol-create-dialog',
  templateUrl: './dice-symbol-create-dialog.component.html',
  host: { class: 'block text-ui-text' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
})
export class DiceSymbolCreateDialogComponent {
  private readonly modalService = inject(ModalService);

  readonly diceItems = getDiceMenuItems();
  private readonly option = this.readOption();

  typeIndex = this.option.typeIndex ?? 0;
  count = this.clampCount(this.option.defaultCount ?? 2);
  /** Empty for dice that belong to nobody, which is what a die made from the menu is. */
  ownerCharacterIdentifier = '';
  hiddenToOthers = false;

  /** The most dice that can be made at once, as the opener set it, or 30 when it set none. */
  get maxCount(): number {
    return this.option.maxCount ?? DEFAULT_MAX_COUNT;
  }

  /** The characters the dice can be given to; the owner picker is hidden when there are none. */
  get ownerCandidates(): readonly DiceOwnerCandidate[] {
    return this.option.ownerCandidates ?? [];
  }

  /**
   * Closes the dialog with the chosen dice when the form is submitted.
   *
   * The type and count are clamped to what is on offer, and an owner that is not among the
   * candidates is dropped so the dice belong to nobody.
   */
  confirm(): void {
    const request: DiceCreateRequest = {
      typeIndex: this.clampTypeIndex(this.typeIndex),
      count: this.clampCount(this.count),
      ownerCharacterIdentifier: this.knownOwner(this.ownerCharacterIdentifier),
      hiddenToOthers: this.hiddenToOthers === true,
    };
    this.modalService.resolve(request);
  }

  /** Closes the dialog without making any dice; the opener receives null. */
  cancel(): void {
    this.modalService.resolve(null);
  }

  private readOption(): DiceCreateDialogOption {
    const option = this.modalService.option as Partial<DiceCreateDialogOption> | undefined;
    const maxCount = Math.max(1, this.normalizePositiveInteger(option?.maxCount, DEFAULT_MAX_COUNT));
    return {
      typeIndex: option?.typeIndex == null ? undefined : this.normalizePositiveInteger(option.typeIndex, 0),
      defaultCount: option?.defaultCount == null ? undefined : this.normalizePositiveInteger(option.defaultCount, 2),
      maxCount,
      ownerCandidates: Array.isArray(option?.ownerCandidates) ? option.ownerCandidates : [],
    };
  }

  /** A piece that is no longer on the table is nobody, rather than a name the dice keep pointing at. */
  private knownOwner(identifier: string): string {
    return this.ownerCandidates.some((candidate) => candidate.identifier === identifier) ? identifier : '';
  }

  private clampTypeIndex(value: number): number {
    const index = this.normalizePositiveInteger(value, 0);
    return Math.min(this.diceItems.length - 1, Math.max(0, index));
  }

  private clampCount(value: number): number {
    return Math.min(this.maxCount, Math.max(1, this.normalizePositiveInteger(value, 1)));
  }

  private normalizePositiveInteger(value: unknown, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.floor(num);
  }
}
