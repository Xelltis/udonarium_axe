import { computed, DestroyRef, inject, Injectable } from '@angular/core';
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
import { TriggerMoment } from '@axe/domain/tabletop/trigger-event';
import { changedBuffs, parseTurnHistory, stringifyTurnHistory, TurnStep } from '@axe/domain/tabletop/turn-history';
import {
  roundAdvance,
  roundCloseInPassing,
  roundGiveTurn,
  roundHold,
  roundInterrupt,
  roundNext,
  roundReset,
  roundSide,
  TurnAnnouncement,
  TurnEffect,
  TurnLive,
  TurnOutcome,
  TurnSnapshot,
  TurnTable,
} from '@axe/domain/tabletop/turn-machine';
import { FactionPhaseMode, TurnOrderMode } from '@axe/domain/tabletop/turn-order-mode';
import { buildTurnRoster, mayHoldTurn, mayInterruptTurn, TurnRoster } from '@axe/domain/tabletop/turn-roster';
import { describeSide, normalizeFactionOrder, SideGroup, sideOfPiece } from '@axe/domain/tabletop/turn-side';
import { readTurnHolding, TurnHolding, TurnPhase, TurnState, writeTurnHolding } from '@axe/domain/tabletop/turn-state';

/** How many of the pieces still waiting are named before the rest are counted. */
const UNACTED_NAMES_SHOWN = 8;

/** Where the round stands, read in one go for drawing it. */
export interface TurnProgress {
  /** The round being played, which is 0 before the first has begun. */
  readonly round: number;
  /** Where in the round the table is. */
  readonly phase: TurnPhase;
  /** The piece whose turn it is, or empty when nobody is up. */
  readonly currentIdentifier: string;
  /** Who has had their turn this round. */
  readonly acted: ReadonlySet<string>;
  /** The pieces waiting to step in this round. */
  readonly held: ReadonlySet<string>;
  /** Whether the round can be put back a step. */
  readonly canUndo: boolean;
  /** Whether buffs count down as turns and rounds pass. */
  readonly buffDecay: boolean;
}

/**
 * The round as the room plays it: who is up, who has had their turn, and the presses that move it on.
 *
 * What a press does is worked out by the round's state machine in the domain. This service hands it
 * the round and the table as they stand, then writes what it decided and does what it asked for in
 * the order it asked: the chat's announcements, the buffs running out, the ground going off and the
 * hooks that wait on a turn. Each press is recorded so it can be undone.
 */
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
    return roundSide(this.snapshot(), this.turnTable());
  }

  /** The sides the round goes round, each with the pieces on it. Empty unless it is taken side by side. */
  orderedSides(includeHidden = false): readonly SideGroup<GameCharacter>[] {
    return this.roster(includeHidden).sides;
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
    return this.rolePermission.canEditTabletop();
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

  /** The pieces waiting to step in this round, in the order they began to wait. */
  get heldIdentifiers(): readonly string[] {
    return this.holding.held;
  }

  /** Whether this piece is waiting to step in. */
  isHeld(identifier: string): boolean {
    return this.holding.held.includes(identifier);
  }

  /**
   * Where the round stands, worked out again only as the round is written, for a screen to draw it
   * from without watching the room's round itself.
   */
  readonly progress = computed<TurnProgress>(() => {
    this.objectChange.versionOf('TurnState')();
    const turnState = this.turnState;
    return {
      round: turnState.round,
      phase: turnState.phase,
      currentIdentifier: turnState.currentIdentifier,
      acted: new Set(turnState.actedIdentifiers),
      held: new Set(this.holding.held),
      canUndo: this.canUndo,
      buffDecay: turnState.buffDecay,
    };
  });

  /**
   * Whether the piece may wait to step in later: a round is under way, the round reaches it, and it
   * has neither had its turn, begun to wait already, nor had its turn stepped into, which it takes
   * up again in its own time.
   */
  mayHold(identifier: string): boolean {
    return this.canTakeTurns && mayHoldTurn(this.snapshot(), this.turnTable().order, identifier);
  }

  /**
   * Has a piece wait to step in later in the round.
   *
   * A waiting piece is passed over by the round, and has its turn once nobody else is waiting, unless
   * it steps in before. A piece whose turn it is passes the turn on without it counting as had, and
   * the turn's opening does not run again when it comes back.
   */
  hold(identifier: string): void {
    if (!this.canTakeTurns) return;
    this.press((state, table, live) => roundHold(state, table, identifier, live));
  }

  /**
   * Whether the piece may step in now, which a piece still waiting may while the round is under way
   * and still reaches it.
   */
  mayInterrupt(identifier: string): boolean {
    return this.canTakeTurns && mayInterruptTurn(this.snapshot(), this.turnTable().order, identifier);
  }

  /**
   * Has a waiting piece step in at once. The turn it steps into is not counted as had, and is taken
   * up again when the next press of the round closes the one that stepped in. Taken side by side,
   * the phase stays the side's it was: the piece steps into it rather than opening its own.
   */
  interrupt(identifier: string): void {
    if (!this.canTakeTurns) return;
    this.press((state, table, live) => roundInterrupt(state, table, identifier, live));
  }

  /**
   * The pieces the turn goes round, in the order the inventory lists them.
   *
   * Taken side by side, the same pieces come back gathered under their sides and in the
   * order the sides are taken, so walking the list walks the round.
   */
  orderedCharacters(includeHidden = false): readonly GameCharacter[] {
    return this.roster(includeHidden).order;
  }

  /** The pieces that take their turn in this one's, as a mount and a second rider do in their front rider's. */
  companionsOf(identifier: string): readonly GameCharacter[] {
    return this.roster().companions.get(identifier) ?? [];
  }

  /** Every piece that takes its turn in another's, under the one whose turn it is. */
  companionsByCarrier(): ReadonlyMap<string, readonly GameCharacter[]> {
    return this.roster().companions;
  }

  private roster(includeHidden = false): TurnRoster<GameCharacter> {
    const mode = this.turnOrderMode;
    return buildTurnRoster(this.allCharacters(), {
      mode,
      sideOrder: mode === 'faction' ? this.sideOrder() : [],
      includeHidden,
    });
  }

  /** The round's pieces by identifier, as the state machine reads them for a press made now. */
  private turnTable(): TurnTable {
    const mode = this.turnOrderMode;
    const sideOrder = mode === 'faction' ? this.sideOrder() : [];
    const companions = this.companionsByCarrier();
    const ids = (pieces: readonly GameCharacter[]) => pieces.map((piece) => piece.identifier);
    return {
      mode,
      factionPhaseMode: this.factionPhaseMode,
      order: ids(this.orderedCharacters()),
      sides: this.orderedSides().map((group) => ({ side: group.side, members: ids(group.members) })),
      companionsOf: (identifier) => ids(companions.get(identifier) ?? []),
      sideOf: (identifier) => {
        const piece = this.objectStore.get<GameCharacter>(identifier);
        return piece ? sideOfPiece(piece, sideOrder) : null;
      },
      now: Date.now(),
    };
  }

  /** Where the round stands, as the state machine reads it. */
  private snapshot(): TurnSnapshot {
    const turnState = this.turnState;
    return {
      round: turnState.round,
      phase: turnState.phase,
      currentIdentifier: turnState.currentIdentifier,
      currentSide: turnState.currentSide,
      acted: turnState.actedIdentifiers,
      holding: this.holding,
      turnStart: turnState.turnStart,
    };
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
    this.press((state, table, live) => roundGiveTurn(state, table, identifier, live));
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
    this.press(roundNext);
  }

  /**
   * Ends the turns of pieces taking theirs in the one being taken, ahead of it, as a mount's does
   * when the one riding it in front gets off: they have had their turn this round. Does nothing
   * while no turn is being taken, or for a piece that has had its turn already.
   */
  closeTurnsInPassing(identifiers: readonly string[]): void {
    roundCloseInPassing(this.snapshot(), this.turnTable(), identifiers, this.live);
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
    this.press(roundAdvance);
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
    this.press(roundReset);
  }

  /**
   * The round as a press carries itself out on: each thing done at once, and the round read back
   * after whatever else may move it, so that a turn closed by the ground going off under a piece
   * stays closed.
   */
  private readonly live: TurnLive = {
    perform: (effect) => this.perform([effect]),
    read: () => this.snapshot(),
  };

  /** Carries a press of the round out from where it stands, as one step of the record. */
  private press(work: (state: TurnSnapshot, table: TurnTable, live: TurnLive) => TurnOutcome | null): void {
    this.step(() => work(this.snapshot(), this.turnTable(), this.live) !== null);
  }

  /**
   * Runs one step of the round and writes down what it was standing on beforehand.
   *
   * The buffs are read on either side of it and only the pieces whose own changed are kept,
   * so a press costs the record one line rather than the whole table.
   */
  private step(work: () => boolean): void {
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

    if (!work()) return;

    before.buffs = changedBuffs(buffsBefore, this.captureBuffs());
    const steps = parseTurnHistory(this.turnState.history);
    steps.push(before);
    this.turnState.history = stringifyTurnHistory(steps);
  }

  /** Does what a press of the round asked for, in the order it asked. */
  private perform(effects: readonly TurnEffect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'write':
          this.write(effect.fields);
          break;
        case 'announce':
          this.announceCharacter(effect.identifier, effect.announcement);
          break;
        case 'roundStart':
          this.chat.sendSystemNotice('round', this.t('feature.turnOrder.roundStart', { n: effect.round }));
          break;
        case 'roundEnd':
          this.chat.sendSystemNotice('round', this.t('feature.turnOrder.roundEnd', { n: effect.round }));
          break;
        case 'sidePhaseStart':
          this.chat.sendSystemNotice(
            'round',
            this.t('feature.turnOrder.sidePhaseStart', { name: this.sideName(effect.side) })
          );
          break;
        case 'reset':
          this.chat.sendSystemNotice('round', this.t('feature.turnOrder.resetAnnounce'));
          break;
        case 'buffs':
          this.expireBuffs(effect.timing, this.actorOf(effect.identifier));
          break;
        case 'ground':
          this.springGround(effect.identifier, effect.moment);
          break;
        case 'turnStarted':
          this.hooks.turnStarted(effect.identifier);
          break;
        case 'turnEnded':
          this.hooks.turnEnded();
          break;
      }
    }
  }

  private write(fields: Partial<TurnSnapshot>): void {
    const turnState = this.turnState;
    if (fields.round !== undefined) turnState.round = fields.round;
    if (fields.phase !== undefined) turnState.phase = fields.phase;
    if (fields.currentIdentifier !== undefined) turnState.currentIdentifier = fields.currentIdentifier;
    if (fields.currentSide !== undefined) turnState.currentSide = fields.currentSide;
    if (fields.acted !== undefined) turnState.actedIdentifiers = [...fields.acted];
    if (fields.holding !== undefined) turnState.holding = writeTurnHolding(fields.holding);
    if (fields.turnStart !== undefined) turnState.turnStart = fields.turnStart;
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

  /**
   * Counts down whatever this moment belongs to. A buff pinned to a trigger character
   * waits for that character's turn, so the whole table is asked and only the buffs whose
   * moment it is answer.
   */
  private actorOf(identifier: string): BuffTurnActor {
    const character = this.objectStore.get<GameCharacter>(identifier);
    return { identifier, name: character?.name ?? '' };
  }

  /**
   * Runs out the buffs whose moment it is. Only the peer that pressed runs this, so the countdown
   * drops once even between peers.
   */
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

  /**
   * Says in chat whose turn it is. A piece the players cannot see goes unnamed, since everyone
   * reads the line and a name would give away what is standing in the dark.
   */
  private announceCharacter(identifier: string, announcement: TurnAnnouncement): void {
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
