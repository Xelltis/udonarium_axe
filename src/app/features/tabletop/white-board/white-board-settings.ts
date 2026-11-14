import { clamp } from '@axe/core/util/clamp';
import {
  clampBoardPitch,
  MAX_BOARD_PITCH,
  MIN_BOARD_PITCH,
  setBoardHeightKeepingFoot,
  WhiteBoard,
} from '@axe/domain/tabletop/white-board';

const MIN_SIDE = 1;
const MAX_SIDE = 40;

/** The face a board has when nothing has been chosen for it. */
const DEFAULT_FACE = '#f4f1e8';

/** What the settings ask of the editor they are shown in. */
export interface BoardSettingsHost {
  /** The board being edited, or null before the editor is pointed at one. */
  board(): WhiteBoard | null;
  /** The size of one table cell, in pixels. */
  gridSize(): number;
  /** Reads whatever tells the editor's view that the board has changed. */
  track(): void;
  /** Titles the panel the editor stands in. */
  retitle(name: string): void;
  /** Says a setting of the board has changed. */
  changed(): void;
  /** Says the board's sides have changed, so the sheet is given the new room. */
  resized(): void;
}

/**
 * The board's own settings as the editor's form reads and writes them: its name, its sides, how it
 * stands on the table and what its face looks like.
 *
 * Every value is the board's, read as it stands; a write goes straight to the board.
 */
export class BoardSettings {
  readonly minPitch = MIN_BOARD_PITCH;
  readonly maxPitch = MAX_BOARD_PITCH;
  readonly minSide = MIN_SIDE;
  readonly maxSide = MAX_SIDE;

  private faceWas = 1;

  constructor(private readonly host: BoardSettingsHost) {}

  /** The board's name, which also titles the editor's panel. */
  get name(): string {
    this.host.track();
    return this.host.board()?.name ?? '';
  }
  set name(value: string) {
    const board = this.host.board();
    if (!board) return;
    board.name = value;
    this.host.retitle(value);
    this.host.changed();
  }

  /**
   * How many grid cells wide the board is.
   *
   * A new width is held within the allowed sides, and the drawing surface grows or shrinks with it.
   */
  get width(): number {
    this.host.track();
    return this.host.board()?.width ?? 1;
  }
  set width(value: number) {
    const board = this.host.board();
    if (board) board.width = clampSide(value);
    this.host.resized();
  }

  /**
   * How many grid cells deep the board is.
   *
   * A new height keeps the board's bottom edge where it stands on the table, and the drawing surface
   * grows or shrinks with it.
   */
  get height(): number {
    this.host.track();
    return this.host.board()?.height ?? 1;
  }
  set height(value: number) {
    const board = this.host.board();
    if (board) setBoardHeightKeepingFoot(board, clampSide(value), this.host.gridSize());
    this.host.resized();
  }

  /** How far the board is tilted up off the table, in degrees held within the board's pitch limits. */
  get pitch(): number {
    this.host.track();
    return this.host.board()?.pitch ?? 0;
  }
  set pitch(value: number) {
    const board = this.host.board();
    if (board) board.pitch = clampBoardPitch(value);
    this.host.changed();
  }

  /** How far the board is turned on the table, in whole degrees. */
  get rotate(): number {
    this.host.track();
    return this.host.board()?.rotate ?? 0;
  }
  set rotate(value: number) {
    const board = this.host.board();
    if (board) board.rotate = Math.round(Number(value)) % 360;
    this.host.changed();
  }

  /** How much the board's face shows, as 0 to 100; a change is sent to the room at once. */
  get opacityPercent(): number {
    this.host.track();
    return Math.round((this.host.board()?.opacity ?? 1) * 100);
  }
  set opacityPercent(value: number) {
    const board = this.host.board();
    if (!board) return;
    board.opacity = clamp(Math.round(Number(value)), 0, 100) / 100;
    board.update();
    this.host.changed();
  }

  /**
   * Whether the board itself shows at all.
   *
   * A board with no face is a sheet of marks hanging in the air over the table, which is what
   * anyone wants when the drawing is meant to sit over the map rather than beside it. The
   * face it had is remembered, so turning it back on does not lose the colour it was.
   */
  get isSeeThrough(): boolean {
    this.host.track();
    return (this.host.board()?.opacity ?? 1) <= 0;
  }
  set isSeeThrough(value: boolean) {
    const board = this.host.board();
    if (!board) return;
    if (value) {
      this.faceWas = board.opacity > 0 ? board.opacity : this.faceWas;
      this.opacityPercent = 0;
      return;
    }
    this.opacityPercent = Math.round(this.faceWas * 100);
  }

  /** How much of the board's own face shows, which is what the chequer shows through. */
  get faceOpacity(): number {
    this.host.track();
    return this.host.board()?.opacity ?? 1;
  }

  /** The colour of the board's face. */
  get boardColor(): string {
    this.host.track();
    return this.host.board()?.color ?? DEFAULT_FACE;
  }
  set boardColor(value: string) {
    const board = this.host.board();
    if (board) board.color = value;
    this.host.changed();
  }

  /** Whether the board casts a shadow on the table. */
  get isDropShadow(): boolean {
    this.host.track();
    return this.host.board()?.isDropShadow ?? true;
  }
  set isDropShadow(value: boolean) {
    const board = this.host.board();
    if (board) board.isDropShadow = value;
    this.host.changed();
  }

  /** Whether the board is locked in place on the table. */
  get isLock(): boolean {
    this.host.track();
    return this.host.board()?.isLock ?? false;
  }
  set isLock(value: boolean) {
    const board = this.host.board();
    if (board) board.isLock = value;
    this.host.changed();
  }
}

function clampSide(value: number): number {
  const side = Math.round(Number(value));
  if (!Number.isFinite(side)) return MIN_SIDE;
  return clamp(side, MIN_SIDE, MAX_SIDE);
}
