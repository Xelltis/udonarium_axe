import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { ThirdPersonService } from '@axe/application/tabletop/third-person.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { VisualNovelModeService } from '@axe/application/ui/visual-novel-mode.service';
import { isTypingTarget } from '@axe/core/input/typing-target';
import { firstPersonKeyDown } from '@axe/features/first-person/first-person-keys';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * What shows while the table's camera follows a piece from behind: which piece, the keys, and a way
 * to stop. The keys walk and turn the piece as they do looking out of it; the rest of the keys are
 * left to the table.
 */
@Component({
  selector: 'third-person-hud',
  templateUrl: './third-person-hud.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class ThirdPersonHudComponent {
  protected readonly thirdPerson = inject(ThirdPersonService);
  private readonly firstPerson = inject(FirstPersonService);
  private readonly modal = inject(ModalService);
  private readonly visualNovel = inject(VisualNovelModeService);
  private readonly movePlan = inject(MovePlannerService);

  protected readonly name = computed(() => this.thirdPerson.piece()?.name ?? '');

  /** Walks and turns the piece followed from the keys, and stops following on Escape. */
  onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const command = firstPersonKeyDown(event.code, {
      typing: isTypingTarget(event.target),
      composing: event.isComposing,
      chord: event.ctrlKey || event.metaKey || event.altKey,
      busy: this.modal.isShow || this.visualNovel.active() || this.movePlan.isPlanning(),
      shift: event.shiftKey,
      picking: false,
      forced: false,
      lattice: this.firstPerson.lattice(),
    });
    if (command?.kind === 'move') void this.thirdPerson.walk(command.move);
    else if (command?.kind === 'turn') void this.thirdPerson.turn(command.turn);
    else if (command?.kind === 'exit') this.thirdPerson.stop();
    else return;
    event.preventDefault();
  }
}
