import { PERF_TO_DATA_URL, perfCounters } from '@axe/core/util/perf-counters';
import { GridLineRender } from '@axe/features/tabletop/game-table/grid-line-render';

const CAPACITY = 32;

export interface GridLook {
  readonly gridSize: number;
  readonly gridType: number;
  readonly gridColor: string;
  readonly gridFontColor: string;
}

/** The key a grid picture is kept under, made of everything that changes how it is drawn. */
export function gridFaceKey(
  look: GridLook,
  widthPx: number,
  heightPx: number,
  offsetTopPx: number,
  offsetLeftPx: number,
  labelPrefix: string,
  labelMatrix: readonly number[] | null
): string {
  return [
    widthPx,
    heightPx,
    look.gridSize,
    look.gridType,
    look.gridColor,
    look.gridFontColor,
    offsetTopPx,
    offsetLeftPx,
    labelPrefix,
    labelMatrix ? labelMatrix.join(',') : '',
  ].join('|');
}

export class GridFaceCache {
  private readonly faces = new Map<string, string>();

  /**
   * The grid picture kept under the key, or one made now and kept.
   *
   * The 32 used most lately are kept. A picture that could not be made is not kept, and reads as
   * empty.
   */
  remember(key: string, make: () => string | null): string {
    const kept = this.faces.get(key);
    if (kept !== undefined) {
      this.faces.delete(key);
      this.faces.set(key, kept);
      return kept;
    }
    const made = make();
    if (made === null) return '';
    this.faces.set(key, made);
    if (this.faces.size > CAPACITY) this.faces.delete(this.faces.keys().next().value as string);
    return made;
  }

  /**
   * A grid picture for one surface of the table as a data URL, drawn once for each look, size,
   * offset and labelling and reused after that.
   *
   * Empty where nothing can be drawn, such as outside a browser or for a surface with no area.
   */
  dataUrl(
    look: GridLook,
    widthPx: number,
    heightPx: number,
    offsetTopPx: number,
    offsetLeftPx: number,
    labelPrefix: string,
    labelMatrix: readonly [number, number, number, number] | null
  ): string {
    if (typeof document === 'undefined' || widthPx <= 0 || heightPx <= 0) return '';
    return this.remember(
      gridFaceKey(look, widthPx, heightPx, offsetTopPx, offsetLeftPx, labelPrefix, labelMatrix),
      () => {
        try {
          const canvas = document.createElement('canvas');
          const drawn = new GridLineRender(canvas).renderViewport(
            widthPx,
            heightPx,
            look.gridSize,
            look.gridType,
            look.gridColor,
            look.gridFontColor,
            offsetTopPx,
            offsetLeftPx,
            true,
            labelPrefix,
            labelMatrix
          );
          if (!drawn) return null;
          perfCounters.bump(PERF_TO_DATA_URL);
          return canvas.toDataURL();
        } catch {
          return null;
        }
      }
    );
  }
}
