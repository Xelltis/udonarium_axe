import { afterNextRender, DestroyRef, effect, ElementRef, Signal, WritableSignal } from '@angular/core';
import { GridSnapStyle } from '@axe/domain/tabletop/game-table';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { InputHandler } from '@axe/ui/directives/input-handler';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { RotableOption, RotableTabletopObject } from '@axe/ui/directives/rotable.directive';

export interface MovableSetup<T extends TabletopObject> {
  readonly target: Signal<T | null | undefined>;
  readonly collideLayers?: readonly string[];
  readonly snapStyle?: GridSnapStyle | ((t: T) => GridSnapStyle | undefined);
  readonly snapOrigin?: (t: T) => { x: number; y: number } | undefined;
  readonly transformCssOffset?: string;
  readonly layerName?: string;
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
    transformCssOffset: opts.transformCssOffset,
    colideLayers: opts.collideLayers ? [...opts.collideLayers] : undefined,
    snapStyle,
    snapOrigin,
    layerName: opts.layerName,
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
  effect(() => {
    const piece = opts.target();
    if (piece == null) return;
    applyMovableOption(ctx.movableOption, piece, opts);
    ctx.rotableOption.set({ tabletopObject: piece });
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
