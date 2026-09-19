import { computed, inject, Injectable, signal, untracked } from '@angular/core';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';

/**
 * The event last chosen in the replay list, which the video preview goes to.
 *
 * Choosing rows to edit them moves nothing on the table, so the preview cannot follow the playback
 * cursor alone; the list says here which row it was.
 */
@Injectable({ providedIn: 'root' })
export class ReplayFocusService {
  private readonly playback = inject(ReplayPlaybackService);
  private readonly editor = inject(ReplayEditorService);
  private readonly chosen = signal<{ seq: number; scope: string } | null>(null);

  /**
   * The row chosen last, while it still means the moment it meant when chosen.
   *
   * Null once another recording opens, editing starts or ends (a save numbers the events afresh),
   * or the playback cursor moves on, so the preview follows the cursor again. Choosing the same row
   * a second time counts as news, so the preview goes back to it.
   */
  readonly seq = computed(
    () => {
      const chosen = this.chosen();
      return chosen && chosen.scope === this.scope() ? chosen.seq : null;
    },
    { equal: () => false }
  );

  /** Chooses a row for the preview to go to. */
  choose(seq: number): void {
    this.chosen.set({ seq, scope: untracked(() => this.scope()) });
  }

  private scope(): string {
    return `${this.playback.recordingId()}:${this.editor.isEditing()}:${this.playback.cursor()}`;
  }
}
