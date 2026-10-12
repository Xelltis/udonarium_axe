import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService, metresPerCell } from '@axe/application/tabletop/engagement-zone.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { generateUuid } from '@axe/core/util/uuid';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { cellCenterOf, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import type { MovePoint } from '@axe/domain/tabletop/move/blocked-path';
import { exactMoveCellsOf } from '@axe/domain/tabletop/move/move-cells';
import { lengthByKind, moveKindNamed, parseMoveKinds } from '@axe/domain/tabletop/move/move-kind';
import { resolveRoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import {
  commonSpans,
  inSpans,
  InterruptClaim,
  litSpans,
  mayBeStopped,
  nearestInSpans,
  PathSpan,
  pointAtLength,
  resolveClaims,
} from '@axe/domain/tabletop/zone/interrupt';

/** How long a declared move waits for the room's answers before it goes on with those it has. */
export const INTERRUPT_WAIT_MS = 15000;

/** How often a declared move looks for the answers. */
const LOOK_MS = 200;

/** Where a move is stopped by pieces stepping into it, and who stepped in. */
export interface InterruptOutcome {
  /** How far along the way, in table pixels. */
  readonly along: number;
  readonly pieces: readonly string[];
}

/** A move declared by this peer, waiting for the room's answers. */
export interface WaitingMove {
  readonly id: string;
  readonly deadline: number;
  readonly waitingFor: number;
}

/** A piece this peer may step into a declared move with, and the stretches of the way it reaches. */
export interface InterruptPiece {
  readonly id: string;
  readonly name: string;
  readonly spans: readonly PathSpan[];
}

/** A move another peer, or this one, has declared, which this peer may answer or rule on. */
export interface InterruptOffer {
  readonly id: string;
  readonly moverName: string;
  readonly path: readonly MovePoint[];
  /** The pieces this peer answers for; none where it only rules on the move as a game master. */
  readonly pieces: readonly InterruptPiece[];
}

interface Candidate {
  readonly id: string;
  readonly count: number;
  readonly spans: readonly PathSpan[];
  readonly responder: string;
}

/**
 * Lets the room step into a move under way, and stop it there.
 *
 * The peer making the move stops before walking and declares it on its cursor. Each peer answering
 * for a piece that could step in - its owner, or for a piece nobody owns the lowest game master -
 * writes on its own cursor where along the way its pieces step in, or that they let it by. The mover
 * goes on once everybody has answered, once a game master says so, or once the wait runs out; the
 * claim nearest the start that the mover's side does not outnumber stops it, and the pieces that
 * made it stand with it in a new zone. Every peer writes only to its own cursor, so no two answers
 * can overwrite each other.
 */
@Injectable({ providedIn: 'root' })
export class MoveInterruptService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly zones = inject(EngagementZoneService);
  private readonly chat = inject(ChatMessageService);
  private readonly t = inject(TRANSLATE_FN);

  private readonly waitingMove = signal<WaitingMove | null>(null);
  private readonly picked = signal<{ id: string; pieces: readonly string[]; along: number | null } | null>(null);

  /** The move this peer has declared and is waiting on, for saying so at the foot of the screen. */
  readonly waiting = this.waitingMove.asReadonly();

  /** A declared move this peer may answer, or rule on as a game master; null where there is none. */
  readonly offer = computed<InterruptOffer | null>(() => {
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    this.zones.state();
    const table = this.tableSelecter.viewTable;
    const mine = PeerCursor.myCursor;
    if (!table || !mine) return null;
    this.objectChange.versionOf(mine.identifier)();
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      if (!cursor.movingDeclared) continue;
      this.objectChange.versionOf(cursor.identifier)();
      if (cursor.movingTableIdentifier !== table.identifier) continue;
      const mover = this.objectStore.get<GameCharacter>(cursor.movingCharacterIdentifier);
      if (!(mover instanceof GameCharacter)) continue;
      const id = cursor.movingDeclared;
      const path = this.pathOf(cursor, table);
      const answered = mine.interruptAnswer.startsWith(`${id}|`);
      const pieces = answered
        ? []
        : this.candidatesFor(mover, path)
            .filter((candidate) => candidate.responder === mine.identifier)
            .map((candidate) => ({
              id: candidate.id,
              name: this.objectStore.get<GameCharacter>(candidate.id)?.name ?? '',
              spans: candidate.spans,
            }));
      if (pieces.length > 0 || (mine.isGameMaster && cursor !== mine)) {
        return { id, moverName: mover.name, path, pieces };
      }
    }
    return null;
  });

  /** The pieces chosen to step in, and how far along the way, for the offer standing. */
  readonly choice = computed(() => {
    const offer = this.offer();
    if (!offer || offer.pieces.length < 1) return null;
    const picked = this.picked();
    const chosen = picked?.id === offer.id ? picked.pieces : [offer.pieces[0].id];
    const pieces = offer.pieces.filter((piece) => chosen.includes(piece.id));
    const spans = commonSpans(pieces.map((piece) => piece.spans));
    const wanted = picked?.id === offer.id ? picked.along : null;
    const along = wanted !== null && inSpans(spans, wanted) ? wanted : (spans[0]?.from ?? null);
    return {
      pieces: pieces.map((piece) => piece.id),
      spans,
      along,
      point: along === null ? null : pointAtLength(offer.path, along),
    };
  });

  constructor() {
    // A new offer starts from nothing chosen, so a choice made for one move never answers the next.
    effect(() => {
      const id = this.offer()?.id ?? null;
      untracked(() => {
        if (this.picked()?.id !== id) this.picked.set(null);
      });
    });
  }

  /** Whether moves may be stepped into at all in this room. */
  applies(): boolean {
    return this.zones.isEnabled() && this.config()?.interruptEnabled === true;
  }

  /**
   * Declares a move along a way and waits for the room's answers, before the piece walks it.
   *
   * Answers at once with no stop where nobody could step in. The way is the points the piece passes,
   * beginning where it stands: the middles of the cells on a grid, the corners of a way of straight
   * legs on a table with none.
   */
  async negotiate(mover: GameCharacter, path: readonly MovePoint[]): Promise<InterruptOutcome | null> {
    if (!this.applies() || path.length < 2) return null;
    const terms = this.zones.interruptersOf(mover);
    if (!terms) return null;
    const candidates = this.candidatesFor(mover, path);
    const total = candidates.reduce((sum, candidate) => sum + candidate.count, 0);
    if (!mayBeStopped(terms.moverCount, total, terms.ratio)) return null;
    const responders = new Set(candidates.map((candidate) => candidate.responder));
    const mine = PeerCursor.myCursor;
    if (!mine || responders.size < 1) return null;

    const id = generateUuid();
    mine.movingDeclared = id;
    this.waitingMove.set({ id, deadline: Date.now() + INTERRUPT_WAIT_MS, waitingFor: responders.size });
    const verdict = await this.waitForAnswers(id, responders);
    mine.movingDeclared = '';
    this.waitingMove.set(null);
    if (verdict === 'drop') return null;

    const claims = this.claimsFor(id, responders);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const stopped = resolveClaims(
      claims,
      (claim) => claim.pieces.every((piece) => byId.has(piece) && inSpans(byId.get(piece)!.spans, claim.along)),
      (piece) => byId.get(piece)?.count ?? 1,
      terms.moverCount,
      terms.ratio,
      terms.samePointPx
    );
    return stopped ? { along: stopped.along, pieces: stopped.pieces } : null;
  }

  /**
   * Stands the pieces that stopped a move with the piece they stopped, in a new zone at the point it
   * was stopped at, and says so in chat.
   */
  settle(mover: GameCharacter, outcome: InterruptOutcome, point: MovePoint): void {
    const pieces = outcome.pieces
      .map((id) => this.objectStore.get<GameCharacter>(id))
      .filter((piece): piece is GameCharacter => piece instanceof GameCharacter);
    if (pieces.length < 1) return;
    this.zones.formAt(point, [mover, ...pieces]);
    this.chat.sendSystemMessage(
      this.t('feature.zone.chat.interrupted', {
        names: pieces.map((piece) => piece.name).join('、'),
        mover: mover.name,
      })
    );
  }

  /** Picks a piece to step in with, or puts it back. */
  togglePiece(pieceId: string): void {
    const offer = this.offer();
    const choice = this.choice();
    if (!offer || !choice) return;
    const pieces = choice.pieces.includes(pieceId)
      ? choice.pieces.filter((id) => id !== pieceId)
      : [...choice.pieces, pieceId];
    this.picked.set({ id: offer.id, pieces, along: choice.along });
  }

  /** Moves the point the chosen pieces step in at along the way, to the nearest the pieces reach. */
  setAlong(along: number): void {
    const offer = this.offer();
    const choice = this.choice();
    if (!offer || !choice) return;
    this.picked.set({ id: offer.id, pieces: choice.pieces, along: nearestInSpans(choice.spans, along) });
  }

  /** Steps into the declared move with the pieces chosen, at the point chosen. */
  answer(): void {
    const offer = this.offer();
    const choice = this.choice();
    const mine = PeerCursor.myCursor;
    if (!offer || !choice || choice.along === null || choice.pieces.length < 1 || !mine) return;
    mine.interruptAnswer = `${offer.id}|${Math.round(choice.along * 10) / 10}|${choice.pieces.join(',')}`;
  }

  /** Lets the declared move by. */
  pass(): void {
    const offer = this.offer();
    const mine = PeerCursor.myCursor;
    if (!offer || !mine) return;
    mine.interruptAnswer = `${offer.id}|pass`;
  }

  /** Settles a declared move with the answers in, as a game master. */
  decideNow(): void {
    this.rule('now');
  }

  /** Lets a declared move go on as though nobody had stepped in, as a game master. */
  dropInterrupts(): void {
    this.rule('drop');
  }

  private rule(word: 'now' | 'drop'): void {
    const mine = PeerCursor.myCursor;
    const id = this.waitingMove()?.id ?? this.offer()?.id;
    if (!mine?.isGameMaster || !id) return;
    mine.interruptVerdict = `${id}|${word}`;
  }

  private waitForAnswers(id: string, responders: ReadonlySet<string>): Promise<'all' | 'now' | 'drop' | 'late'> {
    const deadline = Date.now() + INTERRUPT_WAIT_MS;
    return new Promise((resolve) => {
      const look = () => {
        const verdict = this.verdictFor(id);
        if (verdict) return resolve(verdict);
        if ([...responders].every((responder) => this.answerOf(responder, id) !== null)) return resolve('all');
        if (Date.now() >= deadline) return resolve('late');
        setTimeout(look, LOOK_MS);
      };
      look();
    });
  }

  private verdictFor(id: string): 'now' | 'drop' | null {
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      if (!cursor.isGameMaster) continue;
      if (cursor.interruptVerdict === `${id}|now`) return 'now';
      if (cursor.interruptVerdict === `${id}|drop`) return 'drop';
    }
    return null;
  }

  private answerOf(responder: string, id: string): string | null {
    const cursor = this.objectStore.get<PeerCursor>(responder);
    if (!(cursor instanceof PeerCursor)) return 'gone';
    const answer = cursor.interruptAnswer ?? '';
    return answer.startsWith(`${id}|`) ? answer.slice(id.length + 1) : null;
  }

  private claimsFor(id: string, responders: ReadonlySet<string>): InterruptClaim[] {
    const claims: InterruptClaim[] = [];
    for (const responder of responders) {
      const answer = this.answerOf(responder, id);
      if (!answer || answer === 'pass' || answer === 'gone') continue;
      const [alongText, piecesText = ''] = answer.split('|');
      const along = Number(alongText);
      const pieces = piecesText.split(',').filter((piece) => piece.length > 0);
      if (Number.isFinite(along) && pieces.length > 0) claims.push({ along, pieces });
    }
    return claims;
  }

  /** The pieces that could step into a move along this way, each with the stretches it reaches. */
  private candidatesFor(mover: GameCharacter, path: readonly MovePoint[]): Candidate[] {
    const terms = this.zones.interruptersOf(mover);
    const table = this.tableSelecter.viewTable;
    if (!terms || !table || path.length < 2) return [];
    const candidates: Candidate[] = [];
    for (const candidate of terms.candidates) {
      const piece = this.objectStore.get<GameCharacter>(candidate.id);
      if (!(piece instanceof GameCharacter)) continue;
      const responder = this.responderOf(piece);
      if (!responder) continue;
      const reach = this.reachOf(piece, table);
      if (reach <= 0) continue;
      const spans = litSpans(path, candidate.point, reach, terms.zones);
      if (spans.length < 1) continue;
      candidates.push({ id: candidate.id, count: candidate.count, spans, responder });
    }
    return candidates;
  }

  /** How far a piece goes stepping into a move, in table pixels: by the kind of move the room names for it. */
  private reachOf(piece: GameCharacter, table: GameTable): number {
    const rules = resolveRoomRules(this.config()?.roomRuleAnswers ?? null, table);
    const walk = exactMoveCellsOf(piece, rules.moveRangeElementNames, rules.cellDistance, rules.cellDistanceUnit);
    if (walk === null || walk <= 0) return 0;
    const kind = moveKindNamed(parseMoveKinds(this.config()?.moveKinds ?? ''), this.config()?.interruptKind ?? '');
    return lengthByKind(kind, walk, metresPerCell(rules)) * table.gridSize;
  }

  /**
   * The cursor of the peer that answers for a piece: its owner's, where its owner is here with a
   * version that knows of this, and otherwise the game master lowest in order that does.
   */
  private responderOf(piece: GameCharacter): string | null {
    if (piece.owner) {
      const owner = PeerCursor.findByUserId(piece.owner);
      if (owner && owner.zoneProtocol === '1') return owner.identifier;
    }
    const masters = this.objectStore
      .getObjects<PeerCursor>(PeerCursor)
      .filter((cursor) => cursor.isGameMaster && cursor.zoneProtocol === '1' && cursor.peerId.length > 0)
      .sort((a, b) => (a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0));
    return masters[0]?.identifier ?? null;
  }

  /** The way a cursor has declared, as points in table pixels. */
  private pathOf(cursor: PeerCursor, table: GameTable): MovePoint[] {
    if (cursor.movingPoints) {
      return cursor.movingPoints
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number))
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
        .map(([x, y]) => ({ x, y }));
    }
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    return cursor.movingWay
      .split(',')
      .map(Number)
      .filter((cell) => Number.isInteger(cell) && cell >= 0)
      .map((cell) => cellCenterOf(grid, cell));
  }

  private config(): Config | null {
    return this.objectStore.get<Config>('Config');
  }
}
