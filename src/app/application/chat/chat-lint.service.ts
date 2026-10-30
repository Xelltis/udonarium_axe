import { computed, inject, Injectable, type Signal } from '@angular/core';
import { StampRulesService } from '@axe/application/chat/stamp-rules.service';
import { GameSystemPrefetchService } from '@axe/application/dice/game-system-prefetch.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
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
import { checkRollLine, isSecretRollLine, rollableText, type RollCheck } from '@axe/domain/dice/dice-roll-line';
import { DiceTable } from '@axe/domain/dice/dice-table';
import { CutIn } from '@axe/domain/media/cut-in';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

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

/**
 * What is read out of a text and found in it, kept up to date as it and the room change. What is
 * shown as the text is typed is cheap to work out; the diagnostics and the rolls' results, which
 * roll each line, are left for whoever reads them once the reader pauses.
 */
export interface ChatLintSession {
  readonly scan: Signal<ChatSyntaxScan>;
  readonly diagnostics: Signal<ChatDiagnostic[]>;
  /** What references are filled in with and the cut-ins the text starts, shown as it is typed; it follows the room too. */
  readonly annotations: Signal<ChatLintAnnotation[]>;
  /** What each roll the text makes comes to, checked by rolling it. */
  readonly rolls: Signal<ChatLintAnnotation[]>;
}

/**
 * How many roll checks are kept, so that a text checked again as it is drawn is not rolled again:
 * enough for every roll line of a long palette, each checked again at every key.
 */
const ROLL_CHECKS_KEPT = 1024;

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
  private readonly stampRules = inject(StampRulesService);
  private readonly selection = inject(SelectionSignalService);

  private readonly systems = inject(GameSystemPrefetchService);

  /**
   * Whether this seat is the game master's, read from its cursor: only a change to that makes a text
   * checked again, not every move of the cursor, which comes at every step of a movement planned.
   */
  private readonly isGameMaster = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });
  /**
   * Whether the reader's seat is kept off the table, followed as their role changes: a guest made a
   * player is checked again with the text as it was. The room server's part, which no signal tells,
   * is read again as each text is checked.
   */
  private readonly keptOffTable = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfKeptOffTable;
  });
  /**
   * The names the pieces in the room go by, for the dice tokens put onto them: read again as any
   * piece changes, but a change that leaves every name as it was checks no text again.
   */
  private readonly pieceNames = computed(
    () => {
      const pieces = this.trackedPieces();
      return new Set(pieces.map((piece) => piece.name.trim()));
    },
    { equal: (a, b) => a.size === b.size && [...a].every((name) => b.has(name)) }
  );

  /** Whether an effect has a piece to fall on: a piece on the table targeted, or one selected. */
  private readonly hasEffectTarget = computed(() => {
    this.uiSignal.targetChange();
    const pieces = this.trackedPieces();
    const selected = this.selection.selectedObject();
    const selectedPiece = selected ? this.objectStore.get(selected.identifier) : null;
    return (
      pieces.some((piece) => piece.isVisibleOnTable && piece.targeted) ||
      (selectedPiece instanceof GameCharacter && selectedPiece.isVisibleOnTable)
    );
  });
  private readonly rollChecks = new Map<string, RollCheck>();

  /** Starts checking a text, for as long as its signals are read. */
  watch(source: ChatLintSource): ChatLintSession {
    const mode = source.mode ?? 'chat';
    const scan = computed(() => scanChatSyntax(source.text(), mode));
    const variables = computed(() => (mode === 'palette' ? this.variablesWritten(scan()) : null), {
      equal: sameVariables,
    });
    const context = computed(() => this.contextOf(source, scan, variables()));
    const diagnostics = computed(() => lintChatSyntax(scan(), context()));
    const annotations = computed(() => this.annotationsOf(scan(), context()));
    const rolls = computed(() => this.rollsOf(scan(), context()));
    return { scan, diagnostics, annotations, rolls };
  }

  /**
   * What a text is checked against, which follows the room, not the text: the text itself is read
   * only as a reference or a roll in it is checked, and a palette's variables only where they change.
   * The room's pictures, which portraits are found among, and its states, which a buff may name,
   * are followed too.
   * Whether the seat is kept off the table turns on the room server too, which no signal tells, so
   * it is read as each text is checked. A palette's line is rolled as it goes out, each `\n` written
   * in it broken into a line of its own.
   */
  private contextOf(
    source: ChatLintSource,
    scan: Signal<ChatSyntaxScan>,
    variables: readonly PaletteVariable[] | null
  ): ChatLintContext {
    this.systems.arrivals();
    this.objectChange.fileVersion();
    this.objectChange.versionOf(StatusAilmentCatalog.instance.identifier)();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.collectionOf(CutIn.aliasName)();
    const isGameMaster = this.isGameMaster();
    this.keptOffTable();
    const pieceNames = this.pieceNames();
    const hasEffectTarget = this.hasEffectTarget();
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
    for (const cutIn of cutIns) this.objectChange.versionOf(cutIn.identifier)();
    const tableCommands = this.diceTableCommands();
    const gameType = source.gameType();
    const path = typeof source.path === 'function' ? source.path() : source.path;

    const fill = (text: string, target?: GameCharacter): string => {
      if (path === 'chatWindow' && !speaker && !target) return text;
      return this.filled(text, speaker, target, variables, path === 'chatWindow');
    };
    const sent = (message: TextRange): string => {
      const line = scan().text.slice(message.from, message.to);
      return source.mode === 'palette' ? line.replace(/\\n/g, '\n') : line;
    };

    return {
      path,
      sentLater: source.mode === 'palette',
      speaker,
      targets,
      hasEffectTarget,
      isGameMaster,
      get keptOffTable() {
        return PeerCursor.isMyselfKeptOffTable;
      },
      referenceValue: (site: ReferenceSite) => {
        const typed = scan().text.slice(site.from, site.to);
        if (site.targeted && targets.length < 1) return null;
        if (!site.targeted && !speaker && path === 'chatWindow') return null;
        const value = this.filled(typed, speaker, targets[0], variables, true);
        return value === typed ? null : value;
      },
      portraits: () => this.portraitsOf(speaker),
      isChatCutIn: (name: string) => cutIns.some((cutIn) => cutIn.chatActivate && cutIn.name === name),
      stampAllowed: (stampId: string) => this.stampRules.allows('line', stampId),
      hasEffect: (name: string) => {
        const needle = name.trim();
        return presets.some((preset) => preset.name.trim() === needle && (!preset.gmOnly || isGameMaster));
      },
      hasPieceNamed: (name: string) => pieceNames.has(name.trim()),
      rollCheck: (message: TextRange) => {
        const line = sent(message);
        if (tableCommands.has(rollableText(line).trim().split(/\s/)[0])) return null;
        return this.rollCheck(gameType, fill(line, targets[0]));
      },
      rolledText: (message: TextRange) => fill(sent(message), targets[0]),
      secretRoll: (message: TextRange) => {
        const system = this.systems.systemFor(gameType);
        const line = fill(sent(message), targets[0]);
        return system != null && isSecretRollLine(system, DiceBot.isUnreachable(system), line);
      },
    };
  }

  /** The pieces in the room, each followed, so that what reads them is read again as any of them changes. */
  private trackedPieces(): GameCharacter[] {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const pieces = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const piece of pieces) this.objectChange.versionOf(piece.identifier)();
    return pieces;
  }

  /**
   * The commands of the room's dice tables, which answer a line starting with one instead of the
   * dice bot, so such a line is no roll to check.
   */
  private diceTableCommands(): ReadonlySet<string> {
    this.objectChange.collectionOf(DiceTable.aliasName)();
    const tables = this.objectStore.getObjects<DiceTable>(DiceTable);
    for (const table of tables) this.objectChange.versionOf(table.identifier)();
    return new Set(tables.map((table) => table.command).filter((command) => command.length > 0));
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

  /**
   * What the game system makes of a text, or null while its code is on the way. The checks used
   * last are the ones kept longest.
   */
  private rollCheck(gameType: string, text: string): RollCheck | null {
    const system = this.systems.systemFor(gameType);
    if (!system) return null;
    const unreachable = DiceBot.isUnreachable(system);
    const key = `${system.ID}\u0000${unreachable ? '!' : ''}\u0000${text}`;
    const kept = this.rollChecks.get(key);
    if (kept) {
      this.rollChecks.delete(key);
      this.rollChecks.set(key, kept);
      return kept;
    }
    const check = checkRollLine(system, unreachable, text);
    this.rollChecks.set(key, check);
    if (this.rollChecks.size > ROLL_CHECKS_KEPT) this.rollChecks.delete(this.rollChecks.keys().next().value!);
    return check;
  }

  private annotationsOf(scan: ChatSyntaxScan, context: ChatLintContext): ChatLintAnnotation[] {
    const annotations: ChatLintAnnotation[] = [];
    for (const span of scan.spans) {
      if (span.kind === 'reference') {
        const value = context.referenceValue(span.site);
        if (value != null) annotations.push({ kind: 'value', label: value, from: span.from, to: span.to });
      } else if (span.kind === 'cutIn' && context.isChatCutIn(span.name)) {
        annotations.push({ kind: 'cutIn', label: span.name, from: span.from, to: span.to });
      }
    }
    return annotations;
  }

  private rollsOf(scan: ChatSyntaxScan, context: ChatLintContext): ChatLintAnnotation[] {
    const rolls: ChatLintAnnotation[] = [];
    for (const span of scan.spans) {
      if (span.kind !== 'roll') continue;
      const check = context.rollCheck(span.message);
      if (check?.kind === 'rolled') rolls.push({ kind: 'roll', label: check.result, from: span.from, to: span.to });
    }
    return rolls;
  }
}

/** Whether two readings of a palette's variables say the same, so what is checked against them stands. */
function sameVariables(a: readonly PaletteVariable[] | null, b: readonly PaletteVariable[] | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.length === b.length &&
    a.every((variable, index) => variable.name === b[index].name && variable.value === b[index].value)
  );
}
