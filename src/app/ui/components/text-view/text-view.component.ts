import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ModalContent, ModalService } from '@axe/application/ui/modal.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'text-view',
  templateUrl: './text-view.component.html',
  host: { class: 'block' },
})
export class TextViewComponent implements ModalContent {
  private readonly modalService = inject(ModalService);

  text: string = '';
  title: string = '';

  constructor() {
    const option = this.modalService.option as Record<string, unknown>;
    this.title = option?.title ? (option.title as string) : '';
    this.text = option?.text ? (option.text as string) : '';
  }

  /** The title it was opened with, which the frame it stands in shows. */
  get modalTitle(): string {
    return this.title;
  }
}
