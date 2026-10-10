import { DestroyRef, inject, Injectable } from '@angular/core';
import { callDiceThrow, diceRolled$ } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { throwPlanOf } from '@axe/domain/dice/dice-3d/dice-throw-plan';
import { Config } from '@axe/domain/peer/config';

/**
 * Has the dice of a roll made here thrown, when the room shows rolls tumbling.
 *
 * Only the device that rolled tells the room, so a roll is thrown once however many devices see
 * the line arrive, and only as it is made, so a line loaded with a room is never thrown. A secret
 * roll is thrown here alone.
 */
@Injectable({ providedIn: 'root' })
export class DiceThrowEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);

  constructor() {
    diceRolled$.subscribe((event) => {
      const answer = this.objectStore.get<ChatMessage>(event.resultMessageIdentifier);
      if (!(answer instanceof ChatMessage) || !answer.isSendFromSelf) return;
      const config = this.objectStore.get<Config>('Config') ?? Config.instance;
      if (config.diceStage === 'off') return;
      if (throwPlanOf(answer.rollDetail).dice.length < 1) return;
      // The answer does not say which piece spoke; the line it answers does.
      const line = this.objectStore.get<ChatMessage>(event.sourceMessageIdentifier);
      const speakerIdentifier = line instanceof ChatMessage ? line.sendFrom : '';
      callDiceThrow(
        { messageIdentifier: answer.identifier, speakerIdentifier },
        answer.isSecret ? 'here' : 'everywhere'
      );
    }, this.destroyRef);
  }
}
