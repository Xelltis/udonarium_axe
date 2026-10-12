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

/**
 * How high above a mount's base the one riding it stands, in cells: as written down, or half the
 * mount's size where nothing readable is.
 */
export function seatHeightOf(written: string, size: number): number {
  const value = Number(written);
  if (written.trim() !== '' && Number.isFinite(value) && value >= 0) return value;
  return Math.max(0, size) / 2;
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
}

/**
 * The piece whose turn a piece takes its own in, or empty for one that takes a turn of its own.
 *
 * One riding a mount in front takes the turn for the mount and for whoever sits behind: the three
 * act together. A load and a mount nobody rides in front take turns of their own.
 */
export function turnCarrierOf(id: string, pieces: readonly RideTurnPiece[]): string {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const frontOf = (mountId: string): string =>
    byId.get(mountId)?.mountable
      ? (pieces.find((one) => one.id !== mountId && one.ridingOn === mountId && seatOf(one.rideSeat) === 'rider')?.id ??
        '')
      : '';
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
export type RideMoveRefusal = 'mountMoved' | 'cannotAfterLeaving';

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
