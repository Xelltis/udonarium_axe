import { inject, Injectable } from '@angular/core';
import { ActiveChatTabService } from '@axe/application/chat/active-chat-tab.service';
import { ChatLineEditService } from '@axe/application/chat/chat-line-edit.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
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
 * Throwing the dice that stand on the table, and who may read, turn, keep and show them.
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
  private readonly permission = inject(RolePermissionService);
  private readonly lineEdit = inject(ChatLineEditService);

  /**
   * Whether this seat may read a die's face and its name, as {@link DiceSymbol.isOpenTo} says: anyone
   * while nobody keeps it, and once a seat keeps it that seat and the game master.
   */
  readsFace(die: DiceSymbol): boolean {
    return die.isOpenTo(this.permission.canSeeHidden());
  }

  /** Whether the table shows this seat a die's name, as {@link DiceSymbol.showsNameTo} says. */
  showsName(die: DiceSymbol): boolean {
    return die.showsNameTo(this.permission.canSeeHidden());
  }

  /**
   * Whether this seat may turn a die, rolling it or setting its face: a seat that may change the table,
   * for a die nobody keeps or that it keeps. The game master reads, shows and keeps another seat's kept
   * die but does not throw it, as the kept-back line of such a throw would be the master's, which the
   * keeper could not open as they show the die.
   */
  canTurn(die: DiceSymbol): boolean {
    return this.permission.canEditTabletop() && (!die.hasOwner || die.isMine);
  }

  /**
   * Whether this seat may change a die short of turning it, hiding or showing its name and changing it
   * on its sheet: a seat that may change the table, for a die whose face it may read, the game master's
   * reading of another seat's kept die included.
   */
  canChange(die: DiceSymbol): boolean {
    return this.permission.canEditTabletop() && this.readsFace(die);
  }

  /** Whether this seat may show a kept die's face to everyone: the seat that keeps it, or the game master. */
  canReveal(die: DiceSymbol): boolean {
    if (!die.hasOwner || !this.permission.canEditTabletop()) return false;
    return die.isMine || this.permission.canSeeHidden();
  }

  /**
   * Whether this seat may keep a die's face to itself: one nobody keeps, or, for the game master, one
   * another seat keeps, as a die kept is that seat's own to open.
   */
  canKeep(die: DiceSymbol): boolean {
    if (PeerCursor.myUserId.length < 1 || !this.permission.canEditTabletop() || die.isMine) return false;
    return !die.hasOwner || this.permission.canSeeHidden();
  }

  /** Turns a die to one of its faces without rolling it. False, with nothing done, where this seat may not turn it. */
  setFace(die: DiceSymbol, face: string): boolean {
    if (!this.canTurn(die) || !die.faces.includes(face)) return false;
    die.face = face;
    return true;
  }

  /** Hides a die's name from the table or shows it. False, with nothing done, where this seat may not change it. */
  setNameHidden(die: DiceSymbol, hidden: boolean): boolean {
    if (!this.canChange(die)) return false;
    die.hideName = hidden;
    return true;
  }

  /**
   * Shows a kept die's face to everyone and plays the sound of it. Its latest throw kept back is
   * opened in the chat; where there is none to open, as for a face set by hand or a throw already
   * opened, a notice says the face it shows. False, with nothing done, where this seat may not show it.
   */
  reveal(die: DiceSymbol): boolean {
    if (!this.canReveal(die)) return false;
    die.owner = '';
    SoundEffect.play(PresetSound.unlock);
    if (this.lineEdit.discloseDieRolls(die.identifier) < 1) this.announceRevealed(die);
    return true;
  }

  /** Keeps a die's face to this seat alone and plays the sound of it. False, with nothing done, where this seat may not. */
  keep(die: DiceSymbol): boolean {
    if (!this.canKeep(die)) return false;
    die.owner = PeerCursor.myUserId;
    SoundEffect.play(PresetSound.lock);
    return true;
  }

  /** Throws one die, or a handful together. Whatever this seat may not turn stays as it was. */
  roll(dice: readonly DiceSymbol[]): RolledDie[] {
    const thrown = dice.filter((die) => this.canTurn(die));
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

  private announceRevealed(die: DiceSymbol): void {
    const name = die.name.trim();
    const message =
      name.length > 0
        ? encodeI18nMessage('feature.dice.log.reveal', { name, face: die.face })
        : encodeI18nMessage('feature.dice.log.revealNoName', { face: die.face });
    this.chatMessageService.sendSystemNotice('diceReveal', message);
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
