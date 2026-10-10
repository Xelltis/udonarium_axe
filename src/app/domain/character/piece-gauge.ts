import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';

export interface PieceGauge {
  identifier: string;
  name: string;
  initial: string;
  current: number;
  max: number;
  ratio: number;
  inverted: boolean;
  color: string;
}

const FULL_COLOR = '#4caf50';
const HALF_COLOR = '#ffb300';
const LOW_COLOR = '#e53935';

const HALF_THRESHOLD = 0.5;
const LOW_THRESHOLD = 0.25;

/** What stands in for the numbers beside a bar nobody may read. */
export const HIDDEN_GAUGE_NUMBERS = '???/???';

/**
 * The numbers beside a bar, or marks where the piece is not the reader's to look at.
 *
 * The bar itself is left as it is. How full it stands can be guessed at from across the
 * table, and a bar that told nothing would not be worth drawing; what is kept back is the
 * reading of it, which is the part that can be written down and counted on.
 */
export function gaugeNumbersOf(gauge: PieceGauge, readable: boolean): string {
  return readable ? `${gauge.current}/${gauge.max}` : HIDDEN_GAUGE_NUMBERS;
}

/**
 * How full a bar stands, from 0 to 1. Zero when either number is not finite or the maximum is not
 * above zero.
 */
export function gaugeRatio(current: number, max: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, current / max));
}

/**
 * The bar colour for how full it stands: green, amber at half or below, red at a quarter or below.
 *
 * An inverted resource is judged by the room left above it, so it turns red as it fills.
 */
export function gaugeColor(ratio: number, inverted = false): string {
  const remaining = inverted ? 1 - ratio : ratio;
  if (remaining <= LOW_THRESHOLD) return LOW_COLOR;
  if (remaining <= HALF_THRESHOLD) return HALF_COLOR;
  return FULL_COLOR;
}

/** Whether the resource is set to show as a bar on its piece. */
export function isGaugeShownOnPiece(element: DataElement): boolean {
  return element.getAttribute(DataElementAttribute.PIECE_GAUGE) === 'true';
}

/** A resource that grows worse as it rises, such as madness or contamination. */
export function isGaugeInverted(element: DataElement): boolean {
  return element.getAttribute(DataElementAttribute.GAUGE_INVERTED) === 'true';
}

/** Picks up the resources set to show on the piece, from the top down. */
export function selectPieceGauges(root: DataElement | null): PieceGauge[] {
  if (!root) return [];

  const gauges: PieceGauge[] = [];
  const walk = (element: DataElement) => {
    for (const child of element.children) {
      const data = child as DataElement;
      if (data.children.length > 0) {
        walk(data);
        continue;
      }
      if (!data.isNumberResource || !isGaugeShownOnPiece(data)) continue;

      const current = Number(data.currentValue);
      const max = Number(data.value);
      const ratio = gaugeRatio(current, max);
      const inverted = isGaugeInverted(data);
      gauges.push({
        identifier: data.identifier,
        name: data.name,
        initial: initialOf(data.name),
        current: Number.isFinite(current) ? current : 0,
        max: Number.isFinite(max) ? max : 0,
        ratio,
        inverted,
        color: gaugeColor(ratio, inverted),
      });
    }
  };
  walk(root);
  return gauges;
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? [...trimmed][0] : '';
}
