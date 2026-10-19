import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  EngagementZoneService,
  metresPerCell,
  ZoneInterrupters,
} from '@axe/application/tabletop/engagement-zone.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { generateUuid } from '@axe/core/util/uuid';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { cellCenterOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import type { MovePoint } from '@axe/domain/tabletop/move/blocked-path';
import { exactMoveCellsOf } from '@axe/domain/tabletop/move/move-cells';
import { moveGridOf } from '@axe/domain/tabletop/move/move-grid';
import { squarePxOf } from '@axe/domain/tabletop/move/move-grid';
import { lengthByKind, moveKindNamed, parseMoveKinds } from '@axe/domain/tabletop/move/move-kind';
import { readMovingPoints } from '@axe/domain/tabletop/move/moving-points';
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
  spansWithin,
} from '@axe/domain/tabletop/zone/interrupt';
import { zoneCovers } from '@axe/domain/tabletop/zone/zone-geometry';

/** How long a declared move waits for the room's answers before it goes on with those it has. */
export const INTERRUPT_WAIT_MS = 15000;

/** How often a declared move looks for the answers. */
const LOOK_MS = 200;

/** Where a move is stopped by pieces stepping into it, and who stepped in. */
export interface InterruptOutcome {
  /** How far along the way, in table pixels. */
  readonly along: number;
  readonly pieces: readonly string[];
  /** The zone that stopped the move, which the piece is pulled into; empty where it was stopped outside every zone. */
  readonly zone?: string;
  /**
   * Whether the piece is pulled to that zone's centre, as pieces in it stopping it pull it, rather than
   * standing where it was stopped in a zone made there, which then joins the one it stands in.
   */
  readonly pullsIn?: boolean;
  /** Whether the zone made where it was stopped is in force at once, as one stopped by a piece nobody can see is. */
  readonly atOnce?: boolean;
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
  /** The zones it stops the move for: none outside every zone; the one it is in, or those it stands in. */
  readonly zones: readonly string[];
  /** Whether it is in the zone it stops the move for, rather than standing in it. */
  readonly member: boolean;
}

/** A zone the chosen pieces may pull the piece into, named by a piece in it. */
export interface InterruptZoneChoice {
  readonly id: string;
  readonly name: string;
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
  /** The cursor that answers for it, or null where nobody here can. */
  readonly responder: string | null;
  readonly zones: readonly string[];
  readonly member: boolean;
}

/** A claim to stop a move, with the zone it pulls the piece into where it is made from a zone. */
interface ZoneClaim extends InterruptClaim {
  readonly zone: string;
}

/**
 * Lets the room step into a move under way, and stop it there.
 *
 * The peer making the move stops before walking and declares it on its cursor. Each peer answering
 * for a piece that could step in - its owner, or for a piece nobody owns the lowest game master -
 * writes on its own cursor where along the way its pieces step in, or that they let it by. The mover
 * goes on once everybody has answered, once a game master says so, or once the wait runs out; the
 * claim nearest the start that holds stops it. Every peer writes only to its own cursor, so no two
 * answers can overwrite each other.
 *
 * Pieces outside every zone step in outside every zone, where the mover's side does not outnumber
 * them; those that stop it stand with it in a new zone. A zone the move runs into, or out of, may
 * stop it as well, by any piece of another side in it: the piece is pulled to the zone's centre and
 * joins it, into whichever zone the answer names where pieces of two zones stop it together. A piece
 * standing in such a zone without being in it may stop it within its own reach inside the zone; one
 * that does so with nobody in the zone makes a zone where it stopped it, which joins the one it
 * stands in. A zone nobody here can answer for stops the move of itself, where it first runs in.
 */
@Injectable({ providedIn: 'root' })
export class MoveInterruptService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly zones = inject(EngagementZoneService);
  private readonly vision = inject(VisionService);
  private readonly chat = inject(ChatMessageService);
  private readonly t = inject(TRANSLATE_FN);

  private readonly waitingMove = signal<WaitingMove | null>(null);
  private readonly picked = signal<{
    id: string;
    pieces: readonly string[];
    along: number | null;
    zone?: string;
  } | null>(null);

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
      if (!mine.isGameMaster && !this.vision.isTokenVisible(mover)) continue;
      const id = cursor.movingDeclared;
      const path = this.pathOf(cursor, table);
      const answered = mine.interruptAnswer.startsWith(`${id}|`);
      const pieces = answered
        ? []
        : this.candidatesFor(mover, path, cursor.movingKind)
            .filter((candidate) => candidate.responder === mine.identifier)
            .map((candidate) => ({
              id: candidate.id,
              name: this.objectStore.get<GameCharacter>(candidate.id)?.name ?? '',
              spans: candidate.spans,
              zones: candidate.zones,
              member: candidate.member,
            }));
      if (pieces.length > 0 || (mine.isGameMaster && cursor !== mine)) {
        return { id, moverName: mover.name, path, pieces };
      }
    }
    return null;
  });

  /**
   * The declared moves this peer would be asked to answer but whose mover it does not see: it lets
   * them by at once, rather than being asked about, or naming, a piece kept from it.
   */
  private readonly unseenDeclarations = computed<string[]>(() => {
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    this.zones.state();
    const table = this.tableSelecter.viewTable;
    const mine = PeerCursor.myCursor;
    if (!table || !mine || mine.isGameMaster) return [];
    this.objectChange.versionOf(mine.identifier)();
    const ids: string[] = [];
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      if (!cursor.movingDeclared || cursor === mine) continue;
      this.objectChange.versionOf(cursor.identifier)();
      if (cursor.movingTableIdentifier !== table.identifier) continue;
      if (mine.interruptAnswer.startsWith(`${cursor.movingDeclared}|`)) continue;
      const mover = this.objectStore.get<GameCharacter>(cursor.movingCharacterIdentifier);
      if (!(mover instanceof GameCharacter) || this.vision.isTokenVisible(mover)) continue;
      const asked = this.candidatesFor(mover, this.pathOf(cursor, table), cursor.movingKind).some(
        (candidate) => candidate.responder === mine.identifier
      );
      if (asked) ids.push(cursor.movingDeclared);
    }
    return ids;
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
    const point = along === null ? null : pointAtLength(offer.path, along);
    const zones = this.zonesFor(pieces, point);
    const zone = zones.find((one) => one.id === picked?.zone) ?? zones[0] ?? null;
    return { pieces: pieces.map((piece) => piece.id), spans, along, point, zones, zone: zone?.id ?? '' };
  });

  constructor() {
    // A new offer starts from nothing chosen, so a choice made for one move never answers the next.
    effect(() => {
      const id = this.offer()?.id ?? null;
      untracked(() => {
        if (this.picked()?.id !== id) this.picked.set(null);
      });
    });
    effect(() => {
      const unseen = this.unseenDeclarations();
      const mine = untracked(() => PeerCursor.myCursor);
      if (unseen.length > 0 && mine) untracked(() => (mine.interruptAnswer = `${unseen[0]}|pass`));
    });
  }

  /** Whether moves may be stepped into at all in this room. */
  applies(): boolean {
    return this.zones.stopsByChoice();
  }

  /**
   * Declares a move along a way and waits for the room's answers, before the piece walks it.
   *
   * Answers at once with no stop where nobody could step in. The way is the points the piece passes,
   * beginning where it stands: the middles of the cells on a grid, the corners of a way of straight
   * legs on a table with none.
   */
  async negotiate(mover: GameCharacter, path: readonly MovePoint[], kind = ''): Promise<InterruptOutcome | null> {
    if (!this.applies() || path.length < 2) return null;
    const terms = this.zones.interruptersOf(mover, kind);
    if (!terms || terms.unstoppable) return null;
    const candidates = this.candidatesFor(mover, path, kind);
    const outside = candidates.filter((candidate) => candidate.zones.length < 1);
    const outsideTotal = outside.reduce((sum, candidate) => sum + candidate.count, 0);
    const asked = [
      ...(mayBeStopped(terms.moverCount, outsideTotal, terms.ratio) ? outside : []),
      ...candidates.filter((candidate) => candidate.zones.length > 0),
    ].filter((candidate) => candidate.responder !== null);
    const unanswered = this.unansweredZones(terms, candidates, path);
    const responders = new Set(asked.map((candidate) => candidate.responder!));
    const mine = PeerCursor.myCursor;
    if (!mine || responders.size < 1) return this.nearest(null, [], unanswered, terms);

    const id = generateUuid();
    mine.movingDeclared = id;
    this.waitingMove.set({ id, deadline: Date.now() + INTERRUPT_WAIT_MS, waitingFor: responders.size });
    const verdict = await this.waitForAnswers(id, responders);
    mine.movingDeclared = '';
    this.waitingMove.set(null);
    if (verdict === 'drop') return null;

    const claims = this.claimsFor(id, responders);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const reaches = (claim: InterruptClaim) =>
      claim.pieces.every((piece) => byId.has(piece) && inSpans(byId.get(piece)!.spans, claim.along));
    const outsideStop = resolveClaims(
      claims.filter((claim) => claim.pieces.every((piece) => byId.get(piece)?.zones.length === 0)),
      reaches,
      (piece) => byId.get(piece)?.count ?? 1,
      terms.moverCount,
      terms.ratio,
      terms.samePointPx
    );
    const zoneStops = claims
      .filter((claim) => claim.pieces.every((piece) => (byId.get(piece)?.zones.length ?? 0) > 0) && reaches(claim))
      .map((claim) => this.zoneClaimOf(claim, byId, path, terms))
      .filter((claim): claim is ZoneClaim => claim !== null);
    return this.nearest(outsideStop, zoneStops, unanswered, terms);
  }

  /**
   * The stop nearest the start of the way, of one made from outside every zone, those made from a
   * zone, and those zones nobody could answer for make of themselves; a zone's before one from
   * outside at the same point.
   */
  private nearest(
    outside: InterruptClaim | null,
    zoneStops: readonly ZoneClaim[],
    unanswered: readonly ZoneClaim[],
    terms: ZoneInterrupters
  ): InterruptOutcome | null {
    const fromZones = [...zoneStops, ...unanswered].sort((a, b) => a.along - b.along)[0] ?? null;
    if (fromZones && (!outside || fromZones.along <= outside.along)) {
      const hold = terms.holding.find((zone) => zone.id === fromZones.zone);
      const pullsIn = fromZones.pieces.some((piece) => hold?.members.some((member) => member.id === piece) ?? false);
      return { along: fromZones.along, pieces: fromZones.pieces, zone: fromZones.zone, pullsIn, atOnce: true };
    }
    if (!outside) return null;
    return {
      along: outside.along,
      pieces: outside.pieces,
      zone: '',
      pullsIn: false,
      atOnce: outside.pieces.some((piece) => terms.unseen.has(piece)),
    };
  }

  /**
   * A claim made from a zone, with the zone it pulls the piece into: the one the answer names where it
   * may, and otherwise the zone of the first piece in one, or the first zone the pieces stand in that
   * takes in the point. Null where no zone stopping the move fits the claim.
   */
  private zoneClaimOf(
    claim: InterruptClaim & { zone?: string },
    byId: ReadonlyMap<string, Candidate>,
    path: readonly MovePoint[],
    terms: ZoneInterrupters
  ): ZoneClaim | null {
    const point = pointAtLength(path, claim.along);
    const fits = this.zonesFitting(
      claim.pieces.map((piece) => byId.get(piece)!),
      point,
      terms
    );
    const zone = fits.find((one) => one === claim.zone) ?? fits[0];
    return zone ? { along: claim.along, pieces: claim.pieces, zone } : null;
  }

  /**
   * The zones a set of pieces may pull a piece into at a point: those of the pieces in a zone, or
   * where none is, those the pieces all stand in that take the point in.
   */
  private zonesFitting(pieces: readonly Candidate[], point: MovePoint | null, terms: ZoneInterrupters): string[] {
    const inZones = [...new Set(pieces.filter((piece) => piece.member).flatMap((piece) => piece.zones))];
    if (inZones.length > 0) return inZones;
    if (pieces.length < 1 || !point) return [];
    return pieces[0].zones.filter(
      (zone) =>
        pieces.every((piece) => piece.zones.includes(zone)) &&
        zoneCovers(terms.holding.find((hold) => hold.id === zone)!.shape, point)
    );
  }

  /**
   * The stops zones make of themselves where nobody here can answer for any piece of another side in
   * them: where the way first runs into the zone, or out of it for a piece standing in one.
   */
  private unansweredZones(
    terms: ZoneInterrupters,
    candidates: readonly Candidate[],
    path: readonly MovePoint[]
  ): ZoneClaim[] {
    const claims: ZoneClaim[] = [];
    for (const zone of terms.holding) {
      const answered = candidates.some(
        (candidate) => candidate.member && candidate.zones.includes(zone.id) && candidate.responder !== null
      );
      if (answered) continue;
      const spans = spansWithin(path, [zone.shape]);
      if (spans.length < 1) continue;
      claims.push({ along: spans[0].from, pieces: zone.members.map((member) => member.id), zone: zone.id });
    }
    return claims;
  }

  /**
   * Stands the pieces that stopped a move with the piece they stopped, and says so in chat: in a new
   * zone at the point it was stopped at, or, where pieces in a zone stopped it, in that zone, pulled
   * to its centre along with those that stopped it standing in the zone. Pieces in another zone that
   * stopped it with them stay in their own.
   */
  settle(mover: GameCharacter, outcome: InterruptOutcome, point: MovePoint): void {
    const pieces = outcome.pieces
      .map((id) => this.objectStore.get<GameCharacter>(id))
      .filter((piece): piece is GameCharacter => piece instanceof GameCharacter);
    if (pieces.length < 1) return;
    const zone = outcome.zone ?? '';
    if (zone && outcome.pullsIn) {
      const standing = pieces.filter((piece) => piece.engagementZone === '');
      this.zones.pullInto(zone, [mover, ...standing]);
    } else {
      this.zones.formAt(point, [mover, ...pieces], outcome.atOnce === true);
    }
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
    const fromZone = (id: string) => (offer.pieces.find((piece) => piece.id === id)?.zones.length ?? 0) > 0;
    // Pieces outside every zone and pieces in or standing in one cannot stop a move together.
    const kept = choice.pieces.filter((id) => fromZone(id) === fromZone(pieceId));
    const pieces = kept.includes(pieceId) ? kept.filter((id) => id !== pieceId) : [...kept, pieceId];
    this.picked.set({ id: offer.id, pieces, along: choice.along, zone: choice.zone });
  }

  /** Chooses which zone the chosen pieces pull the piece into, where pieces of more than one stop it. */
  setZone(zoneId: string): void {
    const offer = this.offer();
    const choice = this.choice();
    if (!offer || !choice) return;
    this.picked.set({ id: offer.id, pieces: choice.pieces, along: choice.along, zone: zoneId });
  }

  /** Moves the point the chosen pieces step in at along the way, to the nearest the pieces reach. */
  setAlong(along: number): void {
    const offer = this.offer();
    const choice = this.choice();
    if (!offer || !choice) return;
    this.picked.set({
      id: offer.id,
      pieces: choice.pieces,
      along: nearestInSpans(choice.spans, along),
      zone: choice.zone,
    });
  }

  /** Steps into the declared move with the pieces chosen, at the point chosen. */
  answer(): void {
    const offer = this.offer();
    const choice = this.choice();
    const mine = PeerCursor.myCursor;
    if (!offer || !choice || choice.along === null || choice.pieces.length < 1 || !mine) return;
    const along = Math.round(choice.along * 10) / 10;
    mine.interruptAnswer = `${offer.id}|${along}|${choice.pieces.join(',')}${choice.zone ? `|${choice.zone}` : ''}`;
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

  private claimsFor(id: string, responders: ReadonlySet<string>): (InterruptClaim & { zone: string })[] {
    const claims: (InterruptClaim & { zone: string })[] = [];
    for (const responder of responders) {
      const answer = this.answerOf(responder, id);
      if (!answer || answer === 'pass' || answer === 'gone') continue;
      const [alongText, piecesText = '', zone = ''] = answer.split('|');
      const along = Number(alongText);
      const pieces = piecesText.split(',').filter((piece) => piece.length > 0);
      if (Number.isFinite(along) && pieces.length > 0) claims.push({ along, pieces, zone });
    }
    return claims;
  }

  /**
   * The pieces that could step into a move along this way, each with the stretches it reaches: those
   * outside every zone within their reach and outside every zone, those in a zone stopping the move
   * wherever the way runs through that zone, and those standing in one within their reach inside it.
   */
  private candidatesFor(mover: GameCharacter, path: readonly MovePoint[], kind = ''): Candidate[] {
    const terms = this.zones.interruptersOf(mover, kind);
    const table = this.tableSelecter.viewTable;
    if (!terms || terms.unstoppable || !table || path.length < 2) return [];
    const candidates: Candidate[] = [];
    const pieceOf = (id: string) => {
      const piece = this.objectStore.get<GameCharacter>(id);
      return piece instanceof GameCharacter ? piece : null;
    };
    for (const candidate of terms.candidates) {
      const piece = pieceOf(candidate.id);
      const responder = piece ? this.responderOf(piece) : null;
      const reach = piece ? this.reachOf(piece, table) : 0;
      if (!piece || !responder || reach <= 0) continue;
      const spans = litSpans(path, candidate.point, reach, terms.zones);
      if (spans.length < 1) continue;
      candidates.push({ id: candidate.id, count: candidate.count, spans, responder, zones: [], member: false });
    }
    for (const zone of terms.holding) {
      const spans = spansWithin(path, [zone.shape]);
      if (spans.length < 1) continue;
      for (const member of zone.members) {
        const piece = pieceOf(member.id);
        if (!piece) continue;
        const responder = this.responderOf(piece);
        candidates.push({ id: member.id, count: member.count, spans, responder, zones: [zone.id], member: true });
      }
    }
    for (const stander of terms.standing) {
      const piece = pieceOf(stander.id);
      const responder = piece ? this.responderOf(piece) : null;
      const reach = piece ? this.reachOf(piece, table) : 0;
      if (!piece || !responder || reach <= 0) continue;
      const shapes = terms.holding.filter((zone) => stander.zones.includes(zone.id)).map((zone) => zone.shape);
      const spans = commonSpans([litSpans(path, stander.point, reach, []), spansWithin(path, shapes)]);
      if (spans.length < 1) continue;
      candidates.push({ id: stander.id, count: stander.count, spans, responder, zones: stander.zones, member: false });
    }
    return candidates;
  }

  /**
   * The zones the chosen pieces may pull the piece into at the point they stop it, each named by a
   * piece in it, for asking which one where there is more than one.
   */
  private zonesFor(pieces: readonly InterruptPiece[], point: MovePoint | null): InterruptZoneChoice[] {
    const inZones = [...new Set(pieces.filter((piece) => piece.member).flatMap((piece) => piece.zones))];
    const state = this.zones.stateNow();
    const named = (id: string) => {
      const view = state.zones.find((zone) => zone.id === id);
      const first = view?.members.map((member) => this.objectStore.get<GameCharacter>(member)?.name ?? '')[0] ?? '';
      return { id, name: first };
    };
    if (inZones.length > 0) return inZones.map(named);
    if (pieces.length < 1 || pieces[0].zones.length < 1 || !point) return [];
    return pieces[0].zones
      .filter((zone) => pieces.every((piece) => piece.zones.includes(zone)))
      .filter((zone) => {
        const view = state.zones.find((one) => one.id === zone);
        return !!view && zoneCovers(view.shape, point);
      })
      .map(named);
  }

  /** How far a piece goes stepping into a move, in table pixels: by the kind of move the room names for it. */
  private reachOf(piece: GameCharacter, table: GameTable): number {
    const rules = resolveRoomRules(this.config()?.roomRuleAnswers ?? null, table);
    const walk = exactMoveCellsOf(piece, rules.moveRangeElementNames, rules.cellDistance, rules.cellDistanceUnit);
    if (walk === null || walk <= 0) return 0;
    const kind = moveKindNamed(parseMoveKinds(this.config()?.moveKinds ?? ''), this.config()?.interruptKind ?? '');
    return lengthByKind(kind, walk, metresPerCell(rules)) * squarePxOf(table);
  }

  /**
   * The cursor of the peer that answers for a piece: its owner's, where its owner is here with a
   * version that knows of this and may change the table, and otherwise the game master lowest in
   * order that does. An owner made a guest answers for nothing, as with a piece nobody owns.
   */
  private responderOf(piece: GameCharacter): string | null {
    if (piece.owner) {
      const owner = PeerCursor.findByUserId(piece.owner);
      if (owner && owner.zoneProtocol === '1' && canRoleEdit(owner.role)) return owner.identifier;
    }
    const masters = this.objectStore
      .getObjects<PeerCursor>(PeerCursor)
      .filter((cursor) => cursor.isGameMaster && cursor.zoneProtocol === '1' && cursor.peerId.length > 0)
      .sort((a, b) => (a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0));
    return masters[0]?.identifier ?? null;
  }

  /** The way a cursor has declared, as points in table pixels. */
  private pathOf(cursor: PeerCursor, table: GameTable): MovePoint[] {
    if (cursor.movingPoints) return readMovingPoints(cursor.movingPoints);
    const grid = moveGridOf(table);
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
