import { inject, Injectable } from '@angular/core';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { resourceCatalogOf } from '@axe/domain/character/resource-catalog';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { diceCommandExamples } from '@axe/domain/dice/dice-roll-line';
import { CutIn } from '@axe/domain/media/cut-in';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import type { ChatCompletionWords } from '@axe/features/chat/chat-editor/chat-editor-complete';
import type { ChatSyntaxMenuSource } from '@axe/features/chat/chat-input/chat-syntax-context-menu';

/**
 * What a speaker and the room offer to be written in chat, gathered for the syntax button and for
 * the names the editor offers as a line is written.
 */
@Injectable({ providedIn: 'root' })
export class ChatSyntaxSourceService {
  private readonly objectStore = inject(ObjectStore);
  private readonly imageStorage = inject(ImageStorage);
  private readonly effectLibrary = inject(EffectLibraryService);
  private readonly language = inject(LanguageService);

  /**
   * What the speaker and the room offer. A game system not loaded yet offers no commands, and is
   * fetched for the next time.
   */
  sourceFor(sendFrom: string, gameType: string): ChatSyntaxMenuSource {
    const speaker = this.speakerOf(sendFrom);
    const system = DiceBot.loadedGameSystem(gameType);
    if (!system) void DiceBot.loadGameSystemAsync(gameType);
    return {
      language: this.language.currentLang(),
      statuses: speaker ? resourceCatalogOf([speaker]) : [],
      variables: speaker?.chatPalette?.paletteVariables.map((variable) => variable.name) ?? [],
      portraits: this.portraitsOf(speaker),
      effects: this.effectLibrary
        .presets()
        .filter((preset) => !preset.gmOnly || PeerCursor.isMyselfGameMaster)
        .map((preset) => preset.name.trim())
        .filter((name) => name.length > 0),
      cutIns: this.objectStore
        .getObjects<CutIn>(CutIn)
        .filter((cutIn) => cutIn.chatActivate)
        .map((cutIn) => cutIn.name),
      diceExamples: system && !DiceBot.isUnreachable(system) ? diceCommandExamples(system) : [],
      isGameMaster: PeerCursor.isMyselfGameMaster,
    };
  }

  /** The names the editor offers as a line is written, the speaker's buffs among them. */
  completionWordsFor(sendFrom: string, gameType: string): ChatCompletionWords {
    const source = this.sourceFor(sendFrom, gameType);
    return {
      statuses: source.statuses.map((status) => status.name),
      variables: source.variables,
      portraits: source.portraits,
      effects: source.effects,
      buffs:
        this.speakerOf(sendFrom)
          ?.buffs.list()
          .map((buff) => buff.name) ?? [],
      diceExamples: source.diceExamples,
    };
  }

  private speakerOf(sendFrom: string): GameCharacter | null {
    const found = this.objectStore.get(sendFrom);
    return found instanceof GameCharacter ? found : null;
  }

  private portraitsOf(speaker: GameCharacter | null): string[] {
    const children = speaker?.imageDataElement?.children ?? [];
    return children
      .filter((child): child is DataElement => child instanceof DataElement)
      .filter((child) => this.imageStorage.get(child.value as string) != null)
      .map((child) => portraitNameOf(child));
  }
}
