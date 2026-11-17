import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { type AgentChatLine, type AgentSquare, AgentViews } from '@axe/application/agent/agent-views.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/** Something that happened in the room, as the AI is told it. */
export type AgentEvent =
  | ({ readonly kind: 'chat' } & AgentChatLine)
  | {
      readonly kind: 'turn';
      readonly round: number;
      readonly phase: string;
      readonly current: { readonly id: string; readonly name: string } | null;
    }
  | { readonly kind: 'piece_added' | 'piece_removed'; readonly piece: { readonly id: string; readonly name: string } }
  | {
      readonly kind: 'piece_moved';
      readonly piece: { readonly id: string; readonly name: string };
      readonly square: AgentSquare | null;
      readonly altitude: number;
    }
  | { readonly kind: 'table_switched'; readonly table: { readonly id: string; readonly name: string } }
  | { readonly kind: 'seat_joined' | 'seat_left'; readonly seat: string };

/** What a wait returns: what happened, and the cursor to carry on from. */
export interface AgentEventBatch {
  readonly cursor: string;
  /** What happened, in order; each but a chat line with when it happened, a chat line with its own time. */
  readonly events: readonly (AgentEvent & { readonly at?: number })[];
}

/** How many events are kept to be read. */
const KEPT = 500;
/** How long a piece is left to settle after it last changed before its move is told. */
const SETTLE_MS = 600;

/** Where a piece stood when it was last told. */
interface Known {
  readonly name: string;
  readonly col: number | null;
  readonly row: number | null;
  readonly altitude: number;
}

/**
 * What has happened in the room since an AI was linked, kept to be waited for and read in order:
 * chat lines this seat may read, turns and rounds moving on, pieces this seat sees coming, going and
 * moving (a move is told once the piece has settled, at the square it ended on), the table switching
 * and seats coming and going. Nothing is kept before the log is started, nor after it is stopped.
 */
@Injectable({ providedIn: 'root' })
export class AgentEventLog {
  private readonly views = inject(AgentViews);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletop = inject(TabletopService);
  private readonly turns = inject(TurnOrderService);
  private readonly objectStore = inject(ObjectStore);

  private readonly events: (AgentEvent & { readonly seq: number; readonly at?: number })[] = [];
  private readonly running = signal(false);
  private readonly waiters = new Set<() => void>();
  private readonly settling = new Map<string, ReturnType<typeof setTimeout>>();
  private known = new Map<string, Known>();
  private seats = new Map<string, string>();
  private stops: (() => void)[] = [];
  private seq = 0;
  /** What this run of the log is told apart by in its cursors, so that a cursor from before a restart is known. */
  private run = '';
  /** Where the turn and the table stood when last told, so that only a change is told. */
  private turnKey = '';
  private tableId = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    effect(() => {
      if (!this.running()) return;
      const progress = this.turns.progress();
      untracked(() => {
        const key = `${progress.round}|${progress.phase}|${progress.currentIdentifier}`;
        if (key === this.turnKey) return;
        this.turnKey = key;
        const current = progress.currentIdentifier
          ? this.objectStore.get<GameCharacter>(progress.currentIdentifier)
          : null;
        this.push({
          kind: 'turn',
          round: progress.round,
          phase: progress.phase,
          current:
            current instanceof GameCharacter && this.views.sees(current)
              ? { id: current.identifier, name: this.views.nameOf(current) }
              : null,
        });
      });
    });
    effect(() => {
      if (!this.running()) return;
      const table = this.tabletop.currentTableVersion();
      untracked(() => {
        if (table.identifier === this.tableId) return;
        this.tableId = table.identifier;
        this.push({ kind: 'table_switched', table: { id: table.identifier, name: table.name } });
      });
    });
  }

  /** Starts keeping what happens, from now. */
  start(): void {
    if (this.running()) return;
    this.run = Date.now().toString(36);
    this.known = new Map(this.views.visiblePieces().map((piece) => [piece.identifier, this.knownOf(piece)]));
    this.seats = this.seatNames();
    const progress = this.turns.progress();
    this.turnKey = `${progress.round}|${progress.phase}|${progress.currentIdentifier}`;
    this.tableId = this.tabletop.currentTable.identifier;
    this.stops = [
      this.objectChange.messageAdded$.subscribe(({ messageIdentifier }) => this.heardLine(messageIdentifier)),
      this.objectChange.onObjectChangedForAlias([GameCharacter.aliasName], ({ identifier }) => this.settle(identifier)),
      this.objectChange.objectRemoved$.subscribe(({ identifier }) => this.settle(identifier)),
      this.objectChange.onObjectChangedForAlias([PeerCursor.aliasName], () => this.heardSeats()),
    ];
    this.running.set(true);
  }

  /** Stops keeping what happens, and lets go of what was kept. */
  stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
    for (const timer of this.settling.values()) clearTimeout(timer);
    this.settling.clear();
    this.events.length = 0;
    this.running.set(false);
    for (const wake of this.waiters) wake();
  }

  /** The cursor that stands for now: a wait given it returns what happens from here on. */
  cursorNow(): string {
    return `${this.run}.${this.seq}`;
  }

  /**
   * What happened after a cursor, waiting up to a time for something to happen where nothing has yet;
   * without a cursor, from now. Gives up early once the signal says the AI did.
   */
  async waitFor(after: string | undefined, timeoutMs: number, signal?: AbortSignal): Promise<AgentEventBatch> {
    const from = this.startOf(after);
    if (this.seq <= from && this.running()) {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          signal?.removeEventListener('abort', done);
          resolve();
        };
        const timer = setTimeout(done, timeoutMs);
        this.waiters.add(done);
        signal?.addEventListener('abort', done);
      });
    }
    const events = this.events.filter((event) => event.seq > from).map(({ seq: _seq, ...event }) => event);
    return { cursor: `${this.run}.${Math.max(from, this.seq)}`, events };
  }

  /**
   * Where a wait starts: after the event a cursor of this run names; from the start of this run for a
   * cursor of another, as one kept across the page being opened afresh is; from now for none.
   */
  private startOf(after: string | undefined): number {
    if (after === undefined) return this.seq;
    const [run, seq] = after.split('.');
    const at = Number(seq);
    if (run !== this.run || !Number.isInteger(at) || at < 0 || at > this.seq) return 0;
    return at;
  }

  private push(event: AgentEvent): void {
    this.seq++;
    this.events.push({ ...event, seq: this.seq, ...(event.kind === 'chat' ? {} : { at: Date.now() }) });
    if (this.events.length > KEPT) this.events.splice(0, this.events.length - KEPT);
    for (const wake of [...this.waiters]) wake();
  }

  private heardLine(identifier: string): void {
    const message = this.objectStore.get<ChatMessage>(identifier);
    if (!(message instanceof ChatMessage)) return;
    const line = this.views.chatLine(message);
    if (line) this.push({ kind: 'chat', ...line });
  }

  /** Tells a piece's coming, going or move once it has stopped changing for a moment. */
  private settle(identifier: string): void {
    if (!this.known.has(identifier) && !(this.objectStore.get(identifier) instanceof GameCharacter)) return;
    const pending = this.settling.get(identifier);
    if (pending) clearTimeout(pending);
    this.settling.set(
      identifier,
      setTimeout(() => {
        this.settling.delete(identifier);
        this.tellPiece(identifier);
      }, SETTLE_MS)
    );
  }

  private tellPiece(identifier: string): void {
    const piece = this.objectStore.get<GameCharacter>(identifier);
    const was = this.known.get(identifier);
    const seen = piece instanceof GameCharacter && piece.location.name === 'table' && this.views.sees(piece);
    if (!seen) {
      if (!was) return;
      this.known.delete(identifier);
      this.push({ kind: 'piece_removed', piece: { id: identifier, name: was.name } });
      return;
    }
    const now = this.knownOf(piece);
    this.known.set(identifier, now);
    if (!was) {
      this.push({ kind: 'piece_added', piece: { id: identifier, name: now.name } });
      return;
    }
    if (was.col === now.col && was.row === now.row && was.altitude === now.altitude) return;
    this.push({
      kind: 'piece_moved',
      piece: { id: identifier, name: now.name },
      square: now.col === null || now.row === null ? null : { col: now.col, row: now.row },
      altitude: now.altitude,
    });
  }

  private knownOf(piece: GameCharacter): Known {
    const square = this.views.squareOf(piece);
    return {
      name: this.views.nameOf(piece),
      col: square?.col ?? null,
      row: square?.row ?? null,
      altitude: piece.altitude,
    };
  }

  private heardSeats(): void {
    const now = this.seatNames();
    for (const [id, name] of now) if (!this.seats.has(id)) this.push({ kind: 'seat_joined', seat: name });
    for (const [id, name] of this.seats) if (!now.has(id)) this.push({ kind: 'seat_left', seat: name });
    this.seats = now;
  }

  private seatNames(): Map<string, string> {
    const mine = PeerCursor.myCursor?.identifier;
    return new Map(
      this.objectStore
        .getObjects<PeerCursor>(PeerCursor)
        .filter((cursor) => cursor.identifier !== mine)
        .map((cursor) => [cursor.identifier, cursor.name])
    );
  }
}
