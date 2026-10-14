/**
 * Where a piece rides a mount: in front, steering it; behind the one in front, as a second rider;
 * or carried, as a load the mount takes in place of a second rider.
 */
export type RideSeat = 'rider' | 'passenger' | 'cargo';

/** The seat a piece is written down as riding in: empty is the front. */
export function seatOf(written: string): RideSeat {
  if (written === 'passenger') return 'passenger';
  if (written === 'cargo') return 'cargo';
  return 'rider';
}

/** The seat as it is written down on the piece riding. */
export function writtenSeat(seat: RideSeat): string {
  return seat === 'rider' ? '' : seat;
}

/** What a mount takes besides the one riding in front. */
export interface MountRoom {
  /** Whether a second rider may sit behind the one in front. */
  readonly passenger: boolean;
  /** How many may be carried as a load; a mount that carries any takes no second rider. */
  readonly cargo: number;
}

/**
 * The seats still free on a mount: the front where nobody rides there, a second rider's where the
 * mount takes one, somebody rides in front and nobody sits behind yet, and a load's while the mount
 * carries fewer than it may.
 */
export function freeSeats(room: MountRoom, aboard: readonly RideSeat[]): RideSeat[] {
  const count = (seat: RideSeat) => aboard.filter((one) => one === seat).length;
  const free: RideSeat[] = [];
  if (count('rider') < 1) free.push('rider');
  if (room.cargo < 1 && room.passenger && count('rider') > 0 && count('passenger') < 1) free.push('passenger');
  if (count('cargo') < room.cargo) free.push('cargo');
  return free;
}

/** How many a mount may carry as a load, as it is written down: a whole number, nothing where it is not one. */
export function cargoRoomOf(written: string): number {
  const value = Number(written);
  return written.trim() !== '' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** What tells how tall a mount stands. */
export interface MountBody {
  /** How many cells across its base is. */
  readonly size: number;
  /** Whether its picture is given a height of its own rather than standing as wide as its base. */
  readonly specifyKomaImageFlag: boolean;
  /** The height its picture is given, in pixels, which counts only where it is given one. */
  readonly komaImageHeight: number;
}

/**
 * How tall a mount's picture stands, in cells, where the piece is given a height of its own, which
 * is how a towering piece is usually made; null where it is not.
 */
export function pictureHeightOf(mount: MountBody, gridSizePx: number): number | null {
  const picture = Number(mount.komaImageHeight);
  if (mount.specifyKomaImageFlag !== true || gridSizePx <= 0 || !Number.isFinite(picture) || picture <= 0) return null;
  return picture / gridSizePx;
}

/** How tall a mount stands, in cells: as tall as its picture where it is given a height, and as tall as its base is wide where it is not. */
export function mountHeightOf(mount: MountBody, gridSizePx: number): number {
  return pictureHeightOf(mount, gridSizePx) ?? Math.max(0, mount.size);
}

/**
 * Where a mount's riders are set to stand: a number of cells up, a number of pixels up, a part of
 * its height, or null for the default.
 */
export type SeatHeightSetting =
  { readonly cells: number } | { readonly px: number } | { readonly share: number } | null;

/** The units a mount's seat height is typed in: pixels, cells, or a percentage of the mount's height. */
export type SeatHeightUnit = 'px' | 'cells' | 'percent';

/**
 * Reads where a mount's riders are set to stand, as written down: a number of cells, a number of
 * pixels such as `380px`, a part of the mount's height as a percentage such as `75%`, or anything
 * else, empty included, for the default. A version that knows only cells reads pixels and
 * percentages as its own default.
 */
export function readSeatHeight(written: string): SeatHeightSetting {
  const text = written.trim();
  const unit = /^(\d+(?:\.\d+)?)(%|px)$/.exec(text);
  if (unit) return unit[2] === '%' ? { share: Number(unit[1]) / 100 } : { px: Number(unit[1]) };
  const value = Number(text);
  return text !== '' && Number.isFinite(value) && value >= 0 ? { cells: value } : null;
}

/** Writes where a mount's riders stand down as `readSeatHeight` reads it back: empty for the default. */
export function writeSeatHeight(setting: SeatHeightSetting): string {
  if (!setting) return '';
  if ('share' in setting) return `${Math.round(Math.max(0, setting.share) * 1000) / 10}%`;
  if ('px' in setting) return `${Math.max(0, setting.px)}px`;
  return `${Math.max(0, setting.cells)}`;
}

/**
 * How high above a mount's base the one riding it stands, in cells: as written down, in cells, in
 * pixels or as a part of the mount's height. Where nothing readable is, it stands at the top of
 * the mount's picture where the piece is given a height, which is the mount as drawn, and half as
 * high as its base is wide where it is not.
 */
export function seatHeightOf(written: string, mount: MountBody, gridSizePx: number): number {
  const setting = readSeatHeight(written);
  const height = mountHeightOf(mount, gridSizePx);
  if (setting && 'share' in setting) return height * setting.share;
  if (setting && 'px' in setting) return gridSizePx > 0 ? setting.px / gridSizePx : 0;
  if (setting) return setting.cells;
  return pictureHeightOf(mount, gridSizePx) !== null ? height : height / 2;
}

/** A seat height as a field shows it, a number in its unit, the percentage out of 100; null for the default. */
export function seatHeightFieldOf(
  setting: SeatHeightSetting
): { readonly value: number; readonly unit: SeatHeightUnit } | null {
  if (!setting) return null;
  if ('share' in setting) return { value: Math.round(setting.share * 1000) / 10, unit: 'percent' };
  if ('px' in setting) return { value: setting.px, unit: 'px' };
  return { value: setting.cells, unit: 'cells' };
}

/** A seat height from a number typed in a unit, the percentage out of 100; null where it is no number of 0 or more. */
export function seatHeightFromField(value: number, unit: SeatHeightUnit): SeatHeightSetting {
  if (!Number.isFinite(value) || value < 0) return null;
  if (unit === 'percent') return { share: value / 100 };
  if (unit === 'px') return { px: value };
  return { cells: value };
}

/**
 * Where a mount's riders stand, written in another unit, so they stay where they are as the unit
 * is changed: rounded to a tenth of a pixel, a hundredth of a cell or a tenth of a percent.
 */
export function seatHeightIn(
  unit: SeatHeightUnit,
  written: string,
  mount: MountBody,
  gridSizePx: number
): SeatHeightSetting {
  const cells = seatHeightOf(written, mount, gridSizePx);
  if (unit === 'px') return { px: Math.round(cells * gridSizePx * 10) / 10 };
  if (unit === 'cells') return { cells: Math.round(cells * 100) / 100 };
  const height = mountHeightOf(mount, gridSizePx);
  return { share: height > 0 ? Math.round((cells / height) * 1000) / 1000 : 0 };
}

/** Why a piece may not ride in front of a mount, or null where it may. */
export type FrontRefusal = 'needsSkill' | 'tooHard';

/** What deciding whether a piece may ride in front needs. */
export interface FrontInput {
  /** Whether the room names a field for the skill of steering a mount at all. */
  readonly skillNamed: boolean;
  /** The piece's value in that field, or null where it has none. */
  readonly skill: number | null;
  /** Whether anybody may ride the mount, skilled or not. */
  readonly anyone: boolean;
  /** What the mount asks of the skill, or null where it asks nothing or the room names no such field. */
  readonly required: number | null;
}

/**
 * Whether a piece steers a mount it rides in front of: anybody does where the room names no skill
 * for it, and otherwise one with that skill at one or more.
 */
export function steers(skillNamed: boolean, skill: number | null): boolean {
  return !skillNamed || (skill !== null && skill >= 1);
}

/**
 * Whether a piece may ride a mount in front. One that cannot steer may ride only a mount anybody may
 * ride; one that can, only a mount that asks no more of the skill than it has.
 */
export function frontRefusal(input: FrontInput): FrontRefusal | null {
  if (!steers(input.skillNamed, input.skill)) return input.anyone ? null : 'needsSkill';
  if (input.required !== null && (input.skill ?? 0) < input.required) return 'tooHard';
  return null;
}

/** A piece as whose turn it shares sees it. */
export interface RideTurnPiece {
  readonly id: string;
  readonly ridingOn: string;
  readonly rideSeat: string;
  readonly mountable: boolean;
  /** Whether the piece takes turns of its own at all; one that does not takes nobody else's either. Taken as so where not said. */
  readonly takesTurns?: boolean;
}

/**
 * The piece whose turn a piece takes its own in, or empty for one that takes a turn of its own.
 *
 * One riding a mount in front takes the turn for the mount and for whoever sits behind: the three
 * act together. A load and a mount nobody rides in front take turns of their own, as do a mount and
 * whoever sits behind where the one in front takes no turns.
 */
export function turnCarrierOf(id: string, pieces: readonly RideTurnPiece[]): string {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const frontOf = (mountId: string): string => {
    if (!byId.get(mountId)?.mountable) return '';
    const front = pieces.find(
      (one) => one.id !== mountId && one.ridingOn === mountId && seatOf(one.rideSeat) === 'rider'
    );
    return front && front.takesTurns !== false ? front.id : '';
  };
  const piece = byId.get(id);
  if (!piece) return '';
  if (piece.mountable) return frontOf(piece.id);
  if (piece.ridingOn !== '' && seatOf(piece.rideSeat) === 'passenger') return frontOf(piece.ridingOn);
  return '';
}

/**
 * A mark for the turn being taken, as its round and the piece whose turn it is, or empty while
 * nobody's turn is. The rules on getting on and off, and on moving after them, count by it and stop
 * nothing while it is empty.
 */
export function turnMarkOf(round: number, phase: string, current: string): string {
  return round > 0 && phase === 'acting' && current !== '' ? `${round}:${current}` : '';
}

/** The round a turn mark was made in, or 0 for one that is empty or cannot be read. */
export function roundOfMark(mark: string): number {
  const colon = mark.indexOf(':');
  const round = Number(mark.slice(0, colon));
  return colon > 0 && Number.isInteger(round) && round > 0 ? round : 0;
}

/** Why a piece may not get on or off a mount just now, or null where it may. */
export type RideChangeRefusal = 'changedThisTurn';

/** Whether a piece may get on or off a mount: once a turn, and as often as it likes outside turns. */
export function rideChangeRefusal(changedTurn: string, turn: string): RideChangeRefusal | null {
  return turn !== '' && changedTurn === turn ? 'changedThisTurn' : null;
}

/** Why a piece may not set out on a move just now, by the rules on riding, or null where it may. */
export type RideMoveRefusal = 'mountMoved' | 'cannotAfterLeaving' | 'riderHeld';

/** What deciding whether a piece may set out on a move, by the rules on riding, needs. */
export interface RideMoveInput {
  /** The mark of the turn being taken, empty while turns are not being taken. */
  readonly turn: string;
  /** Whether the piece would move a mount it rides in front, rather than itself. */
  readonly onMount: boolean;
  /** The mark of the turn the mount last moved in: the one ridden, or else the one just left. */
  readonly mountMovedTurn: string;
  /** The mark of the turn the piece last got on or off a mount in. */
  readonly changedTurn: string;
  /** Where the piece sat on the mount it last got off, or null where it has got off none since getting on. */
  readonly leftSeat: RideSeat | null;
  /** Whether the piece steers a mount. */
  readonly steers: boolean;
}

/**
 * Whether a piece may set out on a move, by the rules on riding.
 *
 * A mount moves in one turn a round: a rider moves it again only in the turn it already moved in. A
 * piece that got off a mount this turn moves on its own only where it rode in front and steers, or
 * was carried as a load, and the mount has not moved this round. Nothing is stopped while turns are
 * not being taken.
 */
export function rideMoveRefusal(input: RideMoveInput): RideMoveRefusal | null {
  if (input.turn === '') return null;
  const mountMoved = roundOfMark(input.mountMovedTurn) === roundOfMark(input.turn);
  if (input.onMount) return mountMoved && input.mountMovedTurn !== input.turn ? 'mountMoved' : null;
  if (input.changedTurn !== input.turn || input.leftSeat === null) return null;
  const walks = input.leftSeat === 'cargo' || (input.leftSeat === 'rider' && input.steers);
  return walks && !mountMoved ? null : 'cannotAfterLeaving';
}

/**
 * The mounts ridden in front among the pieces, each with the one riding it there. The two count as
 * one piece, as many as both together, for who may stop a move and who may leave a zone.
 */
export function frontRidersOf(pieces: readonly RideTurnPiece[]): Map<string, string> {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const front = new Map<string, string>();
  for (const piece of pieces) {
    const mount = byId.get(piece.ridingOn);
    if (!mount?.mountable || mount.id === piece.id || seatOf(piece.rideSeat) !== 'rider') continue;
    if (!front.has(mount.id)) front.set(mount.id, piece.id);
  }
  return front;
}

/**
 * Who falls off a mount when a piece goes down or falls over: the piece itself where it rides one,
 * everybody on it where it is a mount, and a load on the same mount where it rides that one in front.
 * Whoever sits behind stays on while only the one in front falls.
 */
export function fallersWhenDown(id: string, pieces: readonly RideTurnPiece[]): string[] {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const piece = byId.get(id);
  if (!piece) return [];
  const rides = (one: RideTurnPiece) => one.id !== one.ridingOn && byId.get(one.ridingOn)?.mountable === true;
  const inFront = rides(piece) && seatOf(piece.rideSeat) === 'rider';
  return pieces
    .filter((one) => rides(one))
    .filter(
      (one) =>
        one.id === id ||
        (piece.mountable && one.ridingOn === id) ||
        (inFront && one.ridingOn === piece.ridingOn && seatOf(one.rideSeat) === 'cargo')
    )
    .map((one) => one.id);
}

/** The shortest fall from a mount, in metres, where the room says nothing of its own. */
export const DEFAULT_FALL_MIN_M = 2;

/** What working out how far a piece falls off a mount needs, of the mount's moves. */
export interface FallInput {
  /** The mark of the turn being taken, empty while turns are not being taken. */
  readonly turn: string;
  /** The mark of the turn the mount last set out on a move in. */
  readonly movedTurn: string;
  /** How far, in metres, it set out to move in that turn. */
  readonly movedM: number;
  /** Whether the mount has had its turn this round. */
  readonly actedThisRound: boolean;
}

/**
 * How far the mount was moving, in metres, as a fall from it is measured: the move it set out on in
 * the turn being taken, and otherwise the one it made in its last turn, which is nothing where it
 * stood still then. Outside turns, the last move it made.
 */
export function fallFromM(input: FallInput): number {
  const movedM = Number.isFinite(input.movedM) && input.movedM > 0 ? input.movedM : 0;
  if (input.turn === '' || input.movedTurn === input.turn) return movedM;
  const round = roundOfMark(input.turn);
  const moved = roundOfMark(input.movedTurn);
  if (moved === round || (moved === round - 1 && !input.actedThisRound)) return movedM;
  return 0;
}

/** How far a piece falls, in metres: a fifth of how far the mount was moving, rounded up, and no less than the shortest fall. */
export function fallDistanceM(fromM: number, minM: number): number {
  return Math.max(minM, Math.ceil(Math.max(0, fromM) / 5));
}

/**
 * The name of the buff a chat buff command gives, or null for a command that gives none, such as
 * one that takes a buff away or moves every buff's rounds.
 */
export function buffNameOf(command: string): string | null {
  const body = command.trim().match(/^[tTｔＴ]?&[+＋]{0,2}[!！]?(.*)$/)?.[1];
  if (body === undefined) return null;
  const name = body.split('/')[0].trim();
  if (name.length < 1 || /^[RＲrｒ][-+]$/.test(name) || /^[DＤdｄ]$/.test(name) || name.endsWith('-')) return null;
  return name;
}

/**
 * The pieces whose ground stands in the way of a piece's move, leaving out, for a piece that is no
 * mount, the mounts and those riding them: ground the piece may walk onto to get on one.
 */
export function inTheWayOf<T extends RideTurnPiece>(mover: RideTurnPiece, pieces: readonly T[]): T[] {
  if (mover.mountable) return [...pieces];
  const mounts = new Set(pieces.filter((piece) => piece.mountable).map((piece) => piece.id));
  return pieces.filter((piece) => piece.id === mover.id || (!mounts.has(piece.id) && !mounts.has(piece.ridingOn)));
}
