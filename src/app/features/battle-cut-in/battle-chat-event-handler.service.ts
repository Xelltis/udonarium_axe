import { DestroyRef, inject, Injectable } from '@angular/core';
import { BattleLaunchLoaderService } from '@axe/application/battle/battle-launch-loader.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { resourceEditMessage$ } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { chatLineBout, lineChangesResources, lineIsSecret } from '@axe/domain/battle/battle-chat-line';
import { takeBattle } from '@axe/domain/battle/battle-take';
import { ChatMessage, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { parseEffectChatToken } from '@axe/domain/effect/effect-chat-token';

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

      const bout = chatLineBout(
        message.text,
        this.objectStore.get(message.sendFrom),
        (event.messageTargetContext ?? []).map((entry) => (entry as ChatMessageTargetContext).object),
        () => this.castService.candidateTargets()
      );
      if (!bout) return;

      // Read before anything moves: the dice bot works the numbers out after this has heard the line.
      const take = takeBattle({
        ...bout,
        effectName: parseEffectChatToken(message.text)?.name,
        secret: lineIsSecret(message.text),
      });
      const waits = lineChangesResources(message.text, bout);
      void this.launcher.load().then((launch) => {
        if (waits) void launch?.finishAfterChange(take);
        else launch?.finish(take);
      });
    }, this.destroyRef);
  }
}
