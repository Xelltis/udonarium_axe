import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PieceDragGhostService } from '@axe/application/ui/piece-drag-ghost.service';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/** The piece carried out of a list, drawn beside the pointer above every panel. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ui-piece-drag-ghost',
  templateUrl: './piece-drag-ghost.component.html',
  imports: [SafePipe],
})
export class PieceDragGhostComponent {
  protected readonly ghost = inject(PieceDragGhostService);

  protected imageUrl(): string {
    return this.ghost.character()?.imageFile?.url ?? '';
  }
}
