import { inject, Injectable } from '@angular/core';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { resourceCatalogOf } from '@axe/domain/character/resource-catalog';
import type { ChatTagLanguage } from '@axe/domain/chat/chat-decoration';
import { findImageIdentifierByName, portraitCommandSite } from '@axe/domain/chat/chat-portrait-command';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { diceCommandExamples } from '@axe/domain/dice/dice-roll-line';
import { CutIn } from '@axe/domain/media/cut-in';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import type { ChatCompletionWords } from '@axe/features/chat/chat-editor/chat-editor-complete';
import type { ChatSyntaxMenuSource } from '@axe/features/chat/chat-input/chat-syntax-items';
import { roomStampViewSource, stampMarkup, stampViewOf } from '@axe/ui/components/stamp/stamp-view';

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
  private readonly stampPacks = inject(StampPackService);
  private readonly t = inject(TRANSLATE_FN);

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
      diceExamples: system && !DiceBot.isUnreachable(system) ? this.examplesOf(system) : [],
      isGameMaster: PeerCursor.isMyselfGameMaster,
    };
  }

  /**
   * The commands a game system gives as examples, worked out once for each system: each is tried
   * by rolling it, which is too dear to do again at every key while names are offered.
   */
  private examplesOf(system: Parameters<typeof diceCommandExamples>[0]): string[] {
    const known = this.diceExamples.get(system);
    if (known) return known;
    const examples = diceCommandExamples(system);
    this.diceExamples.set(system, examples);
    return examples;
  }

  private readonly diceExamples = new WeakMap<object, string[]>();

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
      cutIns: source.cutIns,
      diceExamples: source.diceExamples,
    };
  }

  /** The language decorations are written in: the one the reader reads the tool in. */
  tagLanguage(): ChatTagLanguage {
    return this.language.currentLang();
  }

  /** The cut-ins that start from chat, by name. */
  chatCutInNames(): ReadonlySet<string> {
    return new Set(
      this.objectStore
        .getObjects<CutIn>(CutIn)
        .filter((cutIn) => cutIn.chatActivate)
        .map((cutIn) => cutIn.name)
    );
  }

  /** A stamp put inside a line, as markup as tall as the letters, as the chat draws it; null for one not known. */
  stampHtml(stampId: string): string | null {
    const view = stampViewOf(stampId, roomStampViewSource(this.t, this.imageStorage, this.stampPacks));
    return view ? stampMarkup(stampId, view, 'inline') : null;
  }

  /** The picture a portrait command picks of the speaker's, as it would be when the line is sent; null where none. */
  portraitImage(sendFrom: string, raw: string): string | null {
    const speaker = this.speakerOf(sendFrom);
    const command = portraitCommandSite(raw)?.command;
    const children = (speaker?.imageDataElement?.children ?? []).filter(
      (child): child is DataElement => child instanceof DataElement
    );
    if (!command || command.type === 'hide') return null;
    const entries = children.map((child) => ({
      label: portraitNameOf(child),
      identifier: this.imageStorage.get(child.value as string)?.identifier ?? '',
    }));
    const identifier =
      command.type === 'index'
        ? (entries[command.position - 1]?.identifier ?? '')
        : findImageIdentifierByName(entries, command.name).identifier;
    return identifier ? (this.imageStorage.get(identifier)?.url ?? null) : null;
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
