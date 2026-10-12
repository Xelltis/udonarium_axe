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
