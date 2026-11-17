import { inject, Injectable } from '@angular/core';
import type { AgentHandler } from '@axe/application/agent/agent-tool-runner.service';
import { AgentViews } from '@axe/application/agent/agent-views.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PieceStepService } from '@axe/application/tabletop/piece-step.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { ImageTag } from '@axe/domain/media/image-tag';
import { cellCenterOf } from '@axe/domain/tabletop/fog/cell-grid';
import { AgentChatTools } from '@axe/features/agent-tools/agent-chat-tools.service';
import { findOne, numberArg, textArg } from '@axe/features/agent-tools/agent-lookup';
import { AgentReadTools } from '@axe/features/agent-tools/agent-read-tools.service';

/** How long a resource change said in chat is waited for before the value is read as it stands. */
const CHANGE_WAIT_MS = 3000;
/** The characters a resource's name may not hold, since the chat syntax reads them as its own. */
const SYNTAX_IN_NAME = /[\s:+\-=>^&{}()[\]/<]/;

/**
 * The tools that change pieces and their sheets, the targets and the turn order, as the linked seat:
 * each goes the way the seat's own hand would, a move landing as a drag lands and a resource change
 * said in chat as the seat would say it, so that the table logs it as it logs the seat's.
 */
@Injectable({ providedIn: 'root' })
export class AgentPieceTools {
  private readonly read = inject(AgentReadTools);
  private readonly chatTools = inject(AgentChatTools);
  private readonly views = inject(AgentViews);
  private readonly tabletop = inject(TabletopService);
  private readonly steps = inject(PieceStepService);
  private readonly ground = inject(StandingGroundService);
  private readonly actions = inject(TabletopActionService);
  private readonly targets = inject(PieceTargetService);
  private readonly turns = inject(TurnOrderService);
  private readonly permission = inject(RolePermissionService);

  readonly handlers: Readonly<Record<string, AgentHandler>> = {
    move_piece: (args) => this.move(this.read.piece(textArg(args, 'piece')), args),
    change_resource: (args, { signal }) => this.changeResource(args, signal),
    set_sheet_value: (args) => this.setSheetValue(args),
    add_buff: (args) => {
      const piece = this.buffsOpen(this.read.piece(textArg(args, 'piece')));
      piece.buffs.addRound(textArg(args, 'name').trim(), textArg(args, 'note'), numberArg(args, 'rounds', 3));
      return this.views.piece(piece);
    },
    remove_buff: (args) => {
      const piece = this.buffsOpen(this.read.piece(textArg(args, 'piece')));
      const name = textArg(args, 'name').trim();
      if (!piece.buffs.delete(name)) {
        throw new AgentToolError('not_found', `${this.views.nameOf(piece)} has no buff named ${name}.`);
      }
      return this.views.piece(piece);
    },
    set_targets: (args) => {
      const pieces = ((args['pieces'] as string[] | undefined) ?? []).map((reference) => this.read.piece(reference));
      if (pieces.length === 0) this.targets.clear();
      else this.targets.setOnly(pieces);
      return { targets: pieces.map((piece) => ({ id: piece.identifier, name: this.views.nameOf(piece) })) };
    },
    advance_turn: (args) => this.advanceTurn(textArg(args, 'action'), textArg(args, 'piece')),
    create_piece: (args) => this.create(args),
    remove_piece: (args) => {
      const piece = this.read.piece(textArg(args, 'piece'));
      const name = this.views.nameOf(piece);
      piece.setLocation('common');
      return { removed: { id: piece.identifier, name } };
    },
  };

  private async move(piece: GameCharacter, args: Readonly<Record<string, unknown>>): Promise<unknown> {
    const table = this.tabletop.currentTable;
    const cell = this.cellAt(args);
    if (typeof args['altitude'] === 'number') piece.altitude = args['altitude'];
    await this.steps.step(piece, table, this.views.grid(table), cell, true);
    return this.views.piece(piece);
  }

  /** The cell of the table in view at the square given, or a refusal naming the table's size. */
  private cellAt(args: Readonly<Record<string, unknown>>): number {
    const square = { col: numberArg(args, 'col', 0), row: numberArg(args, 'row', 0) };
    const cell = this.views.cellOf(square);
    if (cell < 0) {
      const grid = this.views.grid();
      throw new AgentToolError(
        'invalid_input',
        `Square ${square.col}, ${square.row} is off the table, which is ${grid.cols} by ${grid.rows} squares.`
      );
    }
    return cell;
  }

  private async changeResource(args: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<unknown> {
    const piece = this.sheetOpen(this.read.piece(textArg(args, 'piece')));
    const name = textArg(args, 'name').trim();
    const by = args['by'];
    const to = args['to'];
    if ((typeof by === 'number') === (typeof to === 'number')) {
      throw new AgentToolError('invalid_input', 'Give either by or to, not both and not neither.');
    }
    if (SYNTAX_IN_NAME.test(name)) {
      throw new AgentToolError('invalid_input', `${name} cannot be changed this way; write it with set_sheet_value.`);
    }
    const slot = textArg(args, 'part') === 'maximum' ? 'max' : 'now';
    const before = piece.status.getValue(name, slot);
    if (before === null) {
      throw new AgentToolError('not_found', `${this.views.nameOf(piece)} has no resource named ${name}.`);
    }
    const mark = slot === 'max' ? '^' : '';
    const change = typeof to === 'number' ? `=${to}` : `${(by as number) < 0 ? '-' : '+'}${Math.abs(by as number)}`;
    const target = typeof to === 'number' ? to : before + (by as number);
    if (target !== before) {
      await this.chatTools.say(`:${name}${mark}${change}`, piece.identifier, '', '', signal);
      await this.settled(() => piece.status.getValue(name, slot) !== before, signal);
    }
    return { piece: this.views.nameOf(piece), resource: name, before, after: piece.status.getValue(name, slot) };
  }

  /** Waits until a test holds, a while at most. */
  private settled(holds: () => boolean, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const end = Date.now() + CHANGE_WAIT_MS;
      const check = () => {
        if (holds() || Date.now() > end || signal.aborted) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }

  private setSheetValue(args: Readonly<Record<string, unknown>>): unknown {
    const piece = this.read.piece(textArg(args, 'piece'));
    const item = this.sheetItem(piece, textArg(args, 'name'));
    writeValue(item, textArg(args, 'value'));
    return { piece: this.views.nameOf(piece), item: item.name, value: item.value };
  }

  /**
   * A piece whose sheet this seat may open, or a refusal: what a tool reads or writes of a sheet, a
   * resource among it, is kept to the pieces whose sheets the seat is shown.
   */
  private sheetOpen(piece: GameCharacter): GameCharacter {
    if (!this.views.sheetOpen(piece)) {
      throw new AgentToolError('not_allowed', `This seat may not open the sheet of ${this.views.nameOf(piece)}.`);
    }
    return piece;
  }

  /** A piece whose buffs this seat is shown, or a refusal: a piece may keep its buffs from the players. */
  private buffsOpen(piece: GameCharacter): GameCharacter {
    if (!this.views.buffsOpen(piece)) {
      throw new AgentToolError('not_allowed', `This seat is not shown the buffs of ${this.views.nameOf(piece)}.`);
    }
    return piece;
  }

  private sheetItem(piece: GameCharacter, name: string): DataElement {
    this.sheetOpen(piece);
    const root = piece.detailDataElement;
    const item = root ? DataElement.findElementByReference(root, name.trim()) : null;
    if (!item) throw new AgentToolError('not_found', `${this.views.nameOf(piece)} has no sheet item named ${name}.`);
    return item;
  }

  private async advanceTurn(action: string, reference: string): Promise<unknown> {
    switch (action) {
      case 'next':
        this.turns.next();
        break;
      case 'previous':
        this.turns.prev();
        break;
      case 'to_piece': {
        if (!reference) throw new AgentToolError('invalid_input', 'to_piece needs a piece.');
        const piece = this.read.piece(reference);
        if (!this.turns.orderedCharacters().includes(piece)) {
          throw new AgentToolError('not_found', `${this.views.nameOf(piece)} is not in the turn order.`);
        }
        this.turns.setCurrent(piece.identifier);
        break;
      }
      case 'next_round':
        await this.turns.advanceRound({ ask: false });
        break;
      case 'previous_round':
        this.turns.retreatRound();
        break;
      case 'reset':
        this.turns.reset();
        break;
      default:
        throw new AgentToolError('invalid_input', `There is no turn action called ${action}.`);
    }
    return this.read.handlers['get_turn_order']({}, { signal: new AbortController().signal });
  }

  private async create(args: Readonly<Record<string, unknown>>): Promise<unknown> {
    const table = this.tabletop.currentTable;
    const cell = this.cellAt(args);
    const imageReference = textArg(args, 'image');
    const image = imageReference
      ? findOne(
          ImageTag.searchImages([], this.permission.canSeeHidden()),
          imageReference,
          (each) => each.identifier,
          (each) => each.name,
          'image'
        ).identifier
      : '';
    const grid = this.views.grid(table);
    const centre = cellCenterOf(grid, cell);
    const piece = this.actions.createGameCharacterWith(
      { x: centre.x, y: centre.y, z: this.ground.heightPxAt(centre.x, centre.y) },
      textArg(args, 'name').trim(),
      image
    );
    if (typeof args['size'] === 'number') piece.size = args['size'];
    if (typeof args['npc'] === 'boolean') piece.isNpc = args['npc'];
    const unknown: string[] = [];
    for (const { name, value } of (args['values'] as { name: string; value: string }[] | undefined) ?? []) {
      const item = piece.detailDataElement ? DataElement.findElementByReference(piece.detailDataElement, name) : null;
      if (!item) unknown.push(name);
      else writeValue(item, value, true);
    }
    piece.update();
    await this.steps.step(piece, table, grid, cell, true);
    return { ...this.views.piece(piece), ...(unknown.length > 0 ? { unknown_items: unknown } : {}) };
  }
}

/**
 * Writes a value into a sheet item, as a number where the item holds one and the text reads as one;
 * a resource set afresh is full, its current value set with its maximum.
 */
function writeValue(item: DataElement, text: string, fresh = false): void {
  const number = Number(text);
  const numeric = text.trim() !== '' && Number.isFinite(number);
  const value = numeric && (typeof item.value === 'number' || item.isNumberResource) ? number : text;
  item.value = value;
  if (fresh && item.isNumberResource) item.currentValue = value;
}
