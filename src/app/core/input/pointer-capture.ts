/**
 * Keeps a pointer's moves and its release coming to an element after the pointer leaves it.
 *
 * Does nothing where the element cannot take the pointer: a target that is not an element, a
 * browser without the call, or one that has already let the pointer go by the time it is asked.
 */
export function capturePointer(target: EventTarget | null, pointerId: number): void {
  try {
    (target as Element | null)?.setPointerCapture?.(pointerId);
  } catch {
    return;
  }
}

/** Lets go of a pointer an element took, where it still holds it. */
export function releasePointer(target: EventTarget | null, pointerId: number): void {
  const element = target as Element | null;
  try {
    if (element?.hasPointerCapture?.(pointerId) ?? true) element?.releasePointerCapture?.(pointerId);
  } catch {
    return;
  }
}
