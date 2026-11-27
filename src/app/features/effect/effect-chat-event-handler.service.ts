import { DestroyRef, inject, Injectable } from '@angular/core';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ModelActsService } from '@axe/application/tabletop/model-acts.service';
import { resourceEditMessage$ } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { chatLineBout } from '@axe/domain/battle/battle-chat-line';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { lineAudienceOf } from '@axe/domain/chat/line-audience';
import { motionsAskedIn, parseEffectChatToken } from '@axe/domain/effect/effect-chat-token';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

/**
 * Fires an effect from a token in the body of a chat line.
 *
 * Only the sender fires it. The cast service hands it to everybody, so firing it at the
 * receiving end as well would play it once per player. A guest, who shows nothing on anybody's
 * table, fires none: the line goes out as chat and nothing more.
 *
 * It aims at whatever the resource change aims at, so one line covers the roll, the damage and the effect.
 * A line the battle stage plays, by its token, plays its effect on the stage instead.
 *
 * A token that asks for a motion, as `《動き:Wave》`, has the model of the piece that spoke play it
 * on every table, whatever else the line does; a line asks for one motion, its first.
 *
 * A line not every seat may read, as a whisper or a line in a tab for the game master alone, plays
 * its effect and its motion on the sender's screen alone, so that the table shows nobody else what
 * they were not told (see `lineAudienceOf`).
 */
@Injectable({ providedIn: 'root' })
export class EffectChatEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly library = inject(EffectLibraryService);
  private readonly castService = inject(EffectCastService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly modelActs = inject(ModelActsService);

  constructor() {
    resourceEditMessage$.subscribe((event) => {
      const message = this.objectStore.get<ChatMessage>(event.messageIdentifier);
      if (!(message instanceof ChatMessage) || !message.isSendFromSelf || message.isSystem) return;
      if (!this.rolePermission.canEditTabletop()) return;

      // A line played on the battle stage carries its effect there instead; one the stage does not
      // take, from a speaker who is no piece or with nobody to strike, plays its effect as ever.
      const aimed = (event.messageTargetContext ?? []).map((entry) => (entry as ChatMessageTargetContext).object);
      const sender = this.objectStore.get(message.sendFrom);
      const [motion] = motionsAskedIn(message.text);
      const here = lineAudienceOf(message) !== 'everyone';
      if (motion !== undefined && sender instanceof GameCharacter) {
        if (here) this.modelActs.play(sender.identifier, motion);
        else this.modelActs.playForAll(sender.identifier, motion);
      }
      if (chatLineBout(message.text, sender, aimed, () => this.castService.candidateTargets())) return;
      const token = parseEffectChatToken(message.text);
      if (!token) return;

      const preset = this.library.findByName(token.name);
      if (!preset) return;

      const targets = this.resolveTargets(preset, event.messageTargetContext);
      if (targets.length < 1) return;

      if (here) this.castService.playHere(preset, targets, this.casterOf(message));
      else this.castService.fire(preset, targets, this.casterOf(message));
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
