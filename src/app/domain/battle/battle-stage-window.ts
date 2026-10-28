/**
 * How large each reader has the battle stage drawn: over the whole screen, or in a window of three
 * sizes that leaves the rest of the screen to work in while the exchange plays.
 */
export const BATTLE_STAGE_SIZES = ['full', 'large', 'medium', 'small'] as const;

export type BattleStageSize = (typeof BATTLE_STAGE_SIZES)[number];

export const BATTLE_STAGE_SIZE_LABEL_KEYS: Record<BattleStageSize, string> = {
  full: 'feature.battleCutIn.sizeFull',
  large: 'feature.battleCutIn.sizeLarge',
  medium: 'feature.battleCutIn.sizeMedium',
  small: 'feature.battleCutIn.sizeSmall',
};

/**
 * The size the stage is drawn at inside a window, which is then shrunk to the window as a whole,
 * names, bars and numbers with it, so that a small window shows the same scene rather than one
 * crowded by labels drawn at their full size.
 */
export const BATTLE_STAGE_CANVAS = { width: 1280, height: 720 } as const;

/** How wide each window is, where the screen has the room; its height keeps the canvas's shape. */
const WINDOW_WIDTHS: Record<Exclude<BattleStageSize, 'full'>, number> = { large: 768, medium: 576, small: 384 };

/** The space kept between a window and the edges of the screen. */
const WINDOW_MARGIN = 8;

/**
 * Where a reader keeps the window, as shares of the room the screen leaves around it: 0 against the
 * left or top edge, 1 against the right or bottom one. Shares rather than pixels, so the window keeps
 * to its corner when the screen changes size.
 */
export interface BattleStageWindow {
  size: BattleStageSize;
  x: number;
  y: number;
}

/** Full screen, as it always was; a window chosen starts in the top right corner. */
export const DEFAULT_BATTLE_STAGE_WINDOW: BattleStageWindow = { size: 'full', x: 1, y: 0.08 };

/** Where and how large a window stands on the screen, and how far the canvas is shrunk to fill it. */
export interface BattleStageWindowBox {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
}

/** The size after this one, from the full screen down to the smallest window and round again. */
export function nextBattleStageSize(size: BattleStageSize): BattleStageSize {
  const at = BATTLE_STAGE_SIZES.indexOf(size);
  return BATTLE_STAGE_SIZES[(at + 1) % BATTLE_STAGE_SIZES.length];
}

/**
 * Reads the window back from where it was kept. Anything missing or unreadable falls back to how the
 * stage was always drawn, a share out of range is pulled back in, and an empty value is not read as 0.
 */
export function readBattleStageWindow(stored: unknown): BattleStageWindow {
  let held: unknown = stored;
  if (typeof stored === 'string') {
    try {
      held = JSON.parse(stored);
    } catch {
      return { ...DEFAULT_BATTLE_STAGE_WINDOW };
    }
  }
  if (!held || typeof held !== 'object') return { ...DEFAULT_BATTLE_STAGE_WINDOW };
  const record = held as Record<string, unknown>;
  const size = (BATTLE_STAGE_SIZES as readonly unknown[]).includes(record['size'])
    ? (record['size'] as BattleStageSize)
    : DEFAULT_BATTLE_STAGE_WINDOW.size;
  return {
    size,
    x: readShare(record['x'], DEFAULT_BATTLE_STAGE_WINDOW.x),
    y: readShare(record['y'], DEFAULT_BATTLE_STAGE_WINDOW.y),
  };
}

/**
 * The box a window stands in on a screen of this size. On a narrow screen it runs along the top
 * instead, as wide as the screen allows, and is not moved about.
 */
export function battleStageWindowBox(
  place: BattleStageWindow,
  screen: { width: number; height: number },
  narrow: boolean
): BattleStageWindowBox | null {
  if (place.size === 'full') return null;
  const room = Math.max(1, screen.width - WINDOW_MARGIN * 2);
  const width = Math.min(WINDOW_WIDTHS[place.size], room);
  const height = (width * BATTLE_STAGE_CANVAS.height) / BATTLE_STAGE_CANVAS.width;
  const scale = width / BATTLE_STAGE_CANVAS.width;
  if (narrow) return { left: (screen.width - width) / 2, top: WINDOW_MARGIN, width, height, scale };
  const spareX = Math.max(0, screen.width - width - WINDOW_MARGIN * 2);
  const spareY = Math.max(0, screen.height - height - WINDOW_MARGIN * 2);
  return {
    left: WINDOW_MARGIN + spareX * place.x,
    top: WINDOW_MARGIN + spareY * place.y,
    width,
    height,
    scale,
  };
}

/** The shares a window dragged to this corner is kept at, for it to come back there. */
export function battleStageWindowPlace(
  left: number,
  top: number,
  size: { width: number; height: number },
  screen: { width: number; height: number }
): { x: number; y: number } {
  const spareX = screen.width - size.width - WINDOW_MARGIN * 2;
  const spareY = screen.height - size.height - WINDOW_MARGIN * 2;
  return {
    x: spareX > 0 ? clampShare((left - WINDOW_MARGIN) / spareX) : 0,
    y: spareY > 0 ? clampShare((top - WINDOW_MARGIN) / spareY) : 0,
  };
}

function readShare(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clampShare(value);
}

function clampShare(value: number): number {
  return Math.min(1, Math.max(0, value));
}
