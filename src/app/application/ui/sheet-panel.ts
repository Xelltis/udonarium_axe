/**
 * The title of a sheet window.
 *
 * Some pieces have no name, so it is only added when there is one.
 */
export function sheetPanelTitle(label: string, name: string): string {
  return name.length > 0 ? `${label} - ${name}` : label;
}

/**
 * Where a sheet window sits: centred on the point that was grabbed.
 *
 * Set to one side, the window covers the very thing it belongs to. Centred, the object sits
 * beneath it and comes back into view as soon as the window is moved.
 */
export function sheetPanelBox(
  at: { x: number; y: number },
  width: number,
  height: number
): { left: number; top: number; width: number; height: number } {
  return { left: at.x - width / 2, top: at.y - height / 2, width, height };
}

/** The size of a small panel opened by the pointer, and how far up and to the left of the pointer its corner sits. */
export interface PointerPanelBox {
  readonly width: number;
  readonly height: number;
  readonly reachLeft: number;
  readonly reachUp: number;
}

/**
 * Where a small panel opened from a menu sits: its corner a fixed reach up and to the left of the
 * pointer, so the pointer lands inside it.
 */
export function panelOptionAt(
  at: { x: number; y: number },
  box: PointerPanelBox
): { left: number; top: number; width: number; height: number } {
  return { left: at.x - box.reachLeft, top: at.y - box.reachUp, width: box.width, height: box.height };
}
