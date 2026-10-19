import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-connection-quality',
  templateUrl: './connection-quality.component.html',
  imports: [DraggableDirective, WidgetPlaceDirective, TranslocoModule],
})
export class ConnectionQualityComponent {
  protected readonly widgets = inject(WidgetVisibilityService);
  private readonly objectChange = inject(ObjectChangeService);

  protected readonly widgetName = WIDGET_CONNECTION_QUALITY;
  protected readonly fallback = (el: HTMLElement) => ({
    left: Math.max(8, window.innerWidth - el.offsetWidth - 8),
    top: 96,
  });

  /**
   * Each link this seat holds and how it is doing. On a room server the seat holds one, to the
   * server, which is up or down; the links between peers it would grade are not there.
   */
  protected readonly links = computed<PeerLinkView[]>(() => {
    this.objectChange.peerStatsVersion();
    this.objectChange.networkVersion();
    const authority = Network.authorityPeerId;
    if (authority !== null) {
      const quality = Network.isAuthorityOpen ? PeerLinkQuality.Good : PeerLinkQuality.Lost;
      return [{ peerId: authority, name: '', quality, ping: 0, isRelayed: false, isRoomServer: true }];
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
