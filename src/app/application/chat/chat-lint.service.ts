import { computed, inject, Injectable, type Signal, signal } from '@angular/core';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { evaluateReferences, type PaletteVariable } from '@axe/domain/chat/chat-palette';
import type { ImageNameEntry } from '@axe/domain/chat/chat-portrait-command';
import type { ReferenceSite } from '@axe/domain/chat/chat-reference';
import { type ChatDiagnostic, type ChatLintContext, lintChatSyntax } from '@axe/domain/chat-syntax/chat-lint';
import {
  type ChatSyntaxMode,
  type ChatSyntaxScan,
  scanChatSyntax,
  type TextRange,
} from '@axe/domain/chat-syntax/chat-syntax';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { checkRollLine, type RollCheck } from '@axe/domain/dice/dice-roll-line';
import { CutIn } from '@axe/domain/media/cut-in';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import type GameSystemClass from 'bcdice/lib/game_system';

/** How a text is sent: typed into chat, or from a palette. */
export type ChatLintPath = ChatLintContext['path'];

/** What a text being written is checked as. */
export interface ChatLintSource {
  readonly text: Signal<string>;
  /** Whom the text is spoken as: a piece's identifier, or anyone else's. */
  readonly sendFrom: Signal<string>;
  /** The game system rolls in it are made with. */
  readonly gameType: Signal<string>;
  /** Whether it is typed into chat or sent from a palette, which fill references in differently. */
  readonly path: ChatLintPath | (() => ChatLintPath);
  /** Whether it is one message, or a palette of lines. */
  readonly mode?: ChatSyntaxMode;
}

/** Something shown beside a syntax: what a reference is filled in with, a roll's result, a cut-in it starts. */
export interface ChatLintAnnotation extends TextRange {
  readonly kind: 'value' | 'roll' | 'cutIn';
  readonly label: string;
}

/** What is read out of a text and found in it, kept up to date as it and the room change. */
export interface ChatLintSession {
  readonly scan: Signal<ChatSyntaxScan>;
  readonly diagnostics: Signal<ChatDiagnostic[]>;
  readonly annotations: Signal<ChatLintAnnotation[]>;
}

/** How many roll checks are kept, so that a text checked again as it is drawn is not rolled again. */
const ROLL_CHECKS_KEPT = 64;

/**
 * Checks the syntax of a text being written against the room, the way sending it would go: the
 * speaker's sheet and portraits, the pieces aimed at, the cut-ins, the effect library, and the
 * game system rolls are made with.
 *
 * A game system not loaded yet is fetched, and the text checked again once it is here. A roll is
 * tried with the system itself, never through the dice bot's queue, so a check neither holds up a
 * line being sent nor goes into the log; each text is tried once.
 */
@Injectable({ providedIn: 'root' })
export class ChatLintService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly effectLibrary = inject(EffectLibraryService);
  private readonly imageStorage = inject(ImageStorage);

  private readonly systemsArrived = signal(0);
  private readonly fetched = new Map<string, GameSystemClass>();
  private readonly fetching = new Set<string>();
  private readonly rollChecks = new Map<string, RollCheck>();

  /** Starts checking a text, for as long as its signals are read. */
  watch(source: ChatLintSource): ChatLintSession {
    const mode = source.mode ?? 'chat';
    const scan = computed(() => scanChatSyntax(source.text(), mode));
    const context = computed(() => this.contextOf(source, scan()));
    const diagnostics = computed(() => lintChatSyntax(scan(), context()));
    const annotations = computed(() => this.annotationsOf(scan(), context()));
    return { scan, diagnostics, annotations };
  }

  private contextOf(source: ChatLintSource, scan: ChatSyntaxScan): ChatLintContext {
    this.systemsArrived();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.collectionOf(CutIn.aliasName)();
    this.objectChange.trackMyCursor();
    this.uiSignal.targetChange();
    const presets = this.effectLibrary.presets();

    const sendFrom = source.sendFrom();
    this.objectChange.versionOf(sendFrom)();
    const found = this.objectStore.get(sendFrom);
    const speaker = found instanceof GameCharacter ? found : null;
    const pieces = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    const targets = pieces.filter((piece) => piece.location.name === 'table' && piece.targeted);
    for (const target of targets) this.objectChange.versionOf(target.identifier)();
    const cutIns = this.objectStore.getObjects<CutIn>(CutIn);
    const variables = source.mode === 'palette' ? this.variablesWritten(scan) : null;
    const gameType = source.gameType();
    const path = typeof source.path === 'function' ? source.path() : source.path;

    const fill = (text: string, target?: GameCharacter): string => {
      if (path === 'chatWindow' && !speaker && !target) return text;
      return this.filled(text, speaker, target, variables, path === 'chatWindow');
    };

    return {
      path,
      speaker,
      targets,
      isGameMaster: PeerCursor.isMyselfGameMaster,
      keptOffTable: PeerCursor.isMyselfKeptOffTable,
      referenceValue: (site: ReferenceSite) => {
        const typed = scan.text.slice(site.from, site.to);
        if (site.targeted && targets.length < 1) return null;
        if (!site.targeted && !speaker && path === 'chatWindow') return null;
        const value = this.filled(typed, speaker, targets[0], variables, true);
        return value === typed ? null : value;
      },
      portraits: () => this.portraitsOf(speaker),
      isChatCutIn: (name: string) => cutIns.some((cutIn) => cutIn.chatActivate && cutIn.name === name),
      hasEffect: (name: string) => {
        const needle = name.trim();
        return presets.some(
          (preset) => preset.name.trim() === needle && (!preset.gmOnly || PeerCursor.isMyselfGameMaster)
        );
      },
      hasPieceNamed: (name: string) => pieces.some((piece) => piece.name.trim() === name.trim()),
      rollCheck: (message: TextRange) =>
        this.rollCheck(gameType, fill(scan.text.slice(message.from, message.to), targets[0])),
    };
  }

  /**
   * A text with its references filled in from the speaker, a target and the palette's variables,
   * those written into a palette being edited where given. One nothing answers is kept as typed
   * when `keepUnfilled`, as chat keeps it, or emptied out, as a palette does.
   */
  private filled(
    text: string,
    speaker: GameCharacter | null,
    target: GameCharacter | undefined,
    variables: readonly PaletteVariable[] | null,
    keepUnfilled: boolean
  ): string {
    const own = variables ?? speaker?.chatPalette?.paletteVariables ?? [];
    return evaluateReferences(text, own, speaker?.rootDataElement ?? undefined, target, true, keepUnfilled).text;
  }

  /** The variables a palette being written sets, read from what is written rather than what was kept. */
  private variablesWritten(scan: ChatSyntaxScan): PaletteVariable[] {
    const variables: PaletteVariable[] = [];
    for (const span of scan.spans) {
      if (span.kind !== 'paletteVariable') continue;
      const value = span.parts.find((part) => part.role === 'amount');
      variables.push({ name: span.name, value: value ? scan.text.slice(value.from, value.to) : '' });
    }
    return variables;
  }

  private portraitsOf(speaker: GameCharacter | null): ImageNameEntry[] {
    const data = speaker?.imageDataElement;
    if (!data) return [];
    const entries: ImageNameEntry[] = [];
    for (const child of data.children) {
      if (!(child instanceof DataElement)) continue;
      const image = this.imageStorage.get(child.value as string);
      entries.push({ label: portraitNameOf(child), identifier: image ? image.identifier : '' });
    }
    return entries;
  }

  /** What the game system makes of a text, or null while its code is on the way. */
  private rollCheck(gameType: string, text: string): RollCheck | null {
    const system = DiceBot.loadedGameSystem(gameType) ?? this.fetched.get(gameType) ?? null;
    if (!system) {
      this.fetch(gameType);
      return null;
    }
    const unreachable = DiceBot.isUnreachable(system);
    const key = `${system.ID}\u0000${unreachable ? '!' : ''}\u0000${text}`;
    const kept = this.rollChecks.get(key);
    if (kept) return kept;
    const check = checkRollLine(system, unreachable, text);
    this.rollChecks.set(key, check);
    if (this.rollChecks.size > ROLL_CHECKS_KEPT) this.rollChecks.delete(this.rollChecks.keys().next().value!);
    return check;
  }

  private fetch(gameType: string): void {
    if (this.fetching.has(gameType)) return;
    this.fetching.add(gameType);
    void DiceBot.loadGameSystemAsync(gameType)
      .then((system) => this.fetched.set(gameType, system))
      .finally(() => {
        this.fetching.delete(gameType);
        this.systemsArrived.update((count) => count + 1);
      });
  }

  private annotationsOf(scan: ChatSyntaxScan, context: ChatLintContext): ChatLintAnnotation[] {
    const annotations: ChatLintAnnotation[] = [];
    for (const span of scan.spans) {
      if (span.kind === 'reference') {
        const value = context.referenceValue(span.site);
        if (value != null) annotations.push({ kind: 'value', label: value, from: span.from, to: span.to });
      } else if (span.kind === 'roll') {
        const check = context.rollCheck(span.message);
        if (check?.kind === 'rolled')
          annotations.push({ kind: 'roll', label: check.result, from: span.from, to: span.to });
      } else if (span.kind === 'cutIn' && context.isChatCutIn(span.name)) {
        annotations.push({ kind: 'cutIn', label: span.name, from: span.from, to: span.to });
      }
    }
    return annotations;
  }
}
