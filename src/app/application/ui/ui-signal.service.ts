import { computed, Injectable, signal } from '@angular/core';
import { PERF_ROTATION_NOTIFY, perfCounters } from '@axe/core/util/perf-counters';

export interface TargetChangeData {
  identifier: string;
  className: string;
}

export interface NoteResizeData {
  identifier: string;
  timestamp: number;
}

export interface JumpIndexData {
  targetId: string;
  lineNo: number;
  timestamp: number;
}

export interface TableViewRotation {
  x: number;
  y: number;
  z: number;
}

export interface ChatInputTextRequest {
  text: string;
  timestamp: number;
}

export interface ChatReplyRequest {
  messageIdentifier: string;
  timestamp: number;
}

export interface ChatQuoteRequest {
  messageIdentifier: string;
  timestamp: number;
}

export interface ChatJumpRequest {
  messageIdentifier: string;
  timestamp: number;
}

/** How far the table is turned about the vertical before anybody turns it. */
const DEFAULT_VIEW_ROTATE_Z = 10;

function sameRotation(a: TableViewRotation | null, b: TableViewRotation | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

@Injectable({
  providedIn: 'root',
})
export class UiSignalService {
  readonly chatRedrawVersion = signal(0);
  readonly terrainGridShowVersion = signal(0);
  readonly terrainGridEndVersion = signal(0);
  readonly targetChange = signal<TargetChangeData | null>(null);
  readonly noteResizeRequest = signal<NoteResizeData | null>(null);
  readonly jumpIndexRequest = signal<JumpIndexData | null>(null);
  readonly tableViewRotation = signal<TableViewRotation | null>(null, { equal: sameRotation });

  /**
   * How far the table is turned about the vertical alone.
   *
   * Most of what stands on the table only has to be turned back about that one axis, and a
   * tilt is a far commoner gesture than a turn. Read from here, those pieces are left alone
   * while the table is tilted rather than being asked to work out a transform again.
   */
  readonly tableViewRotationZ = computed(() => this.tableViewRotation()?.z ?? DEFAULT_VIEW_ROTATE_Z);
  readonly chatInputTextRequest = signal<ChatInputTextRequest | null>(null);
  readonly chatReplyRequest = signal<ChatReplyRequest | null>(null);
  readonly chatQuoteRequest = signal<ChatQuoteRequest | null>(null);
  readonly chatJumpRequest = signal<ChatJumpRequest | null>(null);

  /** Asks every chat tab to redraw its messages, after a change to how messages are displayed. */
  notifyChatRedraw(): void {
    this.chatRedrawVersion.update((v) => v + 1);
  }

  /** Tells terrain to show its grid, as something starts being dragged on the table. */
  notifyTerrainGridShow(): void {
    this.terrainGridShowVersion.update((v) => v + 1);
  }

  /**
   * Tells terrain the drag is over, so its grid goes back to what the table's grid setting says.
   */
  notifyTerrainGridEnd(): void {
    this.terrainGridEndVersion.update((v) => v + 1);
  }

  /**
   * Tells this client's views that a piece's target mark changed, so marks and target lists are
   * read again.
   */
  notifyTargetChange(identifier: string, className: string): void {
    this.targetChange.set({ identifier, className });
  }

  /** Asks the text note with this identifier to fit its height to its content again. */
  requestNoteResize(identifier: string): void {
    this.noteResizeRequest.set({ identifier, timestamp: Date.now() });
  }

  /**
   * Asks the chat palette of a piece to scroll to a line, as picked from its index in a context
   * menu.
   */
  requestJumpIndex(targetId: string, lineNo: number): void {
    this.jumpIndexRequest.set({ targetId, lineNo, timestamp: Date.now() });
  }

  /**
   * Publishes how far the table view is turned about each axis, for whatever turns to face the
   * viewer. An unchanged rotation wakes nothing.
   */
  notifyTableViewRotation(x: number, y: number, z: number): void {
    perfCounters.bump(PERF_ROTATION_NOTIFY);
    this.tableViewRotation.set({ x, y, z });
  }

  /** Appends text to the chat input, after a space when it already holds some. */
  requestChatInputText(text: string): void {
    this.chatInputTextRequest.set({ text, timestamp: Date.now() });
  }

  /** Makes a chat message the one the chat input replies to, and focuses the input. */
  requestChatReply(messageIdentifier: string): void {
    this.chatReplyRequest.set({ messageIdentifier, timestamp: Date.now() });
  }

  /** Drops the message the chat input was replying to. */
  clearChatReply(): void {
    this.chatReplyRequest.set(null);
  }

  /**
   * Makes a chat message the one the chat input quotes, and focuses the input. Ignored by an input
   * that does not quote.
   */
  requestChatQuote(messageIdentifier: string): void {
    this.chatQuoteRequest.set({ messageIdentifier, timestamp: Date.now() });
  }

  /** Drops the quoted message from the chat input. */
  clearChatQuote(): void {
    this.chatQuoteRequest.set(null);
  }

  /** Asks the chat log to scroll to a message and highlight it for a moment. */
  requestChatJump(messageIdentifier: string): void {
    this.chatJumpRequest.set({ messageIdentifier, timestamp: Date.now() });
  }

  /**
   * Marks a jump to a message as done, so chat messages drawn afterwards do not scroll to it again.
   */
  clearChatJump(): void {
    this.chatJumpRequest.set(null);
  }
}
