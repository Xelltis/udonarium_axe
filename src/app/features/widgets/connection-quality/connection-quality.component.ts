import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { LinkWatchService } from '@axe/application/lobby/link-watch.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { WIDGET_CONNECTION_QUALITY } from '@axe/application/ui/widget-place';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { Network } from '@axe/core/index';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  isRelayedLink,
  linkQualityColorClass,
  linkQualityIcon,
  linkQualityLabelKey,
  linkQualityOf,
  PeerLinkQuality,
  roundTripQualityOf,
  silenceQualityOf,
  worstLinkQuality,
} from '@axe/domain/peer/peer-link-quality';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import { TranslocoModule } from '@jsverse/transloco';

export interface PeerLinkView {
  peerId: string;
  name: string;
  quality: PeerLinkQuality;
  ping: number;
  isRelayed: boolean;
  /** Whether this is the link to the room server, which is named by the page rather than a peer. */
  isRoomServer?: boolean;
  /**
   * When the room server last heard from this member, by this clock, for a member of a room on one;
   * null before the server has said.
   */
  heardAt?: number | null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-connection-quality',
  templateUrl: './connection-quality.component.html',
  imports: [DatePipe, DraggableDirective, WidgetPlaceDirective, TranslocoModule],
})
export class ConnectionQualityComponent {
  protected readonly widgets = inject(WidgetVisibilityService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly linkWatch = inject(LinkWatchService);

  protected readonly widgetName = WIDGET_CONNECTION_QUALITY;
  protected readonly fallback = (el: HTMLElement) => ({
    left: Math.max(8, window.innerWidth - el.offsetWidth - 8),
    top: 96,
  });

  constructor() {
    effect((onCleanup) => {
      if (this.widgets.connectionQuality()) onCleanup(this.linkWatch.watch());
    });
  }

  /**
   * Each link this seat holds and how it is doing. On a room server the seat holds one, to the
   * server, graded by how long its answers take; each of the others is graded by how long ago the
   * server last heard from them.
   */
  protected readonly links = computed<PeerLinkView[]>(() => {
    this.objectChange.peerStatsVersion();
    this.objectChange.networkVersion();
    this.linkWatch.asked();
    const authority = Network.authorityPeerId;
    if (authority !== null) {
      const roundTripMs = Network.roundTripMs;
      const now = Date.now();
      return [
        {
          peerId: authority,
          name: '',
          quality: roundTripQualityOf(roundTripMs, Network.isAuthorityOpen),
          ping: Math.round(roundTripMs),
          isRelayed: false,
          isRoomServer: true,
        },
        ...Network.peerContexts.map((peer) => {
          const heardAt = Network.heardAt(peer.peerId);
          return {
            peerId: peer.peerId,
            name: PeerCursor.findByPeerId(peer.peerId)?.name || peer.peerId.slice(0, 6),
            quality: silenceQualityOf(heardAt === null ? null : Math.max(0, now - heardAt)),
            ping: 0,
            isRelayed: false,
            heardAt,
          };
        }),
      ];
    }
    return Network.peerContexts.map((peer) => ({
      peerId: peer.peerId,
      name: PeerCursor.findByPeerId(peer.peerId)?.name || peer.peerId.slice(0, 6),
      quality: linkQualityOf(peer.session, peer.isOpen),
      ping: Math.round(peer.session.ping),
      isRelayed: isRelayedLink(peer.session),
    }));
  });

  protected readonly worst = computed(() => worstLinkQuality(this.links().map((link) => link.quality)));

  protected readonly hasRelayedLink = computed(() => this.links().some((link) => link.isRelayed));

  protected readonly icon = computed(() => linkQualityIcon(this.worst()));
  protected readonly colorClass = computed(() => linkQualityColorClass(this.worst()));
  protected readonly labelKey = computed(() => linkQualityLabelKey(this.worst()));

  protected readonly qualityIcon = linkQualityIcon;
  protected readonly qualityColorClass = linkQualityColorClass;

  protected close(): void {
    this.widgets.connectionQuality.set(false);
  }
}
