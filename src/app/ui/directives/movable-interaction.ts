import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { resolveMovableLocalCoordinate } from '@axe/ui/directives/movable-helpers';

export interface MovableInteractionContext {
  isGridSnap: boolean;
  isDisable(): boolean;
  isReadOnly(): boolean;
  isScratcOwner(): boolean;
  /** Nothing until the directive is set up, and set for as long as it is. */
  input: {
    isGrabbing: boolean;
    isDragging: boolean;
    pointer: { x: number; y: number; z: number };
    cancel(): void;
  } | null;
  pointerDeviceService: PointerDeviceService;
  coordinateService: CoordinateService;
  nativeElement: HTMLElement;
  /** The face the piece stands on, named as its location names it. */
  currentSurface(): string;
  /** How much of its face the piece covers, or null where its element is as large as that. */
  footprintNow(): { width: number; height: number } | null;
  contactSupportZ(centerX: number, centerY: number): number;
  posX: number;
  posY: number;
  posZ: number;
  width: number;
  height: number;
  ratio: number;
  pointerOffset2d: { x: number; y: number; z: number };
  pointerStart3d: { x: number; y: number; z: number };
  /** How large the piece was drawn where it was taken up, or null before the table has a camera. */
  startDrawnScale: number | null;
  onstart: { emit(e: PointerEvent): void };
  ondragstart: { emit(e: PointerEvent): void };
  ondrag: { emit(e: PointerEvent): void };
  ondragend: { emit(e: PointerEvent): void };
  onend: { emit(e: PointerEvent): void };
  setPointerEvents(isEnable: boolean): void;
  setAnimatedTransition(isEnable: boolean): void;
  setCollidableLayer(isCollidable: boolean): void;
  cancel(): void;
  cancelTableGesture(): void;
  snapToGrid(gridSize?: number): void;
}

/** The presses a piece has already taken up, so the pieces it stands inside leave them alone. */
const takenPresses = new WeakSet<Event>();

/**
 * Whether a press has already been taken up by a piece drawn inside this one, as a piece stuck to a
 * white board is drawn inside the board. A press reaches the inner piece first, on its way out.
 */
export function isPressTaken(e: Event): boolean {
  return takenPresses.has(e);
}

/** Says a press has been taken up, so a piece this one stands inside does not take it up as well. */
export function takePress(e: Event): void {
  takenPresses.add(e);
}

/**
 * Takes up a piece when it is pressed.
 *
 * A locked piece (disabled for anyone but its scratch owner, or on a read-only role) and a
 * middle or right press cancel instead; a right press on an unlocked piece also stops the
 * table's own gesture from starting under it. Otherwise it records the piece's size, as its
 * element is laid out or as its footprint says, and how far its middle sits from the pointer, so
 * the drag keeps that offset.
 */
export function handleInputStart(context: MovableInteractionContext, e: MouseEvent | TouchEvent): void {
  const input = context.input;
  if (!input) return;
  const isLocked = (context.isDisable() && !context.isScratcOwner()) || context.isReadOnly();
  const isContextMenuButton = (e as MouseEvent).button === 1 || (e as MouseEvent).button === 2;
  if (isLocked || isContextMenuButton) {
    if (isContextMenuButton && !isLocked) context.cancelTableGesture();
    return context.cancel();
  }

  context.onstart.emit(e as PointerEvent);

  context.setPointerEvents(false);
  context.setAnimatedTransition(false);
  context.setCollidableLayer(true);

  const footprint = context.footprintNow();
  context.width = footprint ? footprint.width : context.nativeElement.clientWidth;
  context.height = footprint ? footprint.height : context.nativeElement.clientHeight;

  const target3d = {
    x: context.posX + context.width / 2,
    y: context.posY + context.height / 2,
    z: context.posZ,
  };
  const target2d = context.coordinateService.convertFromFace(target3d, context.currentSurface());

  context.setPointerEvents(true);

  context.pointerOffset2d.x = target2d.x - input.pointer.x;
  context.pointerOffset2d.y = target2d.y - input.pointer.y;
  context.pointerOffset2d.z = target2d.z - input.pointer.z;

  context.pointerStart3d.x = target3d.x;
  context.pointerStart3d.y = target3d.y;
  context.pointerStart3d.z = target3d.z;

  context.startDrawnScale = context.coordinateService.drawnScaleOnFace(target3d, context.currentSurface());
  context.ratio = 1.0;
}

/**
 * Moves a held piece to follow the pointer, resting it on whatever is under its middle.
 *
 * The drag is cancelled once the pointer service no longer reports a drag, or the piece has
 * become locked. `ondragstart` is emitted on the first move that changes the position and
 * `ondrag` on each one. A scratch owner's piece is not moved.
 */
export function handleInputMove(context: MovableInteractionContext, e: MouseEvent | TouchEvent): void {
  const input = context.input;
  if (!input) return;
  if (input.isGrabbing && !context.pointerDeviceService.isDragging) {
    return context.cancel();
  }

  if ((context.isDisable() && !context.isScratcOwner()) || context.isReadOnly() || !input.isGrabbing)
    return context.cancel();

  if (e.cancelable) e.preventDefault();

  if (!input.isDragging) context.setPointerEvents(false);

  const pointer2d = dragPointer2d(context);

  const pointer3d = resolveMovableLocalCoordinate(
    context.coordinateService,
    context.currentSurface(),
    pointer2d,
    (centerX, centerY) => context.contactSupportZ(centerX, centerY)
  );
  pointer3d.x -= context.width / 2;
  pointer3d.y -= context.height / 2;

  if (context.posX === pointer3d.x && context.posY === pointer3d.y && context.posZ === pointer3d.z) return;

  if (!input.isDragging) context.ondragstart.emit(e as PointerEvent);
  context.ondrag.emit(e as PointerEvent);

  const drawnScale = context.coordinateService.drawnScaleOnFace(
    { x: context.posX + context.width / 2, y: context.posY + context.height / 2, z: context.posZ },
    context.currentSurface()
  );
  if (drawnScale !== null && context.startDrawnScale) {
    const ratio = drawnScale / context.startDrawnScale;
    if (ratio < context.ratio) context.ratio += (ratio - context.ratio) * 0.1;
  }

  if (!context.isScratcOwner()) {
    context.posX = pointer3d.x;
    context.posY = pointer3d.y;
    context.posZ = pointer3d.z;
  }
}

/**
 * The screen point the middle of a held piece follows: the pointer plus the offset it was
 * grabbed at, kept just inside the window.
 */
export function dragPointer2d(context: MovableInteractionContext): { x: number; y: number; z: number } {
  const pointer = context.input?.pointer ?? { x: 0, y: 0, z: 0 };
  return {
    x: Math.min(window.innerWidth - 0.1, Math.max(pointer.x + context.pointerOffset2d.x * context.ratio, 0.1)),
    y: Math.min(window.innerHeight - 0.1, Math.max(pointer.y + context.pointerOffset2d.y * context.ratio, 0.1)),
    z: 0,
  };
}

/**
 * Puts a held piece down when the pointer is released.
 *
 * A piece that was actually dragged emits `ondragend` and snaps to the grid when the table
 * asks for it; every release then cancels the drag and emits `onend`. A disabled or read-only
 * piece is cancelled without either event.
 */
export function handleInputEnd(context: MovableInteractionContext, e: MouseEvent | TouchEvent): void {
  const input = context.input;
  if (!input) return;
  if (context.isDisable() || context.isReadOnly()) return context.cancel();
  if (input.isDragging) context.ondragend.emit(e as PointerEvent);
  if (context.isGridSnap && input.isDragging && !context.isScratcOwner()) context.snapToGrid();
  context.cancel();
  context.onend.emit(e as PointerEvent);
}

/**
 * Ends a drag when a context menu is asked for partway through it.
 *
 * A dragged piece snaps to the grid first. When the menu was opened by a real press while the
 * piece was held, a copy of the event is dispatched on the piece so its own menu still opens.
 */
export function handleContextMenu(context: MovableInteractionContext, e: MouseEvent | TouchEvent): void {
  const input = context.input;
  if (!input) return;
  if (context.isDisable()) return context.cancel();
  if (e.cancelable) e.preventDefault();

  if (context.isGridSnap && input.isDragging) context.snapToGrid();

  const needsDispatch = input.isGrabbing && e.isTrusted;
  context.cancel();

  if (needsDispatch) {
    e.stopPropagation();
    const ev = new MouseEvent(e.type, e);
    context.nativeElement.dispatchEvent(ev);
  }
}
