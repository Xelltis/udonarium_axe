import { DestroyRef, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ExpiredBuffEntry, formatExpiredBuffs } from '@axe/domain/character/buff-expiry';
import { BuffSnapshotEntry } from '@axe/domain/character/buff-manager';
import { BuffTiming, BuffTurnActor } from '@axe/domain/character/buff-timing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { changedBuffs, parseTurnHistory, stringifyTurnHistory, TurnStep } from '@axe/domain/tabletop/turn-history';
import { FactionPhaseMode, TurnOrderMode } from '@axe/domain/tabletop/turn-order-mode';
import {
  describeSide,
  groupBySide,
  nextSide,
  normalizeFactionOrder,
  resolveCurrentSide,
  SideGroup,
  sideOfPiece,
} from '@axe/domain/tabletop/turn-side';
import { TurnPhase, TurnState } from '@axe/domain/tabletop/turn-state';

/** How many of the pieces still waiting are named before the rest are counted. */
const UNACTED_NAMES_SHOWN = 8;

@Injectable({ providedIn: 'root' })
export class TurnOrderService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly inventory = inject(GameObjectInventoryService);
  private readonly confirm = inject(ConfirmService);
  private readonly chat = inject(ChatMessageService);
  private readonly selection = inject(SelectionSignalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {
    this.objectChange.onObjectChangedForIdentifier(
      'TurnState',
      () => {
        const id = this.currentIdentifier;
        if (id) this.selection.highlightObject(id);
      },
      this.destroyRef
    );
  }

  private get turnState(): TurnState {
    return this.objectStore.get<TurnState>('TurnState') ?? TurnState.instance;
  }

  private get config(): Config {
    return this.objectStore.get<Config>('Config') ?? Config.instance;
  }

  get turnOrderMode(): TurnOrderMode {
    return this.config.turnOrderMode;
  }

  get factionPhaseMode(): FactionPhaseMode {
    return this.config.factionPhaseMode;
  }

  /**
   * The side whose phase it is, worked out afresh rather than taken as written.
   *
   * A party taken away in the middle of a fight would otherwise leave the round standing on
   * a side no piece is on, with nobody to hand the turn to and no way out of it.
   */
  get currentSide(): string {
    if (this.turnOrderMode !== 'faction') return '';
    const held = this.turnState.currentSide;
    if (held.length < 1) return '';
    return resolveCurrentSide(held, this.orderedSides(), (group) => this.hasUnacted(group));
  }

  /** The sides the round goes round, each with the pieces on it. Empty unless it is taken side by side. */
  orderedSides(includeHidden = false): SideGroup<GameCharacter>[] {
    if (this.turnOrderMode !== 'faction') return [];
    return groupBySide(this.turnPieces(includeHidden), this.sideOrder());
  }

  /** What a side is called and the colour it is shown in. */
  sideName(side: string): string {
    return describeSide(side, this.parties(), this.t('feature.turnOrder.unassignedSide')).name;
  }

  sideColor(side: string): string {
    return describeSide(side, this.parties(), '').color;
  }

  private sideOrder(): string[] {
    return normalizeFactionOrder(this.config.factionOrder, this.parties(), {
      skipUnassigned: this.config.factionSkipUnassigned,
    });
  }

  private parties(): Party[] {
    return this.objectStore.getObjects<Party>(Party);
  }

  private hasUnacted(group: SideGroup<GameCharacter>): boolean {
    return group.members.some((member) => !this.isActed(member.identifier));
  }

  get currentIdentifier(): string {
    return this.turnState.currentIdentifier;
  }

  get round(): number {
    return this.turnState.round;
  }

  get phase(): TurnPhase {
    return this.turnState.phase;
  }

  get buffDecay(): boolean {
    return this.turnState.buffDecay;
  }

  setBuffDecay(enabled: boolean): void {
    this.turnState.buffDecay = enabled;
  }

  /** Whether the round can be put back a step, which it can as soon as one has been taken. */
  get canUndo(): boolean {
    return parseTurnHistory(this.turnState.history).length > 0;
  }

  /** Who has had their turn this round, in the order they took it. */
  get actedIdentifiers(): readonly string[] {
    return this.turnState.actedIdentifiers;
  }

  isActed(identifier: string): boolean {
    return this.turnState.actedIdentifiers.includes(identifier);
  }

  /**
   * The pieces the turn goes round, in the order the inventory lists them.
   *
   * Taken side by side, the same pieces come back gathered under their sides and in the
   * order the sides are taken, so walking the list walks the round.
   */
  orderedCharacters(includeHidden = false): GameCharacter[] {
    const pieces = this.turnPieces(includeHidden);
    if (this.turnOrderMode !== 'faction') return pieces;
    return groupBySide(pieces, this.sideOrder()).flatMap((group) => group.members);
  }

  private turnPieces(includeHidden: boolean): GameCharacter[] {
    return this.allCharacters().filter((character) => !character.noTurn && (includeHidden || !character.hideInventory));
  }

  /** Everyone on the table, whether or not they take a turn: a buff runs out either way. */
  private allCharacters(): GameCharacter[] {
    return this.inventory.tableInventory.tabletopObjects as GameCharacter[];
  }

  /**
   * Gives the turn to one piece.
   *
   * Taken side by side, this is how a piece takes its turn rather than a way of pointing at
   * one: whoever was up is closed off first and the piece named is opened, so every piece
   * gets its start and its end exactly once however freely the side moves.
   */
  setCurrent(identifier: string): void {
    if (this.turnOrderMode === 'faction' && this.turnState.currentIdentifier === identifier) return;
    this.step(() => {
      const turnState = this.turnState;
      if (turnState.round < 1) turnState.round = 1;
      if (this.turnOrderMode === 'faction') {
        this.closeCurrentPiece();
        const piece = this.objectStore.get<GameCharacter>(identifier);
        if (piece) turnState.currentSide = sideOfPiece(piece, this.sideOrder());
        this.takeTurn(identifier);
        return;
      }
      turnState.phase = 'acting';
      turnState.currentIdentifier = identifier;
      this.announceCharacter(identifier);
    });
  }

  next(): void {
    this.step(() => {
      const turnState = this.turnState;
      if (this.turnOrderMode === 'faction') {
        this.nextSideStep();
        return;
      }
      const order = this.orderedCharacters();

      if (turnState.phase === 'idle' || turnState.phase === 'roundEnd') {
        this.beginRound(turnState.round + 1);
        return;
      }
      if (turnState.phase === 'roundStart') {
        this.handOver(this.firstUnacted(order));
        return;
      }
      // Whoever was up has now had their turn, wherever in the order they were given it.
      this.markActed(turnState.currentIdentifier);
      this.expireBuffs('turnEnd', this.actorOf(turnState.currentIdentifier));
      this.handOver(this.firstUnacted(order));
    });
  }

  /**
   * One press of the round, taken side by side.
   *
   * The press hands the turn on within the side and only leaves it once nobody on it is
   * waiting, whichever way the side moves through its phase. A press that closed the whole
   * phase would take the turn away from everyone who had not moved yet, which is the one
   * thing a press of the round should never do quietly.
   */
  private nextSideStep(): void {
    const turnState = this.turnState;
    if (turnState.phase === 'idle' || turnState.phase === 'roundEnd') {
      this.beginRound(turnState.round + 1);
      return;
    }
    if (turnState.phase === 'roundStart') {
      this.openSide(nextSide('', this.orderedSides(), (group) => this.hasUnacted(group)));
      return;
    }

    this.closeCurrentPiece();
    const side = this.currentSide;
    const waiting = this.firstUnacted(this.membersOfSide(side));
    if (waiting) {
      this.takeTurn(waiting.identifier);
      return;
    }
    this.openSide(nextSide(side, this.orderedSides(), (group) => this.hasUnacted(group)));
  }

  private membersOfSide(side: string): GameCharacter[] {
    return this.orderedSides().find((group) => group.side === side)?.members ?? [];
  }

  /** Closes off whoever was up, so no piece is left holding a turn it has finished. */
  private closeCurrentPiece(): void {
    const held = this.turnState.currentIdentifier;
    if (held.length < 1) return;
    this.markActed(held);
    this.expireBuffs('turnEnd', this.actorOf(held));
  }

  /** Opens a side's phase, or closes the round where there is no side left to open. */
  private openSide(side: string): void {
    if (side.length < 1) {
      this.finishRound();
      return;
    }
    const turnState = this.turnState;
    turnState.currentSide = side;
    turnState.phase = 'acting';
    turnState.currentIdentifier = '';
    this.chat.sendSystemMessageToMainTab(this.t('feature.turnOrder.sidePhaseStart', { name: this.sideName(side) }));
    if (this.factionPhaseMode !== 'initiative') return;
    const first = this.firstUnacted(this.membersOfSide(side));
    if (first) this.takeTurn(first.identifier);
  }

  /** Closes the round wherever it stands and opens the next one. */
  /** The pieces that have not had their turn, in the order the round would reach them. */
  unactedCharacters(): GameCharacter[] {
    if (this.turnState.phase === 'idle' || this.turnState.phase === 'roundEnd') return [];
    return this.orderedCharacters(true).filter((piece) => !this.isActed(piece.identifier));
  }

  /**
   * Moves the round on, once whoever is still to move has been accounted for.
   *
   * A round pressed on while pieces are still waiting takes their turn away without ever
   * showing it happening, so the ones being left behind are named and the press has to be
   * made a second time.
   */
  async advanceRound(): Promise<void> {
    if (!(await this.mayLeaveTheseBehind())) return;
    this.step(() => {
      const turnState = this.turnState;
      if (turnState.phase === 'acting' || turnState.phase === 'roundStart') this.finishRound();
      this.beginRound(this.turnState.round + 1);
    });
  }

  private async mayLeaveTheseBehind(): Promise<boolean> {
    const waiting = this.unactedCharacters();
    if (waiting.length < 1) return true;
    const shown = waiting.slice(0, UNACTED_NAMES_SHOWN).map((piece) => piece.name);
    if (waiting.length > shown.length) {
      shown.push(this.t('feature.turnOrder.unactedMore', { n: waiting.length - shown.length }));
    }
    return this.confirm.ask({
      title: this.t('feature.turnOrder.unactedTitle'),
      message: `${this.t('feature.turnOrder.unactedMessage')}\n\n${shown.join('\n')}`,
      okLabel: this.t('feature.turnOrder.unactedProceed'),
    });
  }

  /**
   * Takes the round back to where the one before it left off, buffs and all.
   *
   * Steps are undone until the record shows a round earlier than the one standing, so an
   * extra press of the round button costs one press to put right however many turns it ate.
   */
  retreatRound(): void {
    const startedAt = this.turnState.round;
    const steps = parseTurnHistory(this.turnState.history);
    if (steps.length < 1) return;

    while (steps.length > 0) {
      const step = steps.pop();
      if (!step) break;
      this.applyStep(step);
      if (step.round < startedAt) break;
    }
    this.turnState.history = stringifyTurnHistory(steps);
    this.chat.sendSystemMessageToMainTab(this.t('feature.turnOrder.retreatRoundAnnounce', { n: this.turnState.round }));
  }

  /**
   * Takes the round back a step, buffs and all.
   *
   * What was done is undone from the record rather than worked out again: a round that ran
   * out took buffs off the sheet with it, and only what was written down before the step can
   * put those back.
   */
  prev(): void {
    const steps = parseTurnHistory(this.turnState.history);
    const last = steps.pop();
    if (!last) return;

    this.applyStep(last);
    this.turnState.history = stringifyTurnHistory(steps);
    this.chat.sendSystemMessageToMainTab(this.t('feature.turnOrder.undoAnnounce'));
  }

  reset(): void {
    this.step(() => {
      this.toIdle();
      this.chat.sendSystemMessageToMainTab(this.t('feature.turnOrder.resetAnnounce'));
    });
  }

  /** The first in the order who has not acted yet, or nobody once they all have. */
  private firstUnacted(order: readonly GameCharacter[]): GameCharacter | null {
    return order.find((character) => !this.isActed(character.identifier)) ?? null;
  }

  private handOver(character: GameCharacter | null): void {
    if (character) this.takeTurn(character.identifier);
    else this.finishRound();
  }

  private markActed(identifier: string): void {
    if (identifier.length < 1 || this.isActed(identifier)) return;
    this.turnState.actedIdentifiers = [...this.turnState.actedIdentifiers, identifier];
  }

  /**
   * Runs one step of the round and writes down what it was standing on beforehand.
   *
   * The buffs are read on either side of it and only the pieces whose own changed are kept,
   * so a press costs the record one line rather than the whole table.
   */
  private step(work: () => void): void {
    const turnState = this.turnState;
    const before: TurnStep = {
      round: turnState.round,
      phase: turnState.phase,
      currentIdentifier: turnState.currentIdentifier,
      currentSide: turnState.currentSide,
      acted: [...turnState.actedIdentifiers],
      buffs: [],
    };
    const buffsBefore = this.captureBuffs();

    work();

    before.buffs = changedBuffs(buffsBefore, this.captureBuffs());
    const steps = parseTurnHistory(this.turnState.history);
    steps.push(before);
    this.turnState.history = stringifyTurnHistory(steps);
  }

  private captureBuffs(): Map<string, BuffSnapshotEntry[]> {
    const captured = new Map<string, BuffSnapshotEntry[]>();
    for (const character of this.allCharacters()) {
      captured.set(character.identifier, character.buffs.snapshot());
    }
    return captured;
  }

  private applyStep(step: TurnStep): void {
    const turnState = this.turnState;
    turnState.round = step.round;
    turnState.phase = step.phase;
    turnState.currentIdentifier = step.currentIdentifier;
    turnState.currentSide = step.currentSide;
    turnState.actedIdentifiers = [...step.acted];
    for (const entry of step.buffs) {
      this.objectStore.get<GameCharacter>(entry.identifier)?.buffs.restore(entry.buffs);
    }
  }

  private beginRound(round: number): void {
    const turnState = this.turnState;
    turnState.round = Math.max(1, round);
    turnState.phase = 'roundStart';
    turnState.currentIdentifier = '';
    turnState.currentSide = '';
    turnState.actedIdentifiers = [];
    this.chat.sendSystemMessageToMainTab(this.t('feature.turnOrder.roundStart', { n: turnState.round }));
  }

  /** Hands the turn over, and lets whatever waits on its opening run out. */
  private takeTurn(identifier: string): void {
    this.enterActing(identifier);
    this.expireBuffs('turnStart', this.actorOf(identifier));
  }

  private enterActing(identifier: string): void {
    const turnState = this.turnState;
    turnState.phase = 'acting';
    turnState.currentIdentifier = identifier;
    this.announceCharacter(identifier);
  }

  /**
   * Closes the round and moves on. Only the peer that advanced it runs this, so the
   * countdown drops once even between peers.
   */
  private finishRound(): void {
    this.endRound();
    this.expireBuffs('roundEnd', { identifier: '', name: '' });
  }

  /**
   * Counts down whatever this moment belongs to. A buff pinned to a trigger character
   * waits for that character's turn, so the whole table is asked and only the buffs whose
   * moment it is answer.
   */
  private actorOf(identifier: string): BuffTurnActor {
    const character = this.objectStore.get<GameCharacter>(identifier);
    return { identifier, name: character?.name ?? '' };
  }

  private expireBuffs(timing: BuffTiming, acting: BuffTurnActor): void {
    if (!this.turnState.buffDecay) return;

    const entries: ExpiredBuffEntry[] = [];
    for (const character of this.allCharacters()) {
      const buffNames = character.buffs.expireAt(timing, acting);
      if (buffNames.length > 0) entries.push({ characterName: character.name, buffNames });
    }

    const detail = formatExpiredBuffs(entries);
    if (detail !== '') {
      this.chat.sendSystemMessageToMainTab(this.t('feature.turnOrder.buffExpired', { detail }));
    }
  }

  private endRound(round: number = this.turnState.round): void {
    const turnState = this.turnState;
    turnState.round = Math.max(1, round);
    turnState.phase = 'roundEnd';
    turnState.currentIdentifier = '';
    turnState.currentSide = '';
    this.chat.sendSystemMessageToMainTab(this.t('feature.turnOrder.roundEnd', { n: turnState.round }));
  }

  private toIdle(): void {
    const turnState = this.turnState;
    turnState.round = 0;
    turnState.phase = 'idle';
    turnState.currentIdentifier = '';
    turnState.currentSide = '';
    turnState.actedIdentifiers = [];
  }

  private announceCharacter(identifier: string): void {
    const character = this.objectStore.get<GameCharacter>(identifier);
    if (!character) return;
    this.chat.sendSystemMessageToMainTab(this.t('feature.turnOrder.announce', { name: character.name }));
  }
}
