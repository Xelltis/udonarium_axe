import { AuthorityEvent } from '@axe/core/network/server/server-protocol';
import type { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canMergeReplayEvents, mergeReplayEvents } from '@axe/domain/replay/replay-coalescer';
import { cloneSyncData, type SyncData, syncValueOf } from '@axe/domain/replay/replay-diff';
import {
  PUBLIC_VISIBILITY,
  type ReplayActorSnapshot,
  ReplayDetailLevel,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
  type ReplayTargetSnapshot,
  type ReplayVisibility,
} from '@axe/domain/replay/replay-event';
import { REPLAY_CAUGHT_UP_FLAG, REPLAY_PART_FLAG } from '@axe/domain/replay/replay-event-category';
import {
  interpretObjectChange,
  interpretObjectRemove,
  interpretSignal,
  isIgnoredReplayEvent,
  isRecordableKind,
  type ReplayDraft,
  shouldDiffObjectChange,
} from '@axe/domain/replay/replay-interpreter';
import { replayObjectSnapshotsOf } from '@axe/domain/replay/replay-keyframe';
import { pieceOf, targetNameOf } from '@axe/domain/replay/replay-piece';
import {
  visibilityOfChatLine,
  visibilityOfDisclosure,
  visibilityOfSyncData,
} from '@axe/domain/replay/replay-visibility';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/** How long after recording begins a peer's copy of the room is taken as the room catching up. */
export const REPLAY_BASELINE_GRACE_MS = 5_000;
/** How far another browser's clock may run behind ours for a line it stamped to still count as new. */
export const REPLAY_CLOCK_SKEW_MS = 2_000;
const CHAT_ALIAS = 'chat';
const PEER_CURSOR_ALIAS = 'PeerCursor';

/** What the builder reads of the room as it stands now. */
export interface ReplayRoom {
  /** The object the room holds under an identifier, or null where it holds none. */
  get(identifier: string): GameObject | null;
  /** The room server this seat is on, or null among peers. */
  authorityPeerId(): string | null;
  /** This browser's own peer id. */
  selfPeerId(): string;
  /** How much of what happens is kept, from now on. */
  detailLevel(): ReplayDetailLevel;
}

/**
 * What one event did to the recording: merged into the one still being added to, or begun as a
 * new one, which settles the one before it for writing out.
 */
export type ReplayStep =
  | { readonly merged: true; readonly event: ReplayEvent }
  | { readonly merged: false; readonly event: ReplayEvent; readonly settled: ReplayEvent | null };

/** What one message did: whether it touched the board, and what it added to the recording. */
export interface ReplayTake {
  /** Whether it moved the board, which it does even for a change no recording keeps. */
  readonly touched: boolean;
  /** What it added, or null where it added nothing. */
  readonly step: ReplayStep | null;
}

/**
 * Makes a recording's events out of the messages the room passes around, and keeps who did what
 * and to what for its manifest.
 *
 * It remembers the last synced state of every object, to tell what each change changed, and which
 * objects are parts of a piece, so that a piece brought out or taken away with its many parts is one
 * event. The newest event is kept open for a following one of the same kind to merge into until it
 * is settled, and only then goes to be written out.
 */
export class ReplayEventBuilder {
  private startedAt = 0;
  private baselineUntil = 0;
  private _seq = 0;
  private pending: ReplayEvent | null = null;
  private readonly shadows = new Map<string, SyncData>();
  private readonly actors = new Map<string, ReplayActorSnapshot[]>();
  private readonly targets = new Map<string, ReplayTargetSnapshot[]>();
  /** Who could see each object when it was last recorded, for judging its removal once it is gone. */
  private readonly lastVisibility = new Map<string, ReplayVisibility>();
  /** The chat lines recorded as said, by name, so one handed back again is not told twice. */
  private readonly linesSeen = new Set<string>();
  /**
   * The objects that are parts of a piece, whose arrival and removal are not told on their own,
   * each with the piece it belongs to, or empty where that piece has not been seen yet.
   */
  private readonly partOwners = new Map<string, string>();
  /**
   * The arrival or removal of a piece just recorded, by piece, while nothing has been recorded or
   * saved after it and it has not been written out. The parts that come and go with the piece right
   * then are folded into it; one that comes later is told on its own, after what came between.
   */
  private readonly openPieceEvents = new Map<string, ReplayEvent>();
  /** The names of the pieces on the table when recording began, for naming one removed untouched. */
  private readonly namesAtStart = new Map<string, string>();

  constructor(private readonly room: ReplayRoom) {}

  /** The number of the last event made, which a board taken now follows. */
  get seq(): number {
    return this._seq;
  }

  /**
   * Starts a recording afresh at `startedAt`, from the objects the room holds then, which the first
   * board holds.
   */
  begin(startedAt: number, objects: readonly GameObject[]): void {
    this.startedAt = startedAt;
    this.baselineUntil = startedAt + REPLAY_BASELINE_GRACE_MS;
    this._seq = 0;
    this.pending = null;
    this.shadows.clear();
    this.linesSeen.clear();
    this.actors.clear();
    this.targets.clear();
    this.lastVisibility.clear();
    this.partOwners.clear();
    this.openPieceEvents.clear();
    this.namesAtStart.clear();
    for (const object of objects) {
      const owner = pieceOf(object);
      if (owner) this.partOwners.set(object.identifier, owner.identifier);
      else if (object instanceof TabletopObject) this.namesAtStart.set(object.identifier, targetNameOf(object));
    }
    for (const snapshot of replayObjectSnapshotsOf(objects)) {
      this.shadows.set(snapshot.identifier, cloneSyncData(snapshot.syncData));
    }
  }

  /** Reads one message the room passed around at `at`, sent by `sendFrom`. */
  take(eventName: string, data: unknown, sendFrom: string, at: number): ReplayTake {
    // The room server's own word on an object is a change like any other, and what it takes away
    // is gone from the board like anything deleted.
    if (eventName === AuthorityEvent.AUTHORITATIVE) {
      eventName = 'UPDATE_GAME_OBJECT';
    } else if (eventName === AuthorityEvent.WITHDRAW) {
      // The synchronizer, which hears it first, names what it took away.
      const withdrawn = data as { identifier: string; aliasName?: string };
      eventName = 'DELETE_GAME_OBJECT';
      data = { identifier: withdrawn.identifier, aliasName: withdrawn.aliasName ?? '' };
    }
    if (isIgnoredReplayEvent(eventName)) return { touched: false, step: null };

    if (eventName === 'UPDATE_GAME_OBJECT') {
      return { touched: true, step: this.takeObjectUpdate(data as ObjectContext, sendFrom, at) };
    }
    if (eventName === 'DELETE_GAME_OBJECT') {
      return {
        touched: true,
        step: this.takeObjectRemove(data as { identifier: string; aliasName: string }, sendFrom, at),
      };
    }

    const draft = interpretSignal(eventName, data);
    return { touched: true, step: draft ? this.record(draft, sendFrom, at) : null };
  }

  /**
   * Adds an event to the recording, as done by `sendFrom` at `at`: merged into the one still being
   * added to where it can be, or begun as a new one. Null where the detail kept leaves it out.
   */
  record(draft: ReplayDraft, sendFrom: string, at: number): ReplayStep | null {
    if (!isRecordableKind(draft.kind, this.room.detailLevel())) return null;

    const actor = this.rememberActor(sendFrom);
    if (draft.targetIdentifier) this.rememberTarget(draft.targetIdentifier);
    for (const identifier of draft.relatedIdentifiers ?? []) this.rememberTarget(identifier);

    const event: ReplayEvent = {
      seq: ++this._seq,
      at,
      t: at - this.startedAt,
      kind: draft.kind,
      actorId: actor.userId,
      targetId: draft.targetIdentifier,
      detail: draft.detail,
      patch: draft.patch,
      signal: draft.signal,
      visibility: this.visibilityOf(draft),
    };

    if (this.pending && canMergeReplayEvents(this.pending, event)) {
      this._seq--;
      this.pending = mergeReplayEvents(this.pending, event);
      return { merged: true, event: this.pending };
    }

    const settled = this.pending;
    this.pending = event;
    this.openPieceEvents.clear();
    this.openIfPiece(event);
    return { merged: false, event, settled };
  }

  /** Takes out the event still being added to, finished, to be written out; null where there is none. */
  settle(): ReplayEvent | null {
    const settled = this.pending;
    this.pending = null;
    return settled;
  }

  /** Closes the arrivals and removals among events being written out, so no part folds into them after. */
  markWritten(events: readonly ReplayEvent[]): void {
    for (const event of events) {
      if (event.targetId && this.openPieceEvents.get(event.targetId) === event)
        this.openPieceEvents.delete(event.targetId);
    }
  }

  /** Closes every arrival and removal still open, as a board taken holds whatever comes with them later. */
  closePieceEvents(): void {
    this.openPieceEvents.clear();
  }

  /** The name a peer went by most recently in this recording, or their user id when none was recorded. */
  actorNameOf(userId: string): string {
    const history = this.actors.get(userId);
    return history?.[history.length - 1]?.name || userId;
  }

  /** The name an object had most recently in this recording, or empty when it was never named. */
  targetNameOf(identifier: string): string {
    const history = this.targets.get(identifier);
    return history?.[history.length - 1]?.name || '';
  }

  /** Who did what and to what, as the manifest lists them, with this browser as the one recording. */
  cast(): Pick<ReplayManifest, 'recordedBy' | 'actors' | 'targets'> {
    const recordedBy = this.rememberActor(this.room.selfPeerId());
    return {
      recordedBy,
      actors: [...this.actors.values()].flat(),
      targets: [...this.targets.values()].flat(),
    };
  }

  private takeObjectRemove(
    context: { identifier: string; aliasName: string },
    sendFrom: string,
    at: number
  ): ReplayStep | null {
    const owner = this.partOwners.get(context.identifier);
    this.noteRemovedVisibility(context.identifier, owner);
    this.shadows.delete(context.identifier);
    if (owner !== undefined) {
      this.partOwners.delete(context.identifier);
      if (this.foldPartRemoval(owner, context.identifier)) return null;
    } else {
      this.rememberRemovedTarget(context.identifier, context.aliasName);
    }
    const draft = interpretObjectRemove(context.identifier, context.aliasName);
    if (owner !== undefined) draft.detail[REPLAY_PART_FLAG] = true;
    // What a room server takes away of its own accord, as what goes out of view or a cursor left
    // behind, is the board's, not anyone's doing.
    if (sendFrom === this.room.authorityPeerId()) draft.detail[REPLAY_CAUGHT_UP_FLAG] = true;
    return this.record(draft, sendFrom, at);
  }

  private takeObjectUpdate(context: ObjectContext, sendFrom: string, at: number): ReplayStep | null {
    if (!context?.identifier) return null;
    const after = context.syncData as SyncData;
    const before = this.shadows.get(context.identifier) ?? null;
    this.shadows.set(context.identifier, cloneSyncData(after));
    if (before && before['parentIdentifier'] !== after['parentIdentifier']) {
      this.notePartOwner(context.identifier, after['parentIdentifier']);
    }

    const fresh = before !== null || this.isFreshArrival(context.aliasName, after, sendFrom);
    if (!fresh && at < this.baselineUntil) return null;
    if (!shouldDiffObjectChange(this.room.detailLevel(), context.aliasName)) return null;

    const draft = interpretObjectChange({
      aliasName: context.aliasName,
      identifier: context.identifier,
      before,
      after,
    });
    if (!draft) return null;
    if (!before && this.notePart(context.identifier, after, draft) && this.foldPartArrival(context.identifier, draft)) {
      return null;
    }
    if (!before && context.aliasName === CHAT_ALIAS) {
      // A line said again under a name already recorded came back, as one taken out of view and
      // handed back, and was told when first said.
      const again = this.linesSeen.has(context.identifier);
      this.linesSeen.add(context.identifier);
      if (again || (!fresh && sendFrom === this.room.authorityPeerId())) draft.detail[REPLAY_CAUGHT_UP_FLAG] = true;
    }
    return this.record(draft, this.actorOf(context.aliasName, after, sendFrom, draft.detail['revealed'] === true), at);
  }

  /**
   * Who did what a room server passes on as its own: a line, as a roll it made, by whoever said or
   * asked for it, and a cursor it changed, as by a role it set, by whoever the cursor is. A secret
   * roll made public is the roller's, whoever made it public. Anything else stays the sender's.
   */
  private actorOf(aliasName: string, after: SyncData, sendFrom: string, revealed = false): string {
    if (sendFrom !== this.room.authorityPeerId() && !revealed) return sendFrom;
    const speaker = [syncValueOf(after, 'originFrom'), syncValueOf(after, 'from')].find(
      (userId): userId is string => typeof userId === 'string' && userId !== '' && !userId.startsWith('System')
    );
    if (aliasName === CHAT_ALIAS && speaker !== undefined) return PeerCursor.findByUserId(speaker)?.peerId ?? speaker;
    const peerId = syncValueOf(after, 'peerId');
    if (aliasName === PEER_CURSOR_ALIAS && typeof peerId === 'string' && peerId !== '') return peerId;
    return sendFrom;
  }

  /**
   * Keeps up with whether an object is part of a piece once it has moved: a card drawn from its deck
   * is a piece of its own from then on, and one put into a deck becomes part of it. Judged from the
   * parent it moved to, since the room may not have taken the move in yet.
   */
  private notePartOwner(identifier: string, parentIdentifier: unknown): void {
    const parent = typeof parentIdentifier === 'string' ? this.room.get(parentIdentifier) : null;
    const owner = parent instanceof TabletopObject ? parent : pieceOf(parent);
    if (owner) this.partOwners.set(identifier, owner.identifier);
    else this.partOwners.delete(identifier);
  }

  /**
   * Folds a part that has just arrived into the arrival of its piece, when that is still open, so
   * a piece brought out with its many parts is one event. Answers whether it was folded.
   */
  private foldPartArrival(identifier: string, draft: ReplayDraft): boolean {
    const owner = this.partOwners.get(identifier);
    const arrival = owner ? this.openPieceEvents.get(owner) : undefined;
    if (!arrival || arrival.kind !== ReplayEventKind.ObjectCreate || !draft.patch) return false;
    arrival.parts = [...(arrival.parts ?? []), draft.patch];
    return true;
  }

  /**
   * Folds the removal of a part into the removal of its piece, when that is still open, so a piece
   * taken away with its many parts is one event. Answers whether it was folded.
   */
  private foldPartRemoval(owner: string, identifier: string): boolean {
    const removal = owner ? this.openPieceEvents.get(owner) : undefined;
    if (!removal || removal.kind !== ReplayEventKind.ObjectRemove) return false;
    removal.removedParts = [...(removal.removedParts ?? []), identifier];
    return true;
  }

  /**
   * Whether something first seen while the room is still catching up is new, rather than the room
   * as it already was.
   *
   * What this browser sent itself is new, and so is a line stamped after the recording began. A
   * peer's copy of an older line or piece is the room catching up, which the first board holds.
   */
  private isFreshArrival(aliasName: string, after: SyncData, sendFrom: string): boolean {
    const self = this.room.selfPeerId();
    if (self.length > 0 && sendFrom === self) return true;
    if (aliasName !== CHAT_ALIAS) return false;
    const stamped = Number(syncValueOf(after, 'timestamp') ?? 0);
    return Number.isFinite(stamped) && stamped >= this.startedAt - REPLAY_CLOCK_SKEW_MS;
  }

  /**
   * Flags a newly arrived object that belongs to a piece, so it is not told as an arrival of its own.
   *
   * A part sent by someone else can arrive before the piece it belongs to, when its owner cannot be
   * found yet; a parent not seen at all yet marks it as a part all the same.
   */
  private notePart(identifier: string, after: SyncData, draft: ReplayDraft): boolean {
    const parent = after['parentIdentifier'];
    const awaitsParent = typeof parent === 'string' && parent.length > 0 && !this.shadows.has(parent);
    const owner = pieceOf(this.room.get(identifier));
    if (!owner && !awaitsParent) return false;
    this.partOwners.set(identifier, owner?.identifier ?? '');
    draft.detail[REPLAY_PART_FLAG] = true;
    return true;
  }

  /**
   * Keeps who could see an object being taken away, before its last synced state is let go.
   *
   * The room has already dropped it, so its removal is judged by what is remembered here: a piece
   * by its own disclosure, a part by its piece's. A piece hidden from the start and never touched
   * since would otherwise be told to everyone as it leaves.
   */
  private noteRemovedVisibility(identifier: string, owner: string | undefined): void {
    const holder = owner || identifier;
    const shadow = this.shadows.get(holder);
    const visibility = shadow ? visibilityOfSyncData(shadow) : this.lastVisibility.get(holder);
    if (visibility) this.lastVisibility.set(identifier, visibility);
  }

  /**
   * Names a piece taken away that no event had named yet, from what was seen when recording
   * began. The store has let it go by the time the removal arrives.
   */
  private rememberRemovedTarget(identifier: string, aliasName: string): void {
    if (this.targets.has(identifier)) return;
    const name = this.namesAtStart.get(identifier);
    if (name == null) return;
    this.targets.set(identifier, [{ identifier, aliasName, name, sinceSeq: this._seq + 1 }]);
  }

  /** Keeps the arrival or removal of a piece open for its parts until it is written out. */
  private openIfPiece(event: ReplayEvent): void {
    if (event.kind !== ReplayEventKind.ObjectCreate && event.kind !== ReplayEventKind.ObjectRemove) return;
    if (!event.targetId || event.detail[REPLAY_PART_FLAG] === true) return;
    this.openPieceEvents.set(event.targetId, event);
  }

  /**
   * Who did something, as they stand now: a new snapshot when their name, role or picture changed.
   * One whose cursor is gone, as after leaving, is who they were when last seen under that id.
   */
  private rememberActor(peerId: string): ReplayActorSnapshot {
    const cursor = PeerCursor.findByPeerId(peerId);
    const seen = cursor
      ? undefined
      : (this.actors.get(peerId) ??
        [...this.actors.values()].find((history) => history.some((snapshot) => snapshot.peerId === peerId)));
    if (seen) return seen[seen.length - 1];
    const snapshot: ReplayActorSnapshot = {
      userId: cursor?.userId || peerId,
      peerId,
      name: cursor?.name ?? '',
      role: cursor?.role ?? 'pl',
      imageIdentifier: cursor?.imageIdentifier ?? '',
      sinceSeq: this._seq + 1,
    };
    const history = this.actors.get(snapshot.userId);
    if (!history) {
      this.actors.set(snapshot.userId, [snapshot]);
      return snapshot;
    }
    const latest = history[history.length - 1];
    if (
      latest.name !== snapshot.name ||
      latest.role !== snapshot.role ||
      latest.imageIdentifier !== snapshot.imageIdentifier
    ) {
      history.push(snapshot);
      return snapshot;
    }
    return latest;
  }

  private rememberTarget(identifier: string): void {
    const object = this.room.get(identifier);
    if (!object) return;

    const owner = pieceOf(object);
    const snapshot: ReplayTargetSnapshot = {
      identifier,
      aliasName: object.aliasName,
      name: targetNameOf(object),
      ownerIdentifier: owner?.identifier,
      sinceSeq: this._seq + 1,
    };
    const history = this.targets.get(identifier);
    if (!history) {
      this.targets.set(identifier, [snapshot]);
      return;
    }
    const latest = history[history.length - 1];
    if (latest.name !== snapshot.name || latest.ownerIdentifier !== snapshot.ownerIdentifier) history.push(snapshot);
  }

  private visibilityOf(draft: ReplayDraft): ReplayVisibility {
    if (draft.kind === ReplayEventKind.ChatMessage || draft.kind === ReplayEventKind.ChatDice) {
      const tab = this.room.get(String(draft.detail['tabIdentifier'] ?? ''));
      return visibilityOfChatLine(draft.detail, tab instanceof ChatTab ? tab : null);
    }

    const target = draft.targetIdentifier;
    const object = target ? this.room.get(target) : null;
    // Taken out of the room before the word arrived, it is judged as it was last seen.
    if (!object) return (target && this.lastVisibility.get(target)) || PUBLIC_VISIBILITY;
    // A part such as a piece's HP has no disclosure of its own and is kept as its piece is.
    const holder = (isDisclosable(object) ? object : pieceOf(object)) as Disclosing | null;
    const visibility = visibilityOfDisclosure(holder?.disclosureMode, holder?.disclosureUserIds);
    if (target) this.lastVisibility.set(target, visibility);
    return visibility;
  }
}

interface Disclosing {
  disclosureMode?: unknown;
  disclosureUserIds?: unknown;
}

function isDisclosable(object: unknown): boolean {
  return typeof object === 'object' && object !== null && 'disclosureMode' in object;
}
