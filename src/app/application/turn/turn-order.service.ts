import { DestroyRef, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnHooksService } from '@axe/application/turn/turn-hooks.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ExpiredBuffEntry, formatExpiredBuffs } from '@axe/domain/character/buff-expiry';
import { BuffSnapshotEntry } from '@axe/domain/character/buff-manager';
import { BuffTiming, BuffTurnActor } from '@axe/domain/character/buff-timing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { turnCarrierOf } from '@axe/domain/tabletop/ride/ride-rules';
import { TriggerMoment } from '@axe/domain/tabletop/trigger-event';
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
import {
  readTurnHolding,
  TurnHolding,
  TurnPhase,
  turnStartMark,
  TurnState,
  writeTurnHolding,
} from '@axe/domain/tabletop/turn-state';

/** How many of the pieces still waiting are named before the rest are counted. */
const UNACTED_NAMES_SHOWN = 8;

/** What the chat is told as a piece is handed the turn, begins to wait, steps in or is gone back to. */
type TurnAnnouncement = 'announce' | 'holdAnnounce' | 'interruptAnnounce' | 'resumeAnnounce';

@Injectable({ providedIn: 'root' })
export class TurnOrderService {
  private readonly triggerFire = inject(TriggerFireService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly inventory = inject(GameObjectInventoryService);
  private readonly confirm = inject(ConfirmService);
  private readonly chat = inject(ChatMessageService);
  private readonly selection = inject(SelectionSignalService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly vision = inject(VisionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hooks = inject(TurnHooksService);
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
    return TurnState.instance;
  }

  private get config(): Config {
    return Config.instance;
  }

  /** Whether the room takes turns piece by piece or side by side. */
  get turnOrderMode(): TurnOrderMode {
    return this.config.turnOrderMode;
  }

  /**
   * How a side gets through its phase when turns go side by side.
   *
   * In `initiative` the turn goes to the side's first waiting piece as the phase opens; in `free`
   * nobody is up until one is picked.
   */
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
    // A peer that predates the side being written down sends a turn with no such field, and
    // applying it replaces the whole record rather than merging into it, so what comes back
    // here is nothing at all rather than an empty string.
    const held = this.turnState.currentSide ?? '';
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

  /** The colour a side is shown in, taken from the party it stands for. */
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

  /** The piece whose turn it is, or empty when nobody is up. */
  get currentIdentifier(): string {
    return this.turnState.currentIdentifier;
  }

  /** The round being played, which is 0 before the first has begun. */
  get round(): number {
    return this.turnState.round;
  }

  /** Where in the round the table is: idle, starting a round, a piece acting, or ending a round. */
  get phase(): TurnPhase {
    return this.turnState.phase;
  }

  /** Whether buffs count down as turns and rounds pass. */
  get buffDecay(): boolean {
    return this.turnState.buffDecay;
  }

  /**
   * Whether the round is this reader's to move.
   *
   * The round is the table's own clock: a press of it takes turns away, runs buffs out and
   * writes the announcement everybody reads. A seat that is only watching moves none of it.
   */
  get canTakeTurns(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  /** Turns buff countdown on or off for the whole room. Does nothing for a reader who may not take turns. */
  setBuffDecay(enabled: boolean): void {
    if (!this.canTakeTurns) return;
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

  /** Whether this piece has had its turn this round. */
  isActed(identifier: string): boolean {
    return this.turnState.actedIdentifiers.includes(identifier);
  }

  private holdingRead: { raw: unknown; holding: TurnHolding } = { raw: '', holding: readTurnHolding('') };
  private get holding(): TurnHolding {
    const raw = this.turnState.holding;
    if (raw !== this.holdingRead.raw) this.holdingRead = { raw, holding: readTurnHolding(raw) };
    return this.holdingRead.holding;
  }
  private set holding(holding: TurnHolding) {
    this.turnState.holding = writeTurnHolding(holding);
  }

  /** The pieces waiting to step in this round, in the order they began to wait. */
  get heldIdentifiers(): readonly string[] {
    return this.holding.held;
  }

  /** Whether this piece is waiting to step in. */
  isHeld(identifier: string): boolean {
    return this.holding.held.includes(identifier);
  }

  /**
   * Whether the piece may wait to step in later: a round is under way, the round reaches it, and it
   * has neither had its turn, begun to wait already, nor had its turn stepped into, which it takes
   * up again in its own time.
   */
  mayHold(identifier: string): boolean {
    if (!this.canTakeTurns || !this.isUnderWay()) return false;
    if (this.isActed(identifier) || this.isHeld(identifier)) return false;
    if (this.holding.interrupted.includes(identifier)) return false;
    return this.isInOrder(identifier);
  }

  /**
   * Has a piece wait to step in later in the round.
   *
   * A waiting piece is passed over by the round, and has its turn once nobody else is waiting, unless
   * it steps in before. A piece whose turn it is passes the turn on without it counting as had, and
   * the turn's opening does not run again when it comes back.
   */
  hold(identifier: string): void {
    if (!this.mayHold(identifier)) return;
    this.step(() => {
      const turnState = this.turnState;
      const isUp = turnState.phase === 'acting' && turnState.currentIdentifier === identifier;
      const holding = this.holding;
      this.holding = {
        ...holding,
        held: [...holding.held, identifier],
        begun: isUp ? [...holding.begun, identifier] : holding.begun,
      };
      this.announceCharacter(identifier, 'holdAnnounce');
      if (!isUp) return;
      this.hooks.turnEnded();
      if (this.turnOrderMode === 'faction') this.passOnInSide();
      else this.handOnward(this.orderedCharacters());
    });
  }

  /**
   * Whether the piece may step in now, which a piece still waiting may while the round is under way
   * and still reaches it.
   */
  mayInterrupt(identifier: string): boolean {
    if (!this.canTakeTurns || !this.isUnderWay()) return false;
    return this.isHeld(identifier) && !this.isActed(identifier) && this.isInOrder(identifier);
  }

  private isInOrder(identifier: string): boolean {
    return this.orderedCharacters().some((piece) => piece.identifier === identifier);
  }

  /**
   * Has a waiting piece step in at once. The turn it steps into is not counted as had, and is taken
   * up again when the next press of the round closes the one that stepped in. Taken side by side,
   * the phase stays the side's it was: the piece steps into it rather than opening its own.
   */
  interrupt(identifier: string): void {
    if (!this.mayInterrupt(identifier)) return;
    this.step(() => {
      const turnState = this.turnState;
      const current = turnState.phase === 'acting' ? turnState.currentIdentifier : '';
      if (current.length > 0) {
        this.hooks.turnEnded();
        const holding = this.holding;
        this.holding = { ...holding, interrupted: [...holding.interrupted, current] };
      }
      this.takeTurn(identifier, 'interruptAnnounce');
    });
  }

  private isUnderWay(): boolean {
    const phase = this.turnState.phase;
    return phase === 'acting' || phase === 'roundStart';
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
    const carried = this.carriedTurns();
    return this.allCharacters().filter(
      (character) =>
        !character.noTurn && !carried.has(character.identifier) && (includeHidden || !character.hideInventory)
    );
  }

  /**
   * The pieces that take their turn in another's, each with the one whose turn it is: a mount ridden
   * in front, and whoever sits behind on it, act in the turn of the one riding in front.
   */
  private carriedTurns(): Map<string, string> {
    const pieces = this.allCharacters().map((character) => ({
      id: character.identifier,
      ridingOn: character.ridingOn,
      rideSeat: character.rideSeat,
      mountable: character.mountable === '1',
      takesTurns: !character.noTurn && !character.hideInventory,
    }));
    const carried = new Map<string, string>();
    for (const piece of pieces) {
      const carrier = turnCarrierOf(piece.id, pieces);
      if (carrier !== '') carried.set(piece.id, carrier);
    }
    return carried;
  }

  /** The pieces that take their turn in this one's, as a mount and a second rider do in their front rider's. */
  companionsOf(identifier: string): GameCharacter[] {
    return this.companionsByCarrier().get(identifier) ?? [];
  }

  /** Every piece that takes its turn in another's, under the one whose turn it is. */
  companionsByCarrier(): Map<string, GameCharacter[]> {
    const carried = this.carriedTurns();
    const companions = new Map<string, GameCharacter[]>();
    for (const character of this.allCharacters()) {
      const carrier = carried.get(character.identifier);
      if (carrier) companions.set(carrier, [...(companions.get(carrier) ?? []), character]);
    }
    return companions;
  }

  /** Everyone on the table, whether or not they take a turn. */
  private allCharacters(): GameCharacter[] {
    return this.inventory.tableInventory.tabletopObjects as GameCharacter[];
  }

  /**
   * Everyone whose buffs the round counts down: whoever is on the table and whoever is kept in an
   * inventory, since a piece speaking from a palette carries buffs wherever it is kept. Only a
   * piece in the graveyard is out of the round.
   */
  private buffCarriers(): GameCharacter[] {
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((character) => character.location.name !== 'graveyard');
  }

  /**
   * Gives the turn to one piece.
   *
   * Taken side by side, this is how a piece takes its turn rather than a way of pointing at
   * one: whoever was up is closed off first and the piece named is opened, so every piece
   * gets its start and its end exactly once however freely the side moves.
   */
  setCurrent(identifier: string): void {
    if (!this.canTakeTurns) return;
    if (this.turnOrderMode === 'faction' && this.turnState.currentIdentifier === identifier) return;
    this.step(() => {
      const turnState = this.turnState;
      if (turnState.round < 1) turnState.round = 1;
      if (this.turnOrderMode === 'faction') {
        this.closeCurrentPiece();
        this.standOnSideOf(identifier);
        this.takeTurn(identifier);
        return;
      }
      this.release(identifier);
      turnState.phase = 'acting';
      turnState.currentIdentifier = identifier;
      turnState.turnStart = turnStartMark(identifier, Date.now());
      this.announceCharacter(identifier);
    });
  }

  /**
   * One press of the round: begins the next round, or closes whoever is up and hands the turn on.
   *
   * Once nobody is waiting the round ends. With buff countdown on, buffs run out at each turn's
   * start and end and at the round's end. Each step is announced in the first chat tab, and each is
   * recorded so it can be undone. Does nothing for a reader who may not take turns.
   */
  next(): void {
    if (!this.canTakeTurns) return;
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
        this.handOver(this.nextInOrder(order));
        return;
      }
      // Whoever was up has now had their turn, wherever in the order they were given it.
      this.endTurnOf(turnState.currentIdentifier);
      this.hooks.turnEnded();
      this.handOnward(order);
    });
  }

  /** Hands the turn on once whoever was up is done with it: back to a turn stepped into, else to the next. */
  private handOnward(order: readonly GameCharacter[]): void {
    if (this.resumeInterrupted()) return;
    this.handOver(this.nextInOrder(order));
  }

  /**
   * Takes up again the latest turn stepped into that is still to be had, and says whether there was
   * one. Its opening ran when it was first handed over, so it does not run again.
   */
  private resumeInterrupted(): boolean {
    const holding = this.holding;
    const order = new Set(this.orderedCharacters().map((piece) => piece.identifier));
    const stack = [...holding.interrupted];
    while (stack.length > 0) {
      const identifier = stack.pop()!;
      if (!order.has(identifier) || this.isActed(identifier)) continue;
      this.holding = { ...holding, interrupted: stack };
      this.release(identifier);
      this.enterActing(identifier, 'resumeAnnounce');
      return true;
    }
    if (holding.interrupted.length > 0) this.holding = { ...holding, interrupted: [] };
    return false;
  }

  /** Where the round is taken side by side, stands it on the side of the piece being handed the turn. */
  private standOnSideOf(identifier: string): void {
    if (this.turnOrderMode !== 'faction') return;
    const piece = this.objectStore.get<GameCharacter>(identifier);
    if (piece) this.turnState.currentSide = sideOfPiece(piece, this.sideOrder());
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
      this.openSide(nextSide('', this.orderedSides(), (group) => this.hasWaiting(group)));
      return;
    }

    this.closeCurrentPiece();
    this.passOnInSide();
  }

  /**
   * Hands the turn on within the side once whoever was up is done with it, and only leaves the side
   * once nobody on it is waiting to be reached. A turn stepped into is taken up first.
   */
  private passOnInSide(): void {
    if (this.resumeInterrupted()) return;
    const side = this.currentSide;
    const waiting = this.firstWaiting(this.membersOfSide(side));
    if (waiting) {
      this.takeTurn(waiting.identifier);
      return;
    }
    this.openSide(nextSide(side, this.orderedSides(), (group) => this.hasWaiting(group)));
  }

  /** Whether anybody on the side is still to be reached by the round, leaving out those waiting to step in. */
  private hasWaiting(group: SideGroup<GameCharacter>): boolean {
    return this.firstWaiting(group.members) !== null;
  }

  private membersOfSide(side: string): GameCharacter[] {
    return this.orderedSides().find((group) => group.side === side)?.members ?? [];
  }

  /** Closes off whoever was up, so no piece is left holding a turn it has finished. */
  private closeCurrentPiece(): void {
    const held = this.turnState.currentIdentifier;
    if (held.length < 1) return;
    this.endTurnOf(held);
    this.hooks.turnEnded();
  }

  /** Ends a piece's turn, and the turns of those that took theirs in it. */
  private endTurnOf(identifier: string): void {
    for (const id of [identifier, ...this.companionsOf(identifier).map((piece) => piece.identifier)]) {
      this.closeTurnOf(id);
    }
  }

  /**
   * Ends the turns of pieces taking theirs in the one being taken, ahead of it, as a mount's does
   * when the one riding it in front gets off: they have had their turn this round. Does nothing
   * while no turn is being taken, or for a piece that has had its turn already.
   */
  closeTurnsInPassing(identifiers: readonly string[]): void {
    if (this.turnState.phase !== 'acting') return;
    for (const id of identifiers) if (!this.isActed(id)) this.closeTurnOf(id);
  }

  private closeTurnOf(identifier: string): void {
    this.springGround(identifier, 'turnEnd');
    this.release(identifier);
    this.markActed(identifier);
    this.expireBuffs('turnEnd', this.actorOf(identifier));
  }

  /** Opens a side's phase, or closes the round where there is no side left to open. */
  private openSide(side: string): void {
    if (side.length < 1) {
      // Every side has been through its phase; whoever is still waiting has their turn now.
      const held = this.firstHeld(this.orderedCharacters());
      if (held) {
        this.standOnSideOf(held.identifier);
        this.takeTurn(held.identifier);
      } else {
        this.finishRound();
      }
      return;
    }
    const turnState = this.turnState;
    turnState.currentSide = side;
    turnState.phase = 'acting';
    turnState.currentIdentifier = '';
    this.chat.sendSystemNotice('round', this.t('feature.turnOrder.sidePhaseStart', { name: this.sideName(side) }));
    if (this.factionPhaseMode !== 'initiative') return;
    const first = this.firstWaiting(this.membersOfSide(side));
    if (first) this.takeTurn(first.identifier);
  }

  /**
   * The pieces that have not had their turn, in the order the round would reach them.
   *
   * Only the ones it would reach: a piece kept out of the inventory is never given a turn,
   * so counting it as waiting would leave the round asking to leave behind somebody who was
   * never coming.
   */
  unactedCharacters(): GameCharacter[] {
    if (this.turnState.phase === 'idle' || this.turnState.phase === 'roundEnd') return [];
    return this.orderedCharacters().filter((piece) => !this.isActed(piece.identifier));
  }

  /**
   * Moves the round on, once whoever is still to move has been accounted for.
   *
   * A round pressed on while pieces are still waiting takes their turn away without ever
   * showing it happening, so the ones being left behind are named and the press has to be
   * made a second time.
   */
  async advanceRound(): Promise<void> {
    if (!this.canTakeTurns) return;
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
    if (!this.canTakeTurns) return;
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
    this.chat.sendSystemNotice('round', this.t('feature.turnOrder.retreatRoundAnnounce', { n: this.turnState.round }));
  }

  /**
   * Takes the round back a step, buffs and all.
   *
   * What was done is undone from the record rather than worked out again: a round that ran
   * out took buffs off the sheet with it, and only what was written down before the step can
   * put those back.
   */
  prev(): void {
    if (!this.canTakeTurns) return;
    const steps = parseTurnHistory(this.turnState.history);
    const last = steps.pop();
    if (!last) return;

    this.applyStep(last);
    this.turnState.history = stringifyTurnHistory(steps);
    this.chat.sendSystemNotice('round', this.t('feature.turnOrder.undoAnnounce'));
  }

  /**
   * Takes the round back to before the first, announced in chat and recorded so it can be undone.
   *
   * Does nothing for a reader who may not take turns.
   */
  reset(): void {
    if (!this.canTakeTurns) return;
    this.step(() => {
      this.toIdle();
      this.chat.sendSystemNotice('round', this.t('feature.turnOrder.resetAnnounce'));
    });
  }

  /** The first in the order who has neither acted nor begun to wait, or nobody. */
  private firstWaiting(order: readonly GameCharacter[]): GameCharacter | null {
    const held = this.holding.held;
    return (
      order.find((character) => !this.isActed(character.identifier) && !held.includes(character.identifier)) ?? null
    );
  }

  /** The first in the order who is waiting to step in, or nobody. */
  private firstHeld(order: readonly GameCharacter[]): GameCharacter | null {
    const held = this.holding.held;
    return (
      order.find((character) => !this.isActed(character.identifier) && held.includes(character.identifier)) ?? null
    );
  }

  /** Who the round reaches next: the first not waiting to step in, else the first who is. */
  private nextInOrder(order: readonly GameCharacter[]): GameCharacter | null {
    return this.firstWaiting(order) ?? this.firstHeld(order);
  }

  /** Takes a piece out of waiting, and says whether its turn had begun before it began to wait. */
  private release(identifier: string): boolean {
    const holding = this.holding;
    if (!holding.held.includes(identifier)) return false;
    this.holding = {
      ...holding,
      held: holding.held.filter((id) => id !== identifier),
      begun: holding.begun.filter((id) => id !== identifier),
    };
    return holding.begun.includes(identifier);
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
      holding: turnState.holding ?? '',
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
    for (const character of this.buffCarriers()) {
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
    turnState.holding = step.holding;
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
    turnState.holding = '';
    this.chat.sendSystemNotice('round', this.t('feature.turnOrder.roundStart', { n: turnState.round }));
  }

  /**
   * Hands the turn over, and lets whatever waits on its opening run out, unless it opened already
   * before the piece began to wait.
   */
  private takeTurn(identifier: string, announcement: TurnAnnouncement = 'announce'): void {
    const begun = this.release(identifier);
    this.enterActing(identifier, announcement);
    if (begun) return;
    for (const id of [identifier, ...this.companionsOf(identifier).map((piece) => piece.identifier)]) {
      this.expireBuffs('turnStart', this.actorOf(id));
      this.hooks.turnStarted(id);
      this.springGround(id, 'turnStart');
    }
  }

  /**
   * Sets off whatever the piece taking or leaving a turn is standing on.
   *
   * The round is the only thing that knows a piece stood somewhere rather than crossed it, so
   * the round is what tells the ground. The moment is handed over rather than asked for, so
   * that the ground never has to know how a table counts its turns.
   *
   * Only the peer that pressed runs this, as with the buff countdown beside it: a room of five
   * would otherwise burn a piece five times over.
   */
  private springGround(identifier: string, moment: TriggerMoment): void {
    const character = this.objectStore.get<GameCharacter>(identifier);
    if (!(character instanceof GameCharacter)) return;
    try {
      this.triggerFire.standingOn(character, moment);
    } catch {
      // Ground that will not go off is no reason for the round to stop turning.
    }
  }

  private enterActing(identifier: string, announcement: TurnAnnouncement = 'announce'): void {
    const turnState = this.turnState;
    turnState.phase = 'acting';
    turnState.currentIdentifier = identifier;
    turnState.turnStart = turnStartMark(identifier, Date.now());
    this.announceCharacter(identifier, announcement);
  }

  /**
   * Closes the round and moves on. Only the peer that advanced it runs this, so the
   * countdown drops once even between peers.
   */
  private finishRound(): void {
    this.endRound();
    this.expireBuffs('roundEnd', { identifier: '', name: '' });
    this.hooks.turnEnded();
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
    for (const character of this.buffCarriers()) {
      const buffNames = character.buffs.expireAt(timing, acting);
      if (buffNames.length > 0) entries.push({ characterName: character.name, buffNames });
    }

    const detail = formatExpiredBuffs(entries);
    if (detail !== '') {
      this.chat.sendSystemNotice('round', this.t('feature.turnOrder.buffExpired', { detail }));
    }
  }

  private endRound(round: number = this.turnState.round): void {
    const turnState = this.turnState;
    turnState.round = Math.max(1, round);
    turnState.phase = 'roundEnd';
    turnState.currentIdentifier = '';
    turnState.currentSide = '';
    turnState.holding = '';
    this.chat.sendSystemNotice('round', this.t('feature.turnOrder.roundEnd', { n: turnState.round }));
  }

  private toIdle(): void {
    const turnState = this.turnState;
    turnState.round = 0;
    turnState.phase = 'idle';
    turnState.currentIdentifier = '';
    turnState.currentSide = '';
    turnState.actedIdentifiers = [];
    turnState.holding = '';
  }

  /**
   * Says in chat whose turn it is. A piece the players cannot see goes unnamed, since everyone
   * reads the line and a name would give away what is standing in the dark.
   */
  private announceCharacter(identifier: string, announcement: TurnAnnouncement = 'announce'): void {
    const character = this.objectStore.get<GameCharacter>(identifier);
    if (!character) return;
    this.chat.sendSystemNotice(
      'round',
      this.vision.isSeenByParty(character)
        ? this.t(`feature.turnOrder.${announcement}`, { name: character.name })
        : this.t(`feature.turnOrder.${announcement}Unseen`)
    );
  }
}
