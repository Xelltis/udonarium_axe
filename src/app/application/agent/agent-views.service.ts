import { inject, Injectable, signal } from '@angular/core';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { VisibleChatTabsService } from '@axe/application/chat/visible-chat-tabs.service';
import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { SYSTEM_CHAT_TAB_IDENTIFIER } from '@axe/domain/chat/constants';
import { DataElement } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { cellCenterOf, cellColRow, type CellGrid, cellIndexAt, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { moveGridOf } from '@axe/domain/tabletop/move/move-grid';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';

/** A square of the table as the AI names it: counted from 1, col to the east and row to the south. */
export interface AgentSquare {
  readonly col: number;
  readonly row: number;
}

/** A resource of a piece: its current value and its maximum. */
export interface AgentResource {
  readonly name: string;
  readonly current: number | string;
  readonly max: number | string;
}

/** A buff on a piece. */
export interface AgentBuff {
  readonly name: string;
  readonly note: string;
  readonly rounds: number | string;
}

/** A piece on the table, as the AI is told it. */
export interface AgentPiece {
  readonly id: string;
  readonly name: string;
  readonly square: AgentSquare | null;
  readonly altitude: number;
  readonly size: number;
  readonly owner: string;
  readonly npc: boolean;
  readonly targeted: boolean;
  readonly resources: readonly AgentResource[];
  readonly buffs: readonly AgentBuff[];
  /** For a game master's seat: whether the players do not see it. */
  readonly hidden?: true;
}

/** An item of a sheet, with the items under it. */
export interface AgentSheetItem {
  readonly name: string;
  readonly value: number | string;
  readonly current?: number | string;
  readonly items?: readonly AgentSheetItem[];
}

/** A chat line, as the AI is told it. */
export interface AgentChatLine {
  readonly id: string;
  readonly tab: string;
  readonly time: number;
  readonly speaker: string;
  /** The seat that said it, by name: the person behind a piece speaking. None for a line the table put out. */
  readonly seat?: string;
  /** Whom a whisper is to, by name. */
  readonly to?: readonly string[];
  /** What it says, or null for a secret roll this seat may not read yet. */
  readonly text: string | null;
  /** The system rolled under, and whether the roll succeeded where it was one that can. */
  readonly dice?: { readonly system: string; readonly outcome?: string };
  readonly secret?: true;
  readonly system?: true;
  /** Whether an AI linked to the speaker's seat sent it. */
  readonly by_ai: boolean;
}

/**
 * How the room is put to an AI: pieces with their squares, sheets as trees of named values, chat
 * lines with their dice, all as this seat sees them and no more. A piece hidden from the seat, a sheet
 * it may not open, a whisper not to it and a secret roll not yet shown are left out or blanked, as on
 * the seat's own screen.
 */
@Injectable({ providedIn: 'root' })
export class AgentViews {
  private readonly tabletop = inject(TabletopService);
  private readonly vision = inject(VisionService);
  private readonly names = inject(PieceNameService);
  private readonly disclosure = inject(DisclosureService);
  private readonly permission = inject(RolePermissionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly visibleTabs = inject(VisibleChatTabsService);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * The chat tabs the AI is let read, by identifier, or null for every tab the seat reads. Set while a
   * game master runs with tabs chosen for it to listen to. This is the one place the choice is kept:
   * whatever hands the AI lines it did not write, as they are said or as it reads back, takes them
   * through {@link lineRead}, so no road to the talk it is kept from is left open beside the others.
   */
  readonly tabsRead = signal<ReadonlySet<string> | null>(null);

  /**
   * Whether a line is the AI's to read where it is kept to some tabs: a line of one of those tabs, a
   * line of the tab the table puts its own notices in, which is nobody's talk and no tab to choose, or
   * a whisper to this seat, wherever it was said. It goes by the tab alone and never by what kind of
   * line it is: the answer to a roll or to a change of a resource is said in the tab it was asked in,
   * and is kept from the AI with the talk of that tab.
   */
  private reads(message: ChatMessage): boolean {
    const read = this.tabsRead();
    if (!read || read.has(message.tabIdentifier) || message.tabIdentifier === SYSTEM_CHAT_TAB_IDENTIFIER) return true;
    const me = PeerCursor.myCursor?.userId ?? '';
    return me !== '' && message.sendTo.includes(me);
  }

  /**
   * A chat line as the AI is handed it among what others said: as this seat may read it, or null for
   * one said in a tab this seat's role may not read, whisper or not, one it may not see at all or one
   * the AI is kept from. A line the AI wrote itself is told back to it by {@link chatLine}, whichever
   * tab it wrote it in.
   */
  lineRead(message: ChatMessage): AgentChatLine | null {
    return this.inReadableTab(message) && this.reads(message) ? this.chatLine(message) : null;
  }

  /** Whether a line was said in a tab this seat's role may read, one of the tabs its chat shows. */
  private inReadableTab(message: ChatMessage): boolean {
    const tab = message.parent;
    return tab instanceof ChatTab && this.visibleTabs.readableNow().includes(tab);
  }

  /** The grid the pieces of the table in view move over. */
  grid(table: GameTable = this.tabletop.currentTable): CellGrid {
    return moveGridOf(table);
  }

  /** The square a piece stands on, or null for one off the grid. */
  squareOf(piece: GameCharacter, table: GameTable = this.tabletop.currentTable): AgentSquare | null {
    const grid = this.grid(table);
    const index = pieceCellOf(grid, piece, table.gridSize);
    if (index < 0) return null;
    const { col, row } = cellColRow(grid, index);
    return { col: col + 1, row: row + 1 };
  }

  /** The square a point of the table in view lies in, or null for a point off the grid. */
  squareAt(x: number, y: number, table: GameTable = this.tabletop.currentTable): AgentSquare | null {
    const grid = this.grid(table);
    const index = cellIndexAt(grid, x, y);
    if (index < 0) return null;
    const { col, row } = cellColRow(grid, index);
    return { col: col + 1, row: row + 1 };
  }

  /** The middle of a square of the table in view, or null for a square off it. */
  middleOf(square: AgentSquare, table: GameTable = this.tabletop.currentTable): { x: number; y: number } | null {
    const grid = this.grid(table);
    const index = this.cellOf(square, table);
    return index < 0 ? null : cellCenterOf(grid, index);
  }

  /** The index of a square in the grid of the table in view, or -1 for one off it. */
  cellOf(square: AgentSquare, table: GameTable = this.tabletop.currentTable): number {
    return cellIndexOf(this.grid(table), square.col - 1, square.row - 1);
  }

  /** The pieces on the table this seat sees. */
  visiblePieces(): GameCharacter[] {
    return this.tabletop.characters.filter((piece) => this.vision.isTokenVisible(piece));
  }

  /** Whether this seat sees a piece: on the table and in sight, or anywhere off it. */
  sees(piece: GameCharacter): boolean {
    return this.vision.mayBeListed(piece);
  }

  /** A piece's name as this seat is shown it. */
  nameOf(piece: GameCharacter): string {
    return this.names.shown(piece);
  }

  /**
   * A seat's name by its user: this seat's own where the user is this device's, as a line said here
   * carries the network's user before the cursor is told it; a seat that has left is named unknown.
   */
  seatName(userId: string): string {
    const seat = PeerCursor.findByUserId(userId);
    if (seat) return seat.name;
    const mine = PeerCursor.myCursor;
    if (mine && (userId === getPeerContext().userId || userId === mine.userId)) return mine.name;
    return '(a seat no longer here)';
  }

  piece(piece: GameCharacter): AgentPiece {
    const sheetOpen = this.sheetOpen(piece);
    const hidden = this.permission.canSeeHidden() && piece.stealth === '1';
    return {
      id: piece.identifier,
      name: this.nameOf(piece),
      square: piece.location.name === 'table' ? this.squareOf(piece) : null,
      altitude: piece.altitude,
      size: piece.size,
      owner: piece.owner ? this.seatName(piece.owner) : '',
      npc: piece.isNpc,
      targeted: piece.targeted,
      resources: sheetOpen ? this.resourcesOf(piece) : [],
      buffs: this.buffsOpen(piece) ? this.buffsOf(piece) : [],
      ...(hidden ? { hidden: true as const } : {}),
    };
  }

  /** Whether this seat may open a piece's sheet: the game master and the seat that owns it always may. */
  sheetOpen(piece: GameCharacter): boolean {
    return this.disclosure.canView(piece);
  }

  /** Whether this seat is shown a piece's buffs: a piece may keep them from the players. */
  buffsOpen(piece: GameCharacter): boolean {
    return !piece.hideBuff || this.permission.canSeeHidden();
  }

  /** A piece's sheet as a tree of named values, or null where this seat may not open it. */
  sheet(piece: GameCharacter): readonly AgentSheetItem[] | null {
    if (!this.sheetOpen(piece)) return null;
    const root = piece.detailDataElement;
    return root ? root.children.map((item) => this.sheetItem(item)) : [];
  }

  /** A chat line as this seat may read it, or null for one it may not see at all. */
  chatLine(message: ChatMessage): AgentChatLine | null {
    if (!message.isShownInChat) return null;
    const unread = message.isSecret && !message.isSendFromSelf && !(Number(message.disclosedAt) > 0);
    const roll = message.rollDetail;
    const to = message.sendTo.map((userId) => this.seatName(userId));
    return {
      id: message.identifier,
      tab: message.tabIdentifier,
      time: message.timestamp,
      speaker: decodeI18nMessage(message.name, this.t),
      ...(message.isSystem || !message.from ? {} : { seat: this.seatName(message.from) }),
      ...(to.length > 0 ? { to } : {}),
      text: unread ? null : decodeI18nMessage(message.text, this.t),
      ...(roll && !unread ? { dice: { system: roll.system, ...(roll.outcome ? { outcome: roll.outcome } : {}) } } : {}),
      ...(message.isSecret ? { secret: true as const } : {}),
      ...(message.isSystem ? { system: true as const } : {}),
      by_ai: message.isByAi,
    };
  }

  /** Every table of the room. */
  tables(): GameTable[] {
    return this.objectStore.getObjects<GameTable>(GameTable);
  }

  private resourcesOf(piece: GameCharacter): AgentResource[] {
    const resources: AgentResource[] = [];
    const visit = (item: DataElement) => {
      if (item.isNumberResource) {
        resources.push({
          name: item.name,
          current: numberOrText(item.currentValue),
          max: numberOrText(item.effectiveMax ?? item.value),
        });
      }
      for (const child of item.children) visit(child);
    };
    for (const item of piece.detailDataElement?.children ?? []) visit(item);
    return resources;
  }

  private buffsOf(piece: GameCharacter): AgentBuff[] {
    return piece.buffs.list().map((buff) => ({
      name: buff.name,
      note: String(buff.currentValue ?? ''),
      rounds: buff.value,
    }));
  }

  private sheetItem(item: DataElement): AgentSheetItem {
    const items = item.children.map((child) => this.sheetItem(child));
    return {
      name: item.name,
      value: item.value,
      ...(item.isNumberResource ? { current: numberOrText(item.currentValue) } : {}),
      ...(items.length > 0 ? { items } : {}),
    };
  }
}

/** A value as a number where it is written as one, as a sheet keeps numbers as text as often as not. */
function numberOrText(value: number | string): number | string {
  if (typeof value === 'number') return value;
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) ? number : value;
}
