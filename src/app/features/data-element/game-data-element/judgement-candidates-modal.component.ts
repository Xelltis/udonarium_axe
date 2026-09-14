import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { type SkillJudgementCandidate } from '@axe/domain/data/skill-table-judgement';
import { TranslocoModule } from '@jsverse/transloco';

export interface JudgeCandidatesState {
  clickedCellLabel: string;
  candidates: SkillJudgementCandidate[];
}

@Component({
  selector: 'judgement-candidates-modal',
  templateUrl: './judgement-candidates-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
})
export class JudgementCandidatesModalComponent {
  readonly state = input<JudgeCandidatesState | null>(null);
  readonly closed = output<void>();
  readonly sendToChat = output<SkillJudgementCandidate>();

  /** Tells the table to close the list, from the close button or a click on the backdrop. */
  onClose(): void {
    this.closed.emit();
  }

  /**
   * Hands the chosen candidate to the table to roll in chat, without the click reaching the
   * backdrop and closing the list first.
   */
  onSendToChat(candidate: SkillJudgementCandidate, event: Event): void {
    event.stopPropagation();
    this.sendToChat.emit(candidate);
  }
}
