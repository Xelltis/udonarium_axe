import { GameCharacter } from '@axe/domain/character/game-character';
import { PartyAlliance } from '@axe/domain/party/party-alliance';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { allowsDiagonal } from '@axe/domain/tabletop/move/diagonal-move';
import {
  breakOutToll,
  Engagement,
  engagementOf,
  engagementsOn,
  Fights,
  fightsByCell,
  leavesFight,
} from '@axe/domain/tabletop/move/engagement';
import { isWalkableStep } from '@axe/domain/tabletop/move/landing-height';
import { moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { moveModeTermsOf } from '@axe/domain/tabletop/move/move-mode';
import { STEPS_PER_CELL, stepsFor } from '@axe/domain/tabletop/move/move-steps';
import { pieceFitsOn } from '@axe/domain/tabletop/move/piece-footprint';
import { PassageCells, passageCells, PiecePassageMode } from '@axe/domain/tabletop/move/piece-passage';
import { PieceRelation } from '@axe/domain/tabletop/move/piece-relation';
import { reachableCells, ReachOptions } from '@axe/domain/tabletop/move/reachable-cells';
import { isHostileTo, zoneOfControl } from '@axe/domain/tabletop/move/zone-of-control';
import { RoomRules } from '@axe/domain/tabletop/room-rules';
import { ZoneReachTerms } from '@axe/domain/tabletop/zone/zone-queries';

/** What the table does with the ground a piece of this standing stands on. */
function passageModeOf(rules: RoomRules, relation: PieceRelation): PiecePassageMode {
  if (relation === 'same') return rules.samePartyPassage;
  return relation === 'other' ? rules.otherPartyPassage : rules.noPartyPassage;
}

/**
 * What a cell costs where nothing is painted on it and nobody is holding it.
 *
 * Handed over even when there is nothing to charge for, since the search counts in steps and
 * would otherwise take its own default of one step - half a cell - for plain ground.
 */
const PLAIN_GOING = () => STEPS_PER_CELL;

export interface MoveRangeView {
  characterIdentifier: string;
  grid: CellGrid;
  cells: CellBits;
  /** The ground the enemies hold, which is why the reach stops where it does. */
  held: CellBits | null;
  /** Whether the reach itself is drawn, or only the ground held against the piece. */
  showsReach: boolean;
}

/** What it takes to price a way somebody actually walked, kept from when the piece was lifted. */
export interface WalkTerms {
  /** How far it walks, in steps rather than in cells: a road is crossed in half a cell. */
  walk: number;
  blocked: CellBits;
  /** The same, for a piece that means to jump: height stops it no longer, sheer faces still do. */
  leapt: CellBits;
  options: ReachOptions;
}

/**
 * Everything a walk is worked out from, for anyone who wants to work out a different one.
 *
 * What it holds is counted in steps, two to the cell, and so is everything `costOf` answers.
 */
export interface ReachTerms extends WalkTerms {
  grid: CellGrid;
  start: number;
  cells: CellBits;
  /**
   * The same reach for a piece that means to jump.
   *
   * Worked out when it is asked for rather than alongside the other: every piece the room is
   * watching move has its reach drawn afresh on every redraw, and most of them are walking.
   */
  leaptCells: () => CellBits;
}

/** A reach as it was worked out: what is drawn, what it was walked under, and where it set out from. */
export interface BuiltReach {
  view: MoveRangeView;
  terms: WalkTerms;
  start: number;
}

/** What a reach is worked out from, once the board has been read. */
export interface ReachInputs {
  readonly character: GameCharacter;
  readonly table: GameTable;
  readonly rules: RoomRules;
  readonly grid: CellGrid;
  /** The cell the piece sets out from. */
  readonly start: number;
  /** How far it may go, in whole cells, by the kind of move it makes. */
  readonly walk: number;
  /** What the zones make of the move; null where they say nothing of this piece. */
  readonly zones: ZoneReachTerms | null;
  /** The ground the terrain closes to a walk and to a jump, the reach's own to write over. */
  readonly closed: { readonly blocked: CellBits; readonly leapt: CellBits };
  /** How high the ground stands under every cell. */
  readonly heights: Float64Array;
  /** How high the ground the piece sets out from stands. */
  readonly standingPx: number;
  /** The pieces the person moving can see, the piece itself among them. */
  readonly standing: readonly GameCharacter[];
  /** Those of them whose ground stands in the piece's way. */
  readonly inTheWay: readonly GameCharacter[];
  readonly allied: PartyAlliance;
  /** What the ground charges, cell by cell; asked only of a piece that pays for the ground. */
  readonly dearGround: () => Float64Array | null;
}

/**
 * The ground somebody else stands on as it is in the way of a piece: shut to it, dear to cross, or
 * ground it walks over without being able to stop on.
 */
export function piecePassageOf(
  grid: CellGrid,
  character: GameCharacter,
  inTheWay: readonly GameCharacter[],
  rules: RoomRules,
  allied: PartyAlliance
): PassageCells {
  return passageCells(
    grid,
    inTheWay,
    character,
    (relation) => passageModeOf(rules, relation),
    rules.sizeSlipsPast,
    allied
  );
}

/** Works out a piece's reach from what was read of the board, and what it was walked under. */
export function buildReach(inputs: ReachInputs): BuiltReach {
  const {
    character,
    table,
    rules,
    grid,
    start,
    walk,
    zones,
    closed,
    heights,
    standingPx,
    standing,
    inTheWay,
    allied,
    dearGround,
  } = inputs;
  const going = moveModeTermsOf(character.moveMode);
  let blocked = closed.blocked;
  // Only the terrain differs between walking and jumping; everything else stands in the way
  // of both, so it is gathered once and laid over each of them.
  const leapt = closed.leapt;
  // What a piece can step to is ground rather than something to walk around: the tops of
  // the blocks it is already standing on, and anything within a cell of them, up or down.
  // A wall is only a wall to somebody it rises over.
  for (let cell = 0; cell < heights.length; cell++) {
    if (!blocked.get(cell)) continue;
    // A face too sheer to be stood on is the one thing a step does not answer.
    if (leapt.get(cell)) continue;
    if (!isWalkableStep(heights[cell], standingPx, table.gridSize)) continue;
    blocked.unset(cell);
  }
  const otherwise = new CellBits(cellCount(grid));
  const painted = moveBlockMapOn(table)?.read(grid);
  if (painted) otherwise.or(painted);
  if (zones?.blocked) otherwise.or(zones.blocked);

  const passage = piecePassageOf(grid, character, inTheWay, rules, allied);
  otherwise.or(passage.blocked);

  // What the ground itself charges, which is owed by whoever enters it whatever else is
  // happening on the board.
  // A piece over the ground owes the ground nothing: a bog is no harder to cross than a
  // floor when the feet are not in it.
  const dear = going.paysGround ? dearGround() : null;

  const mode = rules.zocMode;
  const ground = mode === 'none' ? null : heldGroundAround(grid, character, standing, rules, allied);
  const held = ground?.held ?? null;
  if (held && mode === 'block') otherwise.or(held);
  blocked.or(otherwise);
  leapt.or(otherwise);
  // What stops a jump is what stops a piece that goes over things rather than round them.
  if (going.clears) blocked = leapt;
  const extra = Math.max(0, Math.floor(rules.zocExtraCost));
  const fights = rules.breakOutMode === 'free' ? null : (ground?.fights ?? null);
  const flat = Math.max(0, Math.floor(rules.breakOutCost));
  const crossing = passage.costly.isEmpty ? 0 : Math.max(0, Math.floor(rules.piecePassageCost));
  const noStop = passage.noStop.isEmpty ? null : passage.noStop;
  // A wide piece is answered for the cell its middle would be over, so where every cell it
  // covers has to be clear is asked here rather than by the search, which knows of one cell
  // at a time.
  const fits = pieceFitsOn(grid, character, table.gridSize, blocked);
  // Folding through a gap too small: the piece stands there as though it were a size
  // smaller. A piece two cells across folds down to one, which any clear cell holds, so
  // there is nothing left to ask and the answer is yes.
  const tight =
    fits && rules.squeezes
      ? (pieceFitsOn(grid, character, table.gridSize, blocked, Math.round(character.size) - 1) ?? (() => true))
      : null;
  // A piece wider than one cell cannot pass through a gap it could not stand in. The search
  // asks about the cell its middle would be over, so a golem three across would otherwise
  // thread a one-cell doorway and come out the far side of it. Worked out in full before any
  // of it is written down, since each answer is read off the ground as it stands.
  // Which cells are reached only folded up is written down here rather than asked again once
  // the search is running: folding the too-narrow cells into `blocked` just below changes what
  // `fits` and `tight` answer, since both read that set as it stands rather than as it stood.
  const squeezed = tight ? new CellBits(cellCount(grid)) : null;
  if (fits) {
    const total = cellCount(grid);
    const tooNarrow = new CellBits(total);
    for (let cell = 0; cell < total; cell++) {
      if (blocked.get(cell) || fits(cell)) continue;
      if (tight?.(cell) ?? false) {
        squeezed?.set(cell);
        continue;
      }
      tooNarrow.set(cell);
    }
    blocked.or(tooNarrow);
  }
  const charges =
    dear !== null ||
    going.toll > 0 ||
    crossing > 0 ||
    squeezed !== null ||
    (held !== null && mode === 'cost') ||
    fights !== null;

  // Everything the search is handed is in steps rather than in cells, since a road is
  // crossed in half of one. Prices are worked out in cells, the way a table talks about
  // them, and turned at the last moment.
  const options: ReachOptions = {
    diagonals: rules.diagonalMove,
    costOf: charges
      ? (index, from) => {
          let price = 1 + going.toll + (dear ? dear[index] : 0);
          // Squeezing costs the step again, which is what makes a gap worth going round.
          if (squeezed?.get(index)) price += 1;
          if (crossing > 0 && passage.costly.get(index)) price += crossing;
          if (held && mode === 'cost' && held.get(index)) price += extra;
          if (fights && leavesFight(fights, from, index)) {
            price += breakOutToll(rules.breakOutMode, fights.prices[from], flat);
          }
          return stepsFor(price);
        }
      : PLAIN_GOING,
    stopsAt: stopsWhere(held && mode === 'stop' ? held : null, zones?.stops ?? null),
    // Where a wide piece may stand is settled by what it may enter at all, above; what is
    // left here is ground somebody else is holding, which is crossed but not stopped on.
    restsAt: noStop ? (index) => !noStop.get(index) : undefined,
  };
  const steps = stepsFor(walk);
  const cells = reachableCells(grid, start, steps, (index) => blocked.get(index), options);
  return {
    view: { characterIdentifier: character.identifier, grid, cells, held, showsReach: true },
    terms: { walk: steps, blocked, leapt, options },
    start,
  };
}

/**
 * The ground the enemies on the board hold against this piece.
 *
 * Only the ones the person moving can see hold any, which is what it is handed: a range with
 * a bite taken out of it where nobody is standing tells the table there is something in the
 * dark there, which is the one thing the fog is for.
 *
 * Where the table holds a fight as one place rather than as pairs, the whole of the fight
 * this piece is in holds it, allies and all, and getting out of it costs what the two sides
 * come to when they are weighed against one another. A side that outweighs the other walks
 * away as though the fight were not there, which is the whole of what breaking through is.
 */
function heldGroundAround(
  grid: CellGrid,
  mover: GameCharacter,
  seen: readonly GameCharacter[],
  rules: RoomRules,
  allied: PartyAlliance
): HeldGround | null {
  const cutsCorners = allowsDiagonal(rules.diagonalMove);
  const foes = seen.filter((piece) => isHostileTo(piece, mover, rules.hostilityBy, allied));
  if (!rules.zocEngages) {
    const held = zoneOfControl(grid, foes, rules.zocRange, cutsCorners);
    return held.isEmpty ? null : { held, fights: null };
  }
  if (foes.length < 1) return null;

  const caught = engagementOf(engagementsOn(grid, seen, cutsCorners, rules.hostilityBy, allied), mover);
  const held = zoneOfControl(grid, holdersOf(mover, foes, caught), rules.zocRange, cutsCorners);
  const fights = fightsByCell(grid, mover, seen, rules.engagementCountsSize, cutsCorners, rules.hostilityBy, allied);
  return { held: held.isEmpty ? null : held, fights };
}

/** The ground held against a piece, and the fights it would have to walk out of to get anywhere. */
interface HeldGround {
  held: CellBits | null;
  fights: Fights | null;
}

/**
 * Who holds ground against the piece being moved.
 *
 * The fight it is in holds it whole, so the pieces on its own side are in the reckoning too:
 * standing among friends is standing in the thick of it, not standing clear.
 */
function holdersOf(mover: GameCharacter, foes: readonly GameCharacter[], caught: Engagement | null): GameCharacter[] {
  const holding = new Map<string, GameCharacter>();
  for (const piece of foes) holding.set(piece.identifier, piece);
  for (const piece of caught?.members ?? []) holding.set(piece.identifier, piece);
  holding.delete(mover.identifier);
  return [...holding.values()];
}

/** The cells a walk ends on: ground an enemy holds, where the table stops a piece there, and zones that hold it. */
function stopsWhere(held: CellBits | null, zones: CellBits | null): ((index: number) => boolean) | undefined {
  if (!held && !zones) return undefined;
  return (index) => (held?.get(index) ?? false) || (zones?.get(index) ?? false);
}
