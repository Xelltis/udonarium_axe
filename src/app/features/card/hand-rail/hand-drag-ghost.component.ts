import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HandDragService } from '@axe/features/card/hand-rail/hand-drag.service';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hand-drag-ghost',
  templateUrl: './hand-drag-ghost.component.html',
  imports: [SafePipe],
})
export class HandDragGhostComponent {
  protected readonly drag = inject(HandDragService);

  protected imageUrl(): string {
    return this.drag.card()?.frontImage?.url ?? '';
  }
}
