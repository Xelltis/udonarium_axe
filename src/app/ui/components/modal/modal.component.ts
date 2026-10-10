import { ChangeDetectionStrategy, Component, inject, viewChild, ViewContainerRef } from '@angular/core';
import { ModalService } from '@axe/application/ui/modal.service';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';

@Component({
  imports: [TextTooltipDirective],
  selector: 'modal',
  templateUrl: './modal.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  modalService = inject(ModalService);

  /** The title shown in the modal's bar, set by whatever is shown inside it. */
  get title(): string {
    return this.modalService.title;
  }

  /** The tooltip on the modal's title, for a title too long to show whole. */
  get titleTooltip(): string {
    return this.modalService.titleTooltip;
  }

  /** Whether the modal was opened with `fitWidth`, so it is as wide as its content rather than a fixed width. */
  get isFitWidth(): boolean {
    const option = this.modalService.option;
    return option != null && typeof option === 'object' && (option as Record<string, unknown>)['fitWidth'] === true;
  }

  /** Whether the modal is turned a quarter either way, so its size limits swap axes. */
  get isSideways(): boolean {
    const degrees = this.modalService.rotationDegrees();
    return degrees === 90 || degrees === 270;
  }

  readonly content = viewChild.required('content', { read: ViewContainerRef });

  /** Closes the modal as `resolve` does when the dimmed backdrop itself is clicked. */
  clickBackground(event: MouseEvent) {
    if (event.target === event.currentTarget) this.resolve();
  }

  /** Closes the modal from its close button, resolving it with null. */
  resolve() {
    this.modalService.resolve(null);
  }

  /** Closes the modal by rejecting it, for a caller that treats that as a cancel. */
  reject() {
    this.modalService.reject();
  }
}
