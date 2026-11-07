import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { LinkWatchService, SEEN_ASK_INTERVAL_MS } from '@axe/application/lobby/link-watch.service';
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

/** How long after asking again the server's last answer is weighed as it was, for a fresh one to come. */
export const RESUME_GRACE_MS = 2 * SEEN_ASK_INTERVAL_MS;

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
   * server, graded by how long its answers take; each of the others is graded by how long the server
   * has gone without hearing from them, or, while nobody looks and nothing is asked, had gone when it
   * last said.
   */
  protected readonly links = computed<PeerLinkView[]>(() => {
    this.objectChange.peerStatsVersion();
    this.objectChange.networkVersion();
    this.linkWatch.asked();
    const authority = Network.authorityPeerId;
    if (authority !== null) {
      const roundTripMs = Network.roundTripMs;
      const weighedAt = this.weighedAt();
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
            quality: silenceQualityOf(heardAt === null || weighedAt === null ? null : Math.max(0, weighedAt - heardAt)),
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

  /**
   * The time each seat's silence is weighed to: now while the server is asked; what it last said
   * while nobody looks; and just after asking again, what it last said, gone stale only once a fresh
   * answer has had RESUME_GRACE_MS to come, so that every seat does not read as gone meanwhile.
   */
  private weighedAt(): number | null {
    const answeredAt = Network.seenAnsweredAt;
    if (this.linkWatch.paused()) return answeredAt;
    const resumedAt = this.linkWatch.resumedAt();
    const now = Date.now();
    if (answeredAt === null || answeredAt >= resumedAt) return now;
    return answeredAt + Math.max(0, now - resumedAt - RESUME_GRACE_MS);
  }

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
