import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { peerFaceOf } from '@axe/domain/peer/peer-face';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/**
 * The room's other seats, one row each, to pick some of: who a vote is put to, who an alarm is set
 * for. A row shows the player, the character they last spoke as, and whether they have dropped out.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ui-peer-pick-list',
  templateUrl: './peer-pick-list.component.html',
  imports: [TextTooltipDirective, SafePipe],
  host: { class: 'contents' },
})
export class UiPeerPickListComponent {
  private readonly objectChange = inject(ObjectChangeService);

  /** The peer ids of the seats listed, in the order they are listed. */
  readonly peerIds = input.required<readonly string[]>();
  /** The peer ids picked, in the order they were picked. */
  readonly selected = model<readonly string[]>([]);
  /** What a row says where the seat has spoken as no character. */
  readonly noControlLabel = input('');
  /** What a row says of a seat that has dropped out. */
  readonly disconnectedLabel = input('');
  /** The name the rows' checkboxes share. */
  readonly checkboxName = input('peer_chk');

  /** The rows, followed as seats come and go and as their cursors change. */
  protected readonly rows = computed(() => {
    this.objectChange.networkVersion();
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    const picked = new Set(this.selected());
    return this.peerIds().map((peerId) => {
      const cursor = PeerCursor.findByPeerId(peerId);
      if (cursor) this.objectChange.versionOf(cursor.identifier)();
      return { peerId, picked: picked.has(peerId), ...peerFaceOf(peerId) };
    });
  });

  /** Picks the seat, or lets it go where it is picked, from a click on its row. */
  protected toggle(peerId: string): void {
    this.selected.update((selected) =>
      selected.includes(peerId) ? selected.filter((each) => each !== peerId) : [...selected, peerId]
    );
  }
}
