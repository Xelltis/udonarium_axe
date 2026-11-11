import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';

export interface PieceGauge {
  identifier: string;
  name: string;
  initial: string;
  current: number;
  max: number;
  ratio: number;
  inverted: boolean;
  /** The colour the bar stands in: the one set for it, else that of how full it stands. */
  color: string;
}

const FULL_COLOR = '#4caf50';
const HALF_COLOR = '#ffb300';
const LOW_COLOR = '#e53935';

const HALF_THRESHOLD = 0.5;
const LOW_THRESHOLD = 0.25;

/** What stands in for the numbers beside a bar nobody may read. */
export const HIDDEN_GAUGE_NUMBERS = '???/???';

/** The colour a bar kept from the reader stands in, full: how much is left is not to be told. */
export const HIDDEN_GAUGE_COLOR = '#9e9e9e';

/**
 * How a bar kept from the reader is filled on the page: slanting stripes of its grey, so it does not
 * read as a resource standing full.
 */
export const HIDDEN_GAUGE_STRIPES = `repeating-linear-gradient(135deg, ${HIDDEN_GAUGE_COLOR} 0 0.3em, #6b6b6b 0.3em 0.6em)`;

/**
 * Whether a resource has run out: down to nothing, or for one that counts up to its end, at its
 * maximum. A piece whose resource has run out is beaten, and what it held is no longer kept back.
 */
export function isGaugeSpent(current: number, max: number, inverted: boolean): boolean {
  return inverted ? current >= max : current <= 0;
}

/**
 * Whether a resource set to a value has run out, as {@link isGaugeSpent} judges it: by its own
 * direction, against the maximum it has, where it counts up to its end. One counting up without a
 * maximum never runs out; anything else runs out at nothing.
 */
export function isResourceSpentAt(element: DataElement | null, current: number, max: number | null): boolean {
  const inverted = element ? isGaugeInverted(element) : false;
  return isGaugeSpent(current, max ?? Number.POSITIVE_INFINITY, inverted);
}

/**
 * How a bar is drawn for a reader: how full it stands, its colour and the numbers beside it, as they
 * are, or, for a piece whose contents are kept from the reader, full and grey with marks for the
 * numbers until the resource runs out, so how much is left is not told by how long the bar is.
 */
export function shownGaugeReading(
  current: number,
  max: number,
  inverted: boolean,
  color: string,
  readable: boolean
): { readonly ratio: number; readonly color: string; readonly numbers: string; readonly kept: boolean } {
  if (readable || isGaugeSpent(current, max, inverted)) {
    return { ratio: gaugeRatio(current, max), color, numbers: `${current}/${max}`, kept: false };
  }
  return { ratio: 1, color: HIDDEN_GAUGE_COLOR, numbers: HIDDEN_GAUGE_NUMBERS, kept: true };
}

/**
 * A bar of a piece as a reader is shown it, the numbers beside it, and whether how much is left is kept
 * from them; see {@link shownGaugeReading}.
 */
export function shownGauge(
  gauge: PieceGauge,
  readable: boolean
): { gauge: PieceGauge; numbers: string; kept: boolean } {
  const shown = shownGaugeReading(gauge.current, gauge.max, gauge.inverted, gauge.color, readable);
  return { gauge: { ...gauge, ratio: shown.ratio, color: shown.color }, numbers: shown.numbers, kept: shown.kept };
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

/** A bar colour as a colour box writes one. */
const BAR_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * A colour set for a bar to stand in however full it is, or empty for the colour of how full it
 * stands. Anything but a colour, an empty value from a version that never wrote one included, is
 * empty. It changes only the look: a resource that grows worse as it rises is still told by
 * {@link isGaugeInverted}.
 */
export function fixedGaugeColor(value: unknown): string {
  const held = `${value ?? ''}`.trim();
  return BAR_COLOR.test(held) ? held.toLowerCase() : '';
}

/** The colour set for the resource's bar, or empty for none. */
export function gaugeFixedColorOf(element: DataElement): string {
  return fixedGaugeColor(element.getAttribute(DataElementAttribute.GAUGE_COLOR));
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
        color: gaugeFixedColorOf(data) || gaugeColor(ratio, inverted),
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
