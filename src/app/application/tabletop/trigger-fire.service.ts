import { inject, Injectable } from '@angular/core';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { NamedCueService } from '@axe/application/media/named-cue.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { cellColRow, cellCount, CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { cheapestPath } from '@axe/domain/tabletop/move/cheapest-path';
import { pieceCellOf, pieceCornerOn } from '@axe/domain/tabletop/move/piece-on-grid';
import { resolveRoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger, triggersOn } from '@axe/domain/tabletop/table-trigger';
import { rollTriggerAmount, triggerCatches, TriggerMoment, triggerPassTake } from '@axe/domain/tabletop/trigger-event';
import { TurnState } from '@axe/domain/tabletop/turn-state';

/** One piece of ground going off, and what it came to. */
export interface TriggerFiring {
  trigger: TableTrigger;
  /** What was taken, after the dice. Negative where the ground gave something back. */
  taken: number;
  /** The name of what it was taken from, or nothing where the piece carried no such thing. */
  from: string;
  /** What the ground threw for the piece, or nothing where it asked rather than threw. */
  rolled: number | null;
  /** Whether that throw reached what it had to reach. False wherever nothing was thrown. */
  made: boolean;
}

/**
 * Ground that goes off under a piece, set off by the seat that moved the piece.
 *
 * One seat has to be the one that springs a trap, or a room of five would spring it five
 * times. It is the seat doing the moving, since that is the one that knows a walk happened
 * at all, and what it changes is synced from there like any other change to a piece.
 */
@Injectable({ providedIn: 'root' })
export class TriggerFireService {
  private readonly tableSelecter = inject(TableSelecter);
  private readonly chat = inject(ChatMessageService);
  private readonly ailments = inject(StatusAilmentService);
  private readonly moveRange = inject(MoveRangeService);
  private readonly cues = inject(NamedCueService);
  private readonly objectStore = inject(ObjectStore);
  private readonly t = inject(TRANSLATE_FN);

  /** Where each piece was lifted from, so putting it down knows what it crossed to get here. */
  private readonly lifted = new Map<string, number>();

  /** Remembers the ground a piece was standing on before a hand took it off the table. */
  pickedUp(piece: GameCharacter): void {
    const cell = this.cellOf(piece);
    if (cell < 0) this.lifted.delete(piece.identifier);
    else this.lifted.set(piece.identifier, cell);
  }

  /**
   * Springs whatever the piece was put down on, and whatever it was carried over to get there.
   *
   * A piece carried by hand takes no way of its own: it leaves one cell and arrives at another,
   * and whatever lies between was never walked so far as the table is concerned. Left at that,
   * ground that waits for a walk to end and ground that goes off in passing come to the same
   * thing, and a hand crossing four cells of a swamp wades none of it.
   *
   * A room may ask for the way to be worked out instead: the shortest walk from where the piece
   * was lifted to where it was set down, going round whatever it could not have walked through.
   * Guessed rather than watched, which is why it is asked for rather than assumed — a master
   * shifting a dozen monsters into place would otherwise spring every trap between.
   */
  putDown(piece: GameCharacter): TriggerFiring[] {
    const from = this.lifted.get(piece.identifier);
    this.lifted.delete(piece.identifier);
    const table = this.tableSelecter.viewTable;
    if (from === undefined || !table || table.gridSize <= 0) return [];
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const to = this.cellOf(piece);
    if (to < 0 || to === from) return [];
    return this.walked(piece, grid, this.carriedWay(piece, grid, from, to));
  }

  /**
   * The way a hand is taken to have carried a piece along, which is the shortest walk it could
   * have made. The two ends alone where the room has not asked, or where no such walk exists.
   */
  private carriedWay(piece: GameCharacter, grid: CellGrid, from: number, to: number): number[] {
    const rules = resolveRoomRules(
      this.objectStore.get<Config>('Config')?.roomRuleAnswers ?? null,
      this.tableSelecter.viewTable
    );
    if (!rules.handTracesWay) return [from, to];
    const terms = this.moveRange.termsOf(piece);
    if (!terms) return [from, to];
    // A hand is not spending movement, so nothing is priced: the only bound is the board, and
    // a way that ran out halfway would leave the far end of it unaccounted for.
    const budget = cellCount(grid);
    // Only the walls are kept. What an enemy holds and what a piece may stop on are answers
    // about walking, and a hand did not walk.
    const way = cheapestPath(grid, from, to, budget, (index) => terms.blocked.get(index), {
      diagonals: terms.options.diagonals,
    });
    return way && way.length > 1 ? way : [from, to];
  }

  /**
   * The round the table is counting, or -1 where it is counting none.
   *
   * Read rather than asked of whoever keeps the round, so that the ground and the round do not
   * have to know about one another: the ground only needs a number that changes when the round
   * does.
   */
  private round(): number {
    const held = this.objectStore.get<TurnState>('TurnState');
    return held instanceof TurnState ? held.round : -1;
  }

  private cellOf(piece: GameCharacter): number {
    const table = this.tableSelecter.viewTable;
    if (!table || table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return -1;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    return pieceCellOf(grid, piece, table.gridSize);
  }

  /**
   * Springs whatever the piece walked onto, and answers with what went off.
   *
   * The way is given cell by cell, beginning where the piece set out from: ground under the
   * first cell is ground the piece was already standing on, and standing still springs
   * nothing. Ground that waits for the walk to end takes only the last cell.
   *
   * Ground that goes off the moment it is stepped on goes off for every cell of it that is
   * stepped on. Wading four cells of a poison swamp is four steps in poison, and a swamp that
   * charged once for the crossing would be a swamp it paid to wade the long way through.
   */
  walked(piece: GameCharacter, grid: CellGrid, way: readonly number[]): TriggerFiring[] {
    if (way.length < 2) return [];

    const walked = way.slice(1);
    const firings: TriggerFiring[] = [];
    for (const [index, cell] of walked.entries()) {
      firings.push(...this.stepped(piece, grid, cell, index === walked.length - 1));
    }
    return firings;
  }

  /**
   * One step of a walk, sprung as the piece arrives on the cell rather than once it is done.
   *
   * A walk drawn cell by cell is walked cell by cell, and a trap under the second cell of it
   * goes off while the piece is standing on the second cell. Springing them all at the end
   * would land four explosions on the far side of a swamp the piece waded through.
   *
   * Only the two moments a walk reaches are asked about. Ground that answers to the round is not
   * ground a walk reaches, since crossing a fire is not standing in one, and ground that is a
   * switch goes off when it is pressed, never underfoot.
   */
  stepped(piece: GameCharacter, grid: CellGrid, cell: number, ending: boolean): TriggerFiring[] {
    return this.fire(
      piece,
      grid,
      cell,
      ending,
      (trigger) => trigger.firesOn === 'enter' || (trigger.firesOn === 'stop' && ending)
    );
  }

  /**
   * Springs whatever the piece is standing on as a turn of theirs opens or closes.
   *
   * Ground that burns, chokes or heals is ground a piece stands in rather than ground it
   * crosses, and no counting of steps says how long it stood there. The round says it: the
   * piece that is up is the piece the ground has hold of.
   *
   * The round hands the moment in rather than being asked for it, so that nothing here has to
   * know how a table counts its turns.
   */
  standingOn(piece: GameCharacter, moment: TriggerMoment): TriggerFiring[] {
    const table = this.tableSelecter.viewTable;
    if (!table || table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return [];
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const cell = pieceCellOf(grid, piece, table.gridSize);
    if (cell < 0) return [];
    return this.fire(piece, grid, cell, true, (trigger) => trigger.firesOn === moment);
  }

  /** Every piece of ground over one cell that answers to `wants`, sprung in the order it is laid. */
  private fire(
    piece: GameCharacter,
    grid: CellGrid,
    cell: number,
    ending: boolean,
    wants: (trigger: TableTrigger) => boolean
  ): TriggerFiring[] {
    const table = this.tableSelecter.viewTable;
    const { col, row } = cellColRow(grid, cell);
    const firings: TriggerFiring[] = [];
    const round = this.round();
    for (const trigger of triggersOn(table)) {
      // Asked again each time: ground with one go in it is spent by the first cell of it.
      if (!trigger.hasGoFor(piece.identifier, round)) continue;
      if (!trigger.covers(col, row)) continue;
      if (!wants(trigger)) continue;
      if (!triggerCatches(trigger.catches, piece.isNpc)) continue;
      firings.push(this.spring(trigger, piece, ending, round));
    }
    return firings;
  }

  private spring(trigger: TableTrigger, piece: GameCharacter, ending: boolean, round: number): TriggerFiring {
    const thrown = this.throwFor(trigger);
    const full = rollTriggerAmount(trigger.amount);
    const taken = thrown?.made ? triggerPassTake(trigger.passAmount, full) : full;
    const held = this.resourceOf(piece, trigger.element);
    if (held) {
      const current = Number(held.currentValue);
      const most = Number(held.value);
      const next = (Number.isFinite(current) ? current : 0) - taken;
      // Given back rather than taken, a resource stops at the full it was written with.
      held.currentValue = taken < 0 && Number.isFinite(most) ? Math.min(most, next) : next;
    }
    this.leave(trigger, piece);
    trigger.spend(piece.identifier, round);
    // Ground that was to give itself away does so by being seen, which is the one change to it
    // the room is allowed to notice.
    if (trigger.reveals && !trigger.found) trigger.found = true;
    const firing = {
      trigger,
      taken,
      from: held ? held.name : '',
      rolled: thrown ? thrown.rolled : null,
      made: thrown ? thrown.made : false,
    };
    // Neither the show nor the telling is what the ground is for, so neither is allowed to
    // stop it: a room with no chat tab yet, or an effect that will not play, still takes the
    // damage it was walked into.
    try {
      this.play(firing, piece);
    } catch {
      // The effect is a flourish; the ground did its work either way.
    }
    try {
      this.announce(firing, piece);
    } catch {
      // Said or unsaid, the resource has already changed.
    }
    // Last of all, so the room reads what happened before the piece is gone from the place it
    // happened in.
    if (ending) this.carry(trigger, piece);
    return firing;
  }

  /**
   * The roll the ground makes for itself, or nothing where it asks for one instead.
   *
   * Thrown only where the ground has both dice to throw and a number to reach: a throw with
   * nothing to clear settles nothing, and the ground is better off asking for it.
   */
  private throwFor(trigger: TableTrigger): { rolled: number; made: boolean } | null {
    const dice = trigger.checkRoll.trim();
    const target = trigger.checkTarget.trim();
    if (dice.length < 1 || target.length < 1) return null;
    const bar = Number(target);
    if (!Number.isFinite(bar)) return null;
    const rolled = rollTriggerAmount(dice);
    return { rolled, made: rolled >= bar };
  }

  /**
   * Carries the piece away to the cell the ground names.
   *
   * Only ground a walk ends on carries anybody. A piece lifted off the board halfway along a
   * way it was drawn would leave the rest of that way to be walked from somewhere it no longer
   * is, and the walk would finish in a place nobody chose. It also settles what happens when
   * one pitfall opens onto another: the walk is over, so the second is ground for another
   * move to find.
   */
  private carry(trigger: TableTrigger, piece: GameCharacter): void {
    if (!trigger.warps) return;
    this.carryTo(piece, trigger.warpCol, trigger.warpRow, this.landing(trigger));
  }

  /**
   * Sets a piece down on a cell of a table, and turns the room's view to that table where it is not
   * the one being looked at, since a piece stands on every table at once and what changes is which
   * one the room is looking at.
   */
  carryTo(piece: GameCharacter, col: number, row: number, table: GameTable | null): void {
    if (!table || table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const to = cellIndexOf(grid, Math.round(col), Math.round(row));
    // Ground pointing off the board carries nobody: a piece set down outside it would be a
    // piece nothing on the table could reach.
    if (to < 0) return;
    const floors = table.identifier !== this.tableSelecter.viewTableIdentifier;
    if (!floors && pieceCellOf(grid, piece, table.gridSize) === to) return;
    const corner = pieceCornerOn(grid, piece, table.gridSize, to);
    piece.location = { name: piece.location.name, x: corner.x, y: corner.y };
    piece.update();
    // Turned to last, so that the room arrives to find the piece already standing where it fell.
    if (floors) this.tableSelecter.viewTableIdentifier = table.identifier;
  }

  /**
   * The table a pitfall opens onto: the one it names, or the one it is painted on.
   *
   * Ground naming a table this room has never had - a scene painted in one room and opened in
   * another - opens onto the table it lies on instead, which is a hole in the floor rather
   * than a hole in nothing.
   */
  private landing(trigger: TableTrigger): GameTable | null {
    const named = trigger.warpTable.trim();
    if (named.length > 0) {
      const found = this.objectStore.get<GameTable>(named);
      if (found instanceof GameTable) return found;
    }
    return this.tableSelecter.viewTable;
  }

  /**
   * Leaves the piece in whatever state the ground was told to leave it in.
   *
   * The state is looked up in the room's list so that a poison painted once is the same poison
   * everywhere. A name the room has never heard of is put on all the same, as a plain mark: a
   * master who types one in is naming a state rather than asking the room for one.
   */
  private leave(trigger: TableTrigger, piece: GameCharacter): void {
    const named = trigger.ailment.trim();
    if (named.length < 1) return;
    const known = this.ailments.ailments().find((held) => held.name === named);
    const held = known ?? newStatusAilment(named);
    const rounds = Math.max(0, Math.floor(trigger.ailmentRounds));
    this.ailments.plant(piece, rounds > 0 ? { ...held, rounds } : held);
  }

  /**
   * Sets off whatever the ground was told to play, on the piece that set it off.
   *
   * Each of the three is tried on its own, so a cut-in nobody has made does not take the sound
   * down with it.
   */
  private play(firing: TriggerFiring, piece: GameCharacter): void {
    const trigger = firing.trigger;
    this.cues.playEffect(trigger.effect, [piece]);
    this.cues.playSound(trigger.sound);
    this.cues.launchCutIn(trigger.cutIn);
  }

  /**
   * Says in the room that the ground went off.
   *
   * Ground that nobody was shown is still ground that took something, and a table that is not
   * told has no way of knowing whether anything happened at all. What is said is what was
   * taken and from whom, never where the ground was: a trap that announces its own cell is a
   * trap the party has found.
   *
   * Ground given a line of its own says that instead of saying merely that it went off, and
   * still says what it took on a line after it: the description is the master's telling, and
   * what a piece lost is the table's reckoning.
   */
  private announce(firing: TriggerFiring, piece: GameCharacter): void {
    const trigger = firing.trigger;
    const name = trigger.name.trim();
    const called = name.length > 0 ? name : this.t('feature.tabletop.trigger.unnamed');
    const said = trigger.say.trim();
    if (said.length > 0) this.tell(trigger, this.t('feature.tabletop.trigger.said', { trigger: called, say: said }));
    if (firing.rolled !== null) {
      this.tell(
        trigger,
        this.t('feature.tabletop.trigger.rolled', {
          trigger: called,
          piece: piece.name,
          rolled: firing.rolled,
          target: trigger.checkTarget.trim(),
          outcome: this.t(firing.made ? 'feature.tabletop.trigger.made' : 'feature.tabletop.trigger.missed'),
        })
      );
    }
    this.ask(trigger, piece, called);
    if (firing.from.length > 0) {
      this.tell(
        trigger,
        this.t('feature.tabletop.trigger.tookFrom', {
          trigger: called,
          piece: piece.name,
          amount: Math.abs(firing.taken),
          element: firing.from,
          verb: this.t(firing.taken < 0 ? 'feature.tabletop.trigger.gave' : 'feature.tabletop.trigger.took'),
        })
      );
      return;
    }
    // Ground that took nothing and described nothing still says it was walked into, or a table
    // would have no way of telling a trap that did nothing from ground that is not trapped.
    if (said.length < 1)
      this.tell(trigger, this.t('feature.tabletop.trigger.sprang', { trigger: called, piece: piece.name }));
  }

  /**
   * Asks whoever walked in for the roll the ground wants of them.
   *
   * Asked for rather than rolled. Which dice a table throws, and what counts as making it, are
   * the game's business: a piece of ground that rolled for itself would have to know one game's
   * terms, and a room playing another would be handed an answer in the wrong language.
   */
  private ask(trigger: TableTrigger, piece: GameCharacter, called: string): void {
    const asked = trigger.check.trim();
    if (asked.length < 1) return;
    // Ground that threw for itself has already said what it rolled; asking as well would have
    // the room roll for something already settled.
    if (trigger.checkRoll.trim().length > 0 && trigger.checkTarget.trim().length > 0) return;
    const target = trigger.checkTarget.trim();
    const key = target.length > 0 ? 'feature.tabletop.trigger.asksFor' : 'feature.tabletop.trigger.asks';
    this.tell(trigger, this.t(key, { trigger: called, piece: piece.name, check: asked, target }));
  }

  /**
   * Writes one line for a piece of ground, held back from the room where the ground is quiet.
   *
   * A held-back line is sent whole and kept from the room by the view, so the master reads it
   * and nobody else does. It is sent from nobody in particular on purpose: sent from the seat
   * that moved, the very player who was not to notice would be the one who could read it.
   */
  private tell(trigger: TableTrigger, text: string): void {
    if (trigger.silent) this.chat.sendSecretSystemMessageToMainTab(text);
    else this.chat.sendSystemMessageToMainTab(text);
  }

  private resourceOf(piece: GameCharacter, name: string): DataElement | null {
    const root = piece.rootDataElement;
    if (!root || name.length < 1) return null;
    const held = DataElement.findElementByReference(root, name);
    return held && held.isNumberResource ? held : null;
  }
}
