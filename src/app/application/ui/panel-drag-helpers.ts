/** A box on the screen, in the terms `getBoundingClientRect` answers in. */
export interface DragRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a frame may be dropped on, and how far forward it stands. */
export interface PanelDropZone {
  bar: DragRect;
  strip: DragRect | null;
  /** How far forward the frame stands, so the one in front takes a drop meant for it. */
  z: number;
}

export interface TabbablePanelFacts {
  isCutIn: boolean;
  cutInIdentifier: string;
  layer: number;
  frameless: boolean;
  invisible: boolean;
  ghost: boolean;
  windowed: boolean;
}

/**
 * Whether a panel may share a frame with others.
 *
 * A cut-in is a window of its own making, wearing no box and sometimes no picture at all; a
 * panel given a shelf of its own is there to sit above something in particular, which a tab
 * cannot do; one in a window of its own is wearing the operating system's frame rather than
 * one of ours.
 */
export function isTabbablePanel(facts: TabbablePanelFacts): boolean {
  if (facts.isCutIn || facts.cutInIdentifier.length > 0) return false;
  if (facts.layer !== 0) return false;
  if (facts.frameless || facts.invisible || facts.ghost) return false;
  return !facts.windowed;
}

function holds(rect: DragRect | null, x: number, y: number): boolean {
  if (!rect) return false;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Which zone a bar let go of here would join: the one in front, where they overlap.
 *
 * Only the bar and the row of names take a drop. Dropping on the body of a panel is how a
 * panel is put down beside another rather than into it, which is what dragging has always
 * done and goes on doing.
 */
export function findDropZone<T extends { zone: PanelDropZone }>(
  pointer: { x: number; y: number },
  zones: readonly T[]
): T | null {
  let found: T | null = null;
  for (const entry of zones) {
    if (!holds(entry.zone.bar, pointer.x, pointer.y) && !holds(entry.zone.strip, pointer.x, pointer.y)) continue;
    if (!found || entry.zone.z >= found.zone.z) found = entry;
  }
  return found;
}

/** Where the pointer is, whether it came from a mouse or a finger. */
export function pointerOf(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ('touches' in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

/** Where a name let go of at this point lands in a row of them. */
export function tabInsertIndex(x: number, pills: readonly DragRect[]): number {
  for (const [index, pill] of pills.entries()) {
    if (x < pill.left + (pill.right - pill.left) / 2) return index;
  }
  return pills.length;
}

/**
 * Where a panel pulled out of a group stands: under the pointer that pulled it, on screen.
 *
 * Held by its bar rather than by its middle, since that is where the hand is.
 */
export function tearOffBox(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): { left: number; top: number } {
  const left = Math.max(0, Math.min(pointer.x - size.width / 2, Math.max(0, viewport.width - size.width)));
  const top = Math.max(0, Math.min(pointer.y - 14, Math.max(0, viewport.height - size.height)));
  return { left: Math.round(left), top: Math.round(top) };
}
