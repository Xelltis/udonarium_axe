import { inject, Injectable } from '@angular/core';
import { ActiveChatTabService } from '@axe/application/chat/active-chat-tab.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { callRollDiceSymbol } from '@axe/core/event/domain-events';
import { diceRollLog, RolledDie } from '@axe/domain/dice/dice-roll-log';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

interface SecretRoll {
  die: DiceSymbol;
  result: RolledDie;
}

/**
 * Throwing the dice that stand on the table.
 *
 * A throw of several open dice is one throw, so it sounds once and reads as one line. The
 * line goes to the tab the thrower is reading, as a coin does: a die on the table is a die
 * like any other, and its result is of no use in a tab nobody is looking at.
 */
@Injectable({ providedIn: 'root' })
export class DiceRollService {
  private readonly activeChatTab = inject(ActiveChatTabService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly objectChange = inject(ObjectChangeService);

  /** Throws one die, or a handful together. Whatever cannot be seen stays as it was. */
  roll(dice: readonly DiceSymbol[]): RolledDie[] {
    const thrown = dice.filter((die) => die.isVisible);
    const skipped = dice.length - thrown.length;
    if (thrown.length < 1) {
      this.announceSkipped(skipped);
      return [];
    }

    const open: RolledDie[] = [];
    const secret: SecretRoll[] = [];
    const rolled = thrown.map<RolledDie>((die) => {
      callRollDiceSymbol(die.identifier);
      // The thrower watches their own die roll rather than waiting for the round trip.
      this.objectChange.notifyDiceRolled(die.identifier);
      const result = { name: die.name, face: die.diceRoll(), sides: die.faces.length };
      if (die.hasOwner) secret.push({ die, result });
      else open.push(result);
      return result;
    });
    SoundEffect.play(PresetSound.diceRoll1);

    this.announce(open);
    this.announceSecret(secret);
    this.announceSkipped(skipped);
    return rolled;
  }

  private announceSkipped(count: number): void {
    if (count < 1) return;

    const me = PeerCursor.myCursor;
    if (!me) return;
    const tab = this.activeChatTab.current() ?? this.chatMessageService.chatTabs[0];
    if (!tab) return;
    const text = encodeI18nMessage('feature.dice.message.notRolled', { count });
    this.chatMessageService.sendSystemMessageOnePlayer(tab, text, me.identifier, undefined, true);
  }

  private announce(rolled: readonly RolledDie[]): void {
    const text = this.describe(rolled);
    if (!text) return;

    const tab = this.activeChatTab.current();
    const roller = PeerCursor.myCursor?.userId ?? '';
    if (tab) this.chatMessageService.sendSystemMessageToTab(tab, text, undefined, roller);
    else this.chatMessageService.sendSystemMessage(text, undefined, roller);
  }

  /**
   * A die kept to its owner is thrown in secret, name and face alike.
   *
   * Both give the throw away: a die called 隠しダイス reads as one whoever sees the line, and
   * the face is the whole of what was kept back. The line goes as a secret, which the room
   * sees as a secret die and the thrower reads in full, to open later if they want to.
   */
  private announceSecret(rolls: readonly SecretRoll[]): void {
    const tab = this.activeChatTab.current();
    const roller = PeerCursor.myCursor?.userId ?? '';
    for (const { die, result } of rolls) {
      const text = this.describe([result]);
      if (!text) continue;
      const identifiers = [die.identifier];
      if (tab) this.chatMessageService.sendSecretSystemMessageToTab(tab, text, roller, undefined, identifiers);
      else this.chatMessageService.sendSecretSystemMessageToMainTab(text, roller, identifiers);
    }
  }

  private describe(rolled: readonly RolledDie[]): string | null {
    const log = diceRollLog(rolled);
    if (!log) return null;

    const who = PeerCursor.myCursor?.name ?? '';
    return log.count === 1
      ? encodeI18nMessage('feature.dice.message.rolled', { who, name: log.dice, face: log.results })
      : encodeI18nMessage(
          log.total === null ? 'feature.dice.message.rolledMany' : 'feature.dice.message.rolledManyTotal',
          {
            who,
            count: log.count,
            dice: log.dice,
            results: log.results,
            total: log.total ?? 0,
          }
        );
  }
}
