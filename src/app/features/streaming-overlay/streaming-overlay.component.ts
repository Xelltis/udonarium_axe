import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import type { ChatMessage } from '@axe/domain/chat/chat-message';
import type { ChatTab } from '@axe/domain/chat/chat-tab';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { vnBodyOf } from '@axe/domain/visual-novel/vn-emote';
import {
  buildOverlayFeed,
  DEFAULT_OVERLAY_FEED_OPTIONS,
  type OverlaySource,
} from '@axe/features/streaming-overlay/streaming-overlay-feed';
import { turnIndicatorSignal } from '@axe/ui/turn/turn-indicator.signal';
import { TranslocoModule } from '@jsverse/transloco';

/** A beat that only drops the older lines, so nothing sticks while the table is quiet. */
const TICK_MS = 10_000;

/**
 * The overlay for a stream.
 *
 * Neither the board nor the panels: the recent exchanges and the turn alone, over nothing.
 *
 * It shows **the narrower of what is allowed**. The overlay goes somewhere that belongs
 * to nobody, so no private line, no hidden roll and no tab the role cannot see.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'streaming-overlay',
  templateUrl: './streaming-overlay.component.html',
  host: { class: 'pointer-events-none fixed inset-0 z-160 block' },
  imports: [TranslocoModule],
})
export class StreamingOverlayComponent {
  private readonly chat = inject(ChatMessageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly overlayMode = inject(OverlayModeService);
  private readonly t = inject(TRANSLATE_FN);

  private readonly tick = signal(0);

  protected readonly turn = turnIndicatorSignal();

  protected readonly feed = computed(() => {
    this.tick();
    this.objectChange.collectionOf('chat-tab')();
    this.objectChange.trackMyCursor();

    const role = this.viewerRole();
    const sources: OverlaySource[] = [];
    for (const tab of this.chat.chatTabs) {
      // Lines arrive as children of a tab, and without watching the version of the tab nothing notices.
      this.objectChange.versionOf(tab.identifier)();
      if (tab.isSystemTab || !canRoleViewTab(tab, role)) continue;
      for (const message of recentOf(tab)) sources.push(this.sourceOf(message));
    }
    sources.sort((a, b) => a.order - b.order);
    return buildOverlayFeed(sources, this.chat.getTime());
  });

  constructor() {
    const timer = setInterval(() => this.tick.update((value) => value + 1), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /**
   * What may be shown.
   *
   * Until the room is joined the role here stays the default, so the narrower of that and
   * the one the link asked for is taken; the wider would show a forbidden tab mid-join.
   */
  private viewerRole(): PeerRole {
    const current = PeerCursor.myRole;
    const requested = this.overlayMode.requestedRole;
    if (current === PeerRole.Guest || requested === PeerRole.Guest) return PeerRole.Guest;
    if (current === PeerRole.Player || requested === PeerRole.Player) return PeerRole.Player;
    return PeerRole.GameMaster;
  }

  private sourceOf(message: ChatMessage): OverlaySource {
    return {
      identifier: message.identifier,
      name: decodeI18nMessage(message.name, this.t),
      text: vnBodyOf(message.vnEmote, decodeI18nMessage(message.text, this.t)),
      timestamp: message.timestamp,
      order: message.index,
      color: message.messColor,
      isDice: message.isDicebot,
      isDirect: message.isDirect,
      isSecret: message.isSecret,
      isDisplayable: message.isDisplayable,
      isPseudoDeleted: message.isPseudoDeleted,
    };
  }
}

/** Only the last few are shown; copying and sorting them all wastes more the longer the session runs. */
function recentOf(tab: ChatTab): readonly ChatMessage[] {
  return tab.chatMessages.slice(-DEFAULT_OVERLAY_FEED_OPTIONS.limit);
}
