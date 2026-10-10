import { inject, Injectable } from '@angular/core';
import { ActiveChatTabService } from '@axe/application/chat/active-chat-tab.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { callFlipCoin } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Coin, CoinFace, pickCoinFace } from '@axe/domain/coin/coin';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

const RESULT_ANNOUNCE_DELAY_MS = 900;

@Injectable({ providedIn: 'root' })
export class CoinFlipService {
  private readonly activeChatTab = inject(ActiveChatTabService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * Flips a coin to a random face, sets it spinning for everyone and brings it to the top, then
   * returns the face.
   *
   * The result is announced in the chat tab you are reading after the spin, unless the coin has
   * been removed by then.
   */
  flip(coin: Coin): CoinFace {
    const face = pickCoinFace();

    callFlipCoin(coin.identifier, face);
    this.objectChange.notifyCoinFlipped(coin.identifier, face);
    SoundEffect.play(PresetSound.coinFlip);

    coin.face = face;
    coin.toTopmost();

    const text = this.t('feature.coin.message.flipped', {
      who: PeerCursor.myCursor?.name ?? '',
      name: coin.name,
      face: this.faceLabel(face),
    });
    // Heads or tails is a two-sided die, so it lands in the tab the thrower is reading.
    const tab = this.activeChatTab.current();
    const flipper = PeerCursor.myCursor?.userId ?? '';
    setTimeout(() => {
      if (!this.objectStore.get(coin.identifier)) return;
      if (tab) this.chatMessageService.sendSystemMessageToTab(tab, text, undefined, flipper);
      else this.chatMessageService.sendSystemMessage(text, undefined, flipper);
    }, RESULT_ANNOUNCE_DELAY_MS);
    return face;
  }

  /** The translated name of a coin face, for the flip announcement and the coin sheet. */
  faceLabel(face: CoinFace): string {
    return this.t(face === 'front' ? 'feature.coin.face.front' : 'feature.coin.face.back');
  }
}
