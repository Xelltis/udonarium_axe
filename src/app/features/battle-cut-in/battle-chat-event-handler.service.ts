import { DestroyRef, inject, Injectable } from '@angular/core';
import { BattleLaunchLoaderService } from '@axe/application/battle/battle-launch-loader.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { resourceEditMessage$ } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { lineChangesResources, lineIsSecret } from '@axe/domain/battle/battle-chat-line';
import { takeBattle } from '@axe/domain/battle/battle-take';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { hasBattleChatToken, parseEffectChatToken } from '@axe/domain/effect/effect-chat-token';

/**
 * Plays a chat line carrying the battle stage's token, `《vs》`, as an exchange on the stage.
 *
 * The piece that spoke strikes, and those the line aims at, as `t:` aims, are struck. An effect
 * named in the same line is the blow. A line that moves numbers waits for them to move, so the
 * stage shows the bars falling by what the dice said. Only the sender plays it, as the stage is
 * sent to everybody.
 */
@Injectable({ providedIn: 'root' })
export class BattleChatEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly launcher = inject(BattleLaunchLoaderService);
  private readonly castService = inject(EffectCastService);

  constructor() {
    resourceEditMessage$.subscribe((event) => {
      const message = this.objectStore.get<ChatMessage>(event.messageIdentifier);
      if (!(message instanceof ChatMessage) || !message.isSendFromSelf || message.isSystem) return;
      if (!hasBattleChatToken(message.text)) return;

      const attacker = this.objectStore.get<GameCharacter>(message.sendFrom);
      if (!(attacker instanceof GameCharacter)) return;
      const defenders = this.targetsOf(event.messageTargetContext, attacker);
      if (defenders.length < 1) return;

      // Read before anything moves: the dice bot works the numbers out after this has heard the line.
      const take = takeBattle({
        attacker,
        defenders,
        effectName: parseEffectChatToken(message.text)?.name,
        secret: lineIsSecret(message.text),
      });
      const waits = lineChangesResources(message.text);
      void this.launcher.load().then((launch) => {
        if (waits) void launch?.finishAfterChange(take);
        else launch?.finish(take);
      });
    }, this.destroyRef);
  }

  /** Those the line aims at, else those picked out on the table, never the one speaking. */
  private targetsOf(context: unknown[] | null, attacker: GameCharacter): GameCharacter[] {
    const targeted = (context ?? [])
      .map((entry) => (entry as ChatMessageTargetContext).object)
      .filter((object): object is GameCharacter => object instanceof GameCharacter);
    const targets = targeted.length > 0 ? targeted : this.castService.candidateTargets();
    return targets.filter((target) => target.identifier !== attacker.identifier);
  }
}
