import { Injectable, signal } from '@angular/core';

/**
 * The event last chosen in the replay list, which the video preview goes to.
 *
 * Choosing rows to edit them moves nothing on the table, so the preview cannot follow the playback
 * cursor alone; the list says here which row it was.
 */
@Injectable({ providedIn: 'root' })
export class ReplayFocusService {
  readonly seq = signal<number | null>(null);
}
