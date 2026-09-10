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
  surfaceElement(): HTMLElement;
  contactSupportZ(centerX: number, centerY: number): number;
  posX: number;
  posY: number;
  posZ: number;
  width: number;
  height: number;
  ratio: number;
  pointerOffset2d: { x: number; y: number; z: number };
  pointerStart3d: { x: number; y: number; z: number };
  targetStartRect: DOMRect;
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
  scratchObjectPosition(start: boolean): void;
}

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

  context.width = context.nativeElement.clientWidth;
  context.height = context.nativeElement.clientHeight;

  const target3d = {
    x: context.posX + context.width / 2,
    y: context.posY + context.height / 2,
    z: context.posZ,
  };
  const target2d = context.coordinateService.convertToGlobal(target3d, context.surfaceElement());

  context.setPointerEvents(true);

  context.pointerOffset2d.x = target2d.x - input.pointer.x;
  context.pointerOffset2d.y = target2d.y - input.pointer.y;
  context.pointerOffset2d.z = target2d.z - input.pointer.z;

  context.pointerStart3d.x = target3d.x;
  context.pointerStart3d.y = target3d.y;
  context.pointerStart3d.z = target3d.z;

  context.targetStartRect = context.nativeElement.getBoundingClientRect();

  if (context.isScratcOwner()) {
    context.scratchObjectPosition(true);
  }

  context.ratio = 1.0;
}

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
    context.surfaceElement(),
    pointer2d,
    (centerX, centerY) => context.contactSupportZ(centerX, centerY)
  );
  pointer3d.x -= context.width / 2;
  pointer3d.y -= context.height / 2;

  if (context.posX === pointer3d.x && context.posY === pointer3d.y && context.posZ === pointer3d.z) return;

  if (!input.isDragging) context.ondragstart.emit(e as PointerEvent);
  context.ondrag.emit(e as PointerEvent);

  const targetRect = context.nativeElement.getBoundingClientRect();
  const ratio = targetRect.width / context.targetStartRect.width;
  if (ratio < context.ratio) {
    context.ratio += (ratio - context.ratio) * 0.1;
  }

  if (!context.isScratcOwner()) {
    context.posX = pointer3d.x;
    context.posY = pointer3d.y;
    context.posZ = pointer3d.z;
  } else {
    context.scratchObjectPosition(false);
  }
}

export function dragPointer2d(context: MovableInteractionContext): { x: number; y: number; z: number } {
  const pointer = context.input?.pointer ?? { x: 0, y: 0, z: 0 };
  return {
    x: Math.min(window.innerWidth - 0.1, Math.max(pointer.x + context.pointerOffset2d.x * context.ratio, 0.1)),
    y: Math.min(window.innerHeight - 0.1, Math.max(pointer.y + context.pointerOffset2d.y * context.ratio, 0.1)),
    z: 0,
  };
}

export function handleInputEnd(context: MovableInteractionContext, e: MouseEvent | TouchEvent): void {
  const input = context.input;
  if (!input) return;
  if (context.isDisable() || context.isReadOnly()) return context.cancel();
  if (input.isDragging) context.ondragend.emit(e as PointerEvent);
  if (context.isGridSnap && input.isDragging && !context.isScratcOwner()) context.snapToGrid();
  context.cancel();
  context.onend.emit(e as PointerEvent);
}

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
