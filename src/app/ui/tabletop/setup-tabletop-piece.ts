import { afterNextRender, DestroyRef, effect, ElementRef, inject, Signal, WritableSignal } from '@angular/core';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { PieceFootprint } from '@axe/application/ui/tabletop-overlap.service';
import { GridSnapStyle } from '@axe/domain/tabletop/game-table';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { InputHandler } from '@axe/ui/directives/input-handler';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { RotableOption, RotableTabletopObject, TurnAbout } from '@axe/ui/directives/rotable.directive';

export interface MovableSetup<T extends TabletopObject> {
  readonly target: Signal<T | null | undefined>;
  readonly collideLayers?: readonly string[];
  readonly snapStyle?: GridSnapStyle | ((t: T) => GridSnapStyle | undefined);
  readonly snapOrigin?: (t: T) => { x: number; y: number } | undefined;
  /** Where the piece goes when snapped from a place, ahead of the table's own snap; see {@link MovableOption}. */
  readonly snapToSquare?: (t: T, at: { x: number; y: number }) => { x: number; y: number } | null;
  readonly layerName?: string;
  /** How much of its face the piece covers; see {@link MovableOption}. */
  readonly footprint?: (t: T) => PieceFootprint;
  /** Where the piece turns about, for one that does not turn about its middle; see {@link RotableOption}. */
  readonly turnsAbout?: (t: T) => TurnAbout | null;
}

function applyMovableOption<T extends TabletopObject>(
  signal: WritableSignal<MovableOption>,
  piece: T,
  opts: MovableSetup<T>
): void {
  const snapStyle = typeof opts.snapStyle === 'function' ? opts.snapStyle(piece) : opts.snapStyle;
  const snapOrigin = opts.snapOrigin?.(piece);
  signal.set({
    tabletopObject: piece,
    colideLayers: opts.collideLayers ? [...opts.collideLayers] : undefined,
    snapStyle,
    snapOrigin,
    snapToSquare: opts.snapToSquare ? (at) => opts.snapToSquare!(piece, at) : undefined,
    layerName: opts.layerName,
    footprint: opts.footprint ? () => opts.footprint!(piece) : undefined,
  });
}

/**
 * Keeps a piece component's movable option in step with the piece it shows.
 *
 * Must be called in an injection context, since it registers an effect. Nothing is written
 * while there is no piece.
 */
export function setupMovableForPiece<T extends TabletopObject>(
  ctx: { readonly movableOption: WritableSignal<MovableOption> },
  opts: MovableSetup<T>
): void {
  effect(() => {
    const piece = opts.target();
    if (piece == null) return;
    applyMovableOption(ctx.movableOption, piece, opts);
  });
}

/**
 * Keeps a piece component's movable and rotable options in step with the piece it shows.
 *
 * Must be called in an injection context, since it registers an effect. Nothing is written
 * while there is no piece.
 */
export function setupMovableRotableForPiece<T extends RotableTabletopObject>(
  ctx: {
    readonly movableOption: WritableSignal<MovableOption>;
    readonly rotableOption: WritableSignal<RotableOption>;
  },
  opts: MovableSetup<T>
): void {
  const pieces = inject(TablePiecesService);
  effect(() => {
    const piece = opts.target();
    if (piece == null) return;
    applyMovableOption(ctx.movableOption, piece, opts);
    ctx.rotableOption.set({
      tabletopObject: piece,
      turnsAbout: () => (opts.turnsAbout ? opts.turnsAbout(piece) : pieces.turnAboutOf(piece)),
    });
  });
}

export interface InputHandlerSetup {
  readonly elementRef: ElementRef<HTMLElement>;
  readonly destroyRef: DestroyRef;
  readonly onStart?: (e: MouseEvent | TouchEvent) => void;
  readonly onMove?: (e: MouseEvent | TouchEvent) => void;
  readonly onEnd?: (e: MouseEvent | TouchEvent) => void;
}

export interface InputHandlerRef {
  current: InputHandler | null;
}

/**
 * Attaches an input handler to a component's host after its first render and destroys it with
 * the component.
 *
 * The returned reference holds nothing until that render, and nothing again once destroyed.
 */
export function setupInputHandler(opts: InputHandlerSetup): InputHandlerRef {
  const ref: InputHandlerRef = { current: null };
  afterNextRender(() => {
    const handler = new InputHandler(opts.elementRef.nativeElement);
    if (opts.onStart) handler.onStart = opts.onStart;
    if (opts.onMove) handler.onMove = opts.onMove;
    if (opts.onEnd) handler.onEnd = opts.onEnd;
    ref.current = handler;
  });
  opts.destroyRef.onDestroy(() => {
    ref.current?.destroy();
    ref.current = null;
  });
  return ref;
}
