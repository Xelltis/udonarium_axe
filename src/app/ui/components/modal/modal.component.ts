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

  get title(): string {
    return this.modalService.title;
  }

  get titleTooltip(): string {
    return this.modalService.titleTooltip;
  }

  get isFitWidth(): boolean {
    const option = this.modalService.option;
    return option != null && typeof option === 'object' && (option as Record<string, unknown>)['fitWidth'] === true;
  }

  get isSideways(): boolean {
    const degrees = this.modalService.rotationDegrees();
    return degrees === 90 || degrees === 270;
  }

  readonly content = viewChild.required('content', { read: ViewContainerRef });

  clickBackground(event: MouseEvent) {
    if (event.target === event.currentTarget) this.resolve();
  }

  resolve() {
    this.modalService.resolve(null);
  }

  reject() {
    this.modalService.reject();
  }
}
