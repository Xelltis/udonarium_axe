export const HAND_CARD_WIDTH_PX = 76;
export const HAND_CARD_HEIGHT_PX = 114;
export const HAND_FAN_MAX_STEP_PX = 54;
export const HAND_FAN_VISIBLE_CARDS = 8;
export const HAND_FAN_SPREAD_DEG = 20;
export const HAND_FAN_ARC_PX = 18;

export interface HandCardLayout {
  readonly leftPx: number;
  readonly topPx: number;
  readonly rotateDeg: number;
  readonly zIndex: number;
}

export interface HandFanOptions {
  readonly cardWidthPx?: number;
  readonly maxStepPx?: number;
  readonly visibleCards?: number;
  readonly spreadDeg?: number;
  readonly arcPx?: number;
}

/**
 * The width of the fan of hand cards: one card plus a full step for each further card that fits in
 * view.
 */
export function handFanWidthPx(options: HandFanOptions = {}): number {
  const cardWidth = options.cardWidthPx ?? HAND_CARD_WIDTH_PX;
  const maxStep = options.maxStepPx ?? HAND_FAN_MAX_STEP_PX;
  const visible = Math.max(1, options.visibleCards ?? HAND_FAN_VISIBLE_CARDS);
  return cardWidth + maxStep * (visible - 1);
}

export const HAND_FAN_MIN_STEP_PX = 16;
// The margin and border of the rail, and how far the tipped cards reach past it.
export const HAND_RAIL_CHROME_PX =
  26 + 2 * Math.ceil(HAND_CARD_HEIGHT_PX * Math.sin((HAND_FAN_SPREAD_DEG / 2) * (Math.PI / 180)));

/**
 * Narrows the step between hand cards so the fan fits a screen of the given width, leaving room for
 * the rail around it.
 *
 * The options come back unchanged when the fan already fits. The step never drops below
 * `HAND_FAN_MIN_STEP_PX`, so a very narrow screen can still overflow.
 */
export function fitHandFanOptions(availableWidthPx: number, options: HandFanOptions = {}): HandFanOptions {
  const cardWidth = options.cardWidthPx ?? HAND_CARD_WIDTH_PX;
  const maxStep = options.maxStepPx ?? HAND_FAN_MAX_STEP_PX;
  const visible = Math.max(1, options.visibleCards ?? HAND_FAN_VISIBLE_CARDS);
  const usable = availableWidthPx - HAND_RAIL_CHROME_PX;
  if (visible <= 1 || usable >= handFanWidthPx(options)) return options;

  const step = Math.max(HAND_FAN_MIN_STEP_PX, (usable - cardWidth) / (visible - 1));
  return { ...options, maxStepPx: Math.min(maxStep, step) };
}

/**
 * The gap in a fan of `count` cards that a pointer at `offsetXPx` from the fan's left edge would
 * drop into: the number of cards whose centre lies left of it.
 */
export function handFanDropIndex(offsetXPx: number, count: number, options: HandFanOptions = {}): number {
  const cardWidth = options.cardWidthPx ?? HAND_CARD_WIDTH_PX;
  const layout = layoutHandFan(count, options);
  return layout.filter((entry) => entry.leftPx + cardWidth / 2 < offsetXPx).length;
}

/**
 * Places `count` cards in the hand fan.
 *
 * The cards are centred in the fan width and overlap by no more than the step. Each is tilted
 * further the nearer it is to an end and drops along a shallow arc, and later cards lie on top of
 * earlier ones. A single card sits upright in the middle.
 */
export function layoutHandFan(count: number, options: HandFanOptions = {}): HandCardLayout[] {
  if (count <= 0) return [];

  const cardWidth = options.cardWidthPx ?? HAND_CARD_WIDTH_PX;
  const maxStep = options.maxStepPx ?? HAND_FAN_MAX_STEP_PX;
  const spread = options.spreadDeg ?? HAND_FAN_SPREAD_DEG;
  const arc = options.arcPx ?? HAND_FAN_ARC_PX;
  const width = handFanWidthPx(options);

  if (count === 1) return [{ leftPx: (width - cardWidth) / 2, topPx: 0, rotateDeg: 0, zIndex: 0 }];

  const step = Math.min(maxStep, (width - cardWidth) / (count - 1));
  const spanPx = cardWidth + step * (count - 1);
  const startLeft = (width - spanPx) / 2;
  const half = (count - 1) / 2;

  return Array.from({ length: count }, (_, index) => {
    const ratio = (index - half) / half;
    return {
      leftPx: startLeft + step * index,
      topPx: arc * ratio * ratio,
      rotateDeg: (spread / 2) * ratio,
      zIndex: index,
    };
  });
}
