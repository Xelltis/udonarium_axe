import { computed, DestroyRef, inject, Injectable, type Signal, signal } from '@angular/core';
import { StampRulesService } from '@axe/application/chat/stamp-rules.service';
import { GameSystemPrefetchService } from '@axe/application/dice/game-system-prefetch.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { sameSet } from '@axe/core/util/same-set';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { evaluateReferences, type PaletteVariable } from '@axe/domain/chat/chat-palette';
import type { ImageNameEntry } from '@axe/domain/chat/chat-portrait-command';
import type { ReferenceSite } from '@axe/domain/chat/chat-reference';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import {
  fillTargetNumber,
  findTargetNumberSource,
  holdsTargetNumber,
  isTargetNumberReference,
  type TargetNumberChoice,
  targetNumberChoiceOf,
  targetNumberChoices,
  type TargetNumberSource,
} from '@axe/domain/chat/target-number';
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
  /** The tab it is said in, whose rolls fill in a `{目標値}` in it; none where that is not told. */
  readonly tabIdentifier?: Signal<string>;
  /**
   * The answer the reader picked to fill a `{目標値}` in it with, in place of the one found; empty,
   * or one no longer there to pick, leaves the one found.
   */
  readonly chosenTargetNumber?: Signal<string>;
}

/**
 * What a `{目標値}` left in a text, after the speaker's own data has answered what it can, is filled
 * in with as the text is sent, and the answers the reader may pick instead.
 */
export interface ChatLintTargetNumber {
  /** The number found among the tab's rolls and where; null where nothing has been rolled to beat. */
  readonly found: TargetNumberSource | null;
  /** The answer the reader picked, filling it in instead of the one found; null where none is. */
  readonly chosen: TargetNumberChoice | null;
  /** The newest answers that may be picked, newest first, the one picked among them wherever it stands. */
  readonly choices: readonly TargetNumberChoice[];
}

/** How many of a tab's newest answers are offered to pick a `{目標値}` from. */
const TARGET_NUMBER_CHOICES = 8;

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

/** A text being checked as it is written to be sent, with what its `{目標値}` comes to. */
export interface ChatLintWatch extends ChatLintSession {
  /**
   * What a `{目標値}` the speaker's data leaves in the text is filled in with, and what may be picked
   * instead; null where the text holds none, or tells no tab.
   */
  readonly targetNumber: Signal<ChatLintTargetNumber | null>;
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

  /** Counts the lines said in any tab, so a `{目標値}` being typed is looked up again as a roll comes in. */
  private readonly linesHeard = signal(0);

  constructor() {
    this.objectChange.messageAdded$.subscribe(() => this.linesHeard.update((count) => count + 1), inject(DestroyRef));
  }

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
    { equal: sameSet }
  );

  /**
   * The pieces an effect or a battle from a line not aimed at targets plays on: those on the table
   * targeted, or else the one selected.
   */
  private readonly effectCandidates = computed(
    () => {
      this.uiSignal.targetChange();
      const targeted = this.trackedPieces().filter((piece) => piece.isVisibleOnTable && piece.targeted);
      if (targeted.length > 0) return targeted;
      const selected = this.selection.selectedObject();
      const selectedPiece = selected ? this.objectStore.get(selected.identifier) : null;
      return selectedPiece instanceof GameCharacter && selectedPiece.isVisibleOnTable ? [selectedPiece] : [];
    },
    { equal: (a, b) => a.length === b.length && a.every((piece, index) => piece === b[index]) }
  );
  private readonly rollChecks = new Map<string, RollCheck>();

  /** Starts checking a text, for as long as its signals are read. */
  watch(source: ChatLintSource): ChatLintWatch {
    const mode = source.mode ?? 'chat';
    const scan = computed(() => scanChatSyntax(source.text(), mode));
    const variables = computed(() => (mode === 'palette' ? this.variablesWritten(scan()) : null), {
      equal: sameVariables,
    });
    const holdsTargetNumberNow = computed(() => holdsTargetNumber(source.text()));
    const lookup = computed(() => (holdsTargetNumberNow() ? this.targetNumberOf(source) : null));
    const toBeat = computed(() => {
      const found = lookup();
      return (found?.chosen ?? found?.found)?.total ?? null;
    });
    const context = computed(() => this.contextOf(source, scan, variables(), toBeat));
    const diagnostics = computed(() => lintChatSyntax(scan(), context()));
    const annotations = computed(() => this.annotationsOf(scan(), context()));
    const rolls = computed(() => this.rollsOf(scan(), context()));
    const targetNumber = computed(() => {
      const found = lookup();
      this.objectChange.versionOf(source.sendFrom())();
      if (!found || !this.leavesTargetNumber(source, variables())) return null;
      const choices = targetNumberChoices(found.tab, TARGET_NUMBER_CHOICES);
      const chosen = found.chosen;
      const listed = chosen && !choices.some((choice) => choice.answer === chosen.answer);
      return { found: found.found, chosen, choices: listed ? [...choices, chosen] : choices };
    });
    return { scan, diagnostics, annotations, rolls, targetNumber };
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
    variables: readonly PaletteVariable[] | null,
    toBeat: Signal<number | null>
  ): ChatLintContext {
    this.systems.arrivals();
    this.objectChange.fileVersion();
    this.objectChange.versionOf(StatusAilmentCatalog.instance.identifier)();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.collectionOf(CutIn.aliasName)();
    const isGameMaster = this.isGameMaster();
    this.keptOffTable();
    const pieceNames = this.pieceNames();
    const candidates = this.effectCandidates();
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
      // A line said as no piece has no sheet to fill in from, but the number to beat is the tab's.
      if (path === 'chatWindow' && !speaker && !target) return fillTargetNumber(text, () => toBeat());
      return this.filled(text, speaker, target, variables, path === 'chatWindow', toBeat);
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
      hasEffectTarget: candidates.length > 0,
      hasBattleDefender: candidates.some((piece) => piece !== speaker),
      isGameMaster,
      get keptOffTable() {
        return PeerCursor.isMyselfKeptOffTable;
      },
      referenceValue: (site: ReferenceSite) => {
        const typed = scan().text.slice(site.from, site.to);
        if (site.targeted && targets.length < 1) return null;
        if (!site.targeted && !speaker && path === 'chatWindow') {
          if (!isTargetNumberReference(site.name)) return null;
          const filled = fillTargetNumber(typed, () => toBeat());
          return filled === typed ? null : filled;
        }
        const value = this.filled(typed, speaker, targets[0], variables, true, toBeat);
        return value === typed ? null : value;
      },
      speakerFilled: (text: string) => this.filled(text, speaker, undefined, variables, 'always'),
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
   * when `keepUnfilled`, as chat keeps it, or emptied out, as a palette does; `always` keeps every
   * one, a `t{}` joined onto a roll among them.
   */
  private filled(
    text: string,
    speaker: GameCharacter | null,
    target: GameCharacter | undefined,
    variables: readonly PaletteVariable[] | null,
    keepUnfilled: boolean | 'always',
    toBeat?: Signal<number | null>
  ): string {
    const own = variables ?? speaker?.chatPalette?.paletteVariables ?? [];
    const evaluated = evaluateReferences(text, own, speaker?.rootDataElement ?? undefined, target, true, keepUnfilled);
    return toBeat ? fillTargetNumber(evaluated.text, () => toBeat()) : evaluated.text;
  }

  /**
   * Where a `{目標値}` in the text would be filled in from as it is sent: the answer the reader
   * picked, where it is still there to pick, and the number found among the rolls in its tab, looked
   * for again as each line comes in and as the tab's own number to beat is set. Asked only while the
   * text holds one, so that typing leaves the log unread.
   */
  private targetNumberOf(
    source: ChatLintSource
  ): { tab: ChatTab; found: TargetNumberSource | null; chosen: TargetNumberChoice | null } | null {
    if (!source.tabIdentifier) return null;
    this.linesHeard();
    const tab = this.objectStore.get(source.tabIdentifier());
    if (!(tab instanceof ChatTab)) return null;
    this.objectChange.versionOf(tab.identifier)();
    const sendFrom = source.sendFrom();
    const speaker = this.objectStore.get(sendFrom);
    const name = speaker instanceof GameCharacter ? speaker.name : '';
    const found = findTargetNumberSource(tab, { identifier: sendFrom, name });
    const picked = this.objectStore.get(source.chosenTargetNumber?.() ?? '');
    const chosen = picked instanceof ChatMessage && picked.parent === tab ? targetNumberChoiceOf(picked) : null;
    return { tab, found, chosen };
  }

  /**
   * Whether a `{目標値}` is left in the text once the speaker's data, and the variables of a palette
   * being written, have answered what they can: one a sheet item of that name answers is no number
   * to beat.
   */
  private leavesTargetNumber(source: ChatLintSource, variables: readonly PaletteVariable[] | null): boolean {
    const text = source.text();
    const speaker = this.objectStore.get(source.sendFrom());
    if (!(speaker instanceof GameCharacter) && !variables) return holdsTargetNumber(text);
    return holdsTargetNumber(
      this.filled(text, speaker instanceof GameCharacter ? speaker : null, undefined, variables, true)
    );
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
