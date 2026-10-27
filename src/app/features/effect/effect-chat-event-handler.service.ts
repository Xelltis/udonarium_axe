import { DestroyRef, inject, Injectable } from '@angular/core';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { resourceEditMessage$ } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { hasBattleChatToken, parseEffectChatToken } from '@axe/domain/effect/effect-chat-token';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

/**
 * Fires an effect from a token in the body of a chat line.
 *
 * Only the sender fires it. The cast service hands it to everybody, so firing it at the
 * receiving end as well would play it once per player.
 *
 * It aims at whatever the resource change aims at, so one line covers the roll, the damage and the effect.
 * A line that also carries the battle stage's token plays its effect on the stage instead.
 */
@Injectable({ providedIn: 'root' })
export class EffectChatEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly library = inject(EffectLibraryService);
  private readonly castService = inject(EffectCastService);

  constructor() {
    resourceEditMessage$.subscribe((event) => {
      const message = this.objectStore.get<ChatMessage>(event.messageIdentifier);
      if (!(message instanceof ChatMessage) || !message.isSendFromSelf || message.isSystem) return;

      // A line played on the battle stage carries its effect there instead.
      if (hasBattleChatToken(message.text)) return;
      const token = parseEffectChatToken(message.text);
      if (!token) return;

      const preset = this.library.findByName(token.name);
      if (!preset) return;

      const targets = this.resolveTargets(preset, event.messageTargetContext);
      if (targets.length < 1) return;

      this.castService.fire(preset, targets, this.casterOf(message));
    }, this.destroyRef);
  }

  private resolveTargets(preset: EffectPreset, context: unknown[] | null): GameCharacter[] {
    const targeted = (context ?? [])
      .map((entry) => (entry as ChatMessageTargetContext).object)
      .filter((object): object is GameCharacter => object instanceof GameCharacter);

    const targets = targeted.length > 0 ? targeted : this.castService.candidateTargets();
    return targets.slice(0, preset.targetLimit);
  }

  /** It is cast by the piece that spoke, not by whatever is selected. */
  private casterOf(message: ChatMessage): GameCharacter | null {
    const character = this.objectStore.get<GameCharacter>(message.sendFrom);
    return character instanceof GameCharacter ? character : null;
  }
}
