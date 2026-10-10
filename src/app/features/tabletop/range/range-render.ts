export * from '@axe/features/tabletop/range/range-render-types';

import {
  CustomRenderBoundingBox,
  CustomRenderInput,
  renderCustom,
} from '@axe/features/tabletop/range/range-render-custom';
import {
  renderHexagon,
  renderLine,
  renderPentagon,
  renderSquare,
  renderTriangle,
} from '@axe/features/tabletop/range/range-render-polygon';
import { renderCircle, renderCorn } from '@axe/features/tabletop/range/range-render-radial';
import type {
  ClipAreaCorn,
  ClipAreaHexagon,
  ClipAreaLine,
  ClipAreaPentagon,
  ClipAreaSquare,
  ClipAreaTriangle,
  RangeRenderSetting,
} from '@axe/features/tabletop/range/range-render-types';

export class RangeRender {
  constructor(
    readonly canvasElement: HTMLCanvasElement,
    readonly canvasElementRange: HTMLCanvasElement
  ) {}

  /** Draws a circle range onto this pair of canvases. */
  renderCircle(setting: RangeRenderSetting): void {
    renderCircle(this.canvasElement, this.canvasElementRange, setting);
  }

  /** Draws a line range onto this pair of canvases and gives back its clip. */
  renderLine(setting: RangeRenderSetting): ClipAreaLine {
    return renderLine(this.canvasElement, this.canvasElementRange, setting);
  }

  /** Draws a square range onto this pair of canvases and gives back its clip. */
  renderSquare(setting: RangeRenderSetting): ClipAreaSquare {
    return renderSquare(this.canvasElement, this.canvasElementRange, setting);
  }

  /** Draws a cone range onto this pair of canvases and gives back its clip. */
  renderCorn(setting: RangeRenderSetting): ClipAreaCorn {
    return renderCorn(this.canvasElement, this.canvasElementRange, setting);
  }

  /** Draws a triangle range onto this pair of canvases and gives back its clip. */
  renderTriangle(setting: RangeRenderSetting): ClipAreaTriangle {
    return renderTriangle(this.canvasElement, this.canvasElementRange, setting);
  }

  /** Draws a pentagon range onto this pair of canvases and gives back its clip. */
  renderPentagon(setting: RangeRenderSetting): ClipAreaPentagon {
    return renderPentagon(this.canvasElement, this.canvasElementRange, setting);
  }

  /** Draws a hexagon range onto this pair of canvases and gives back its clip. */
  renderHexagon(setting: RangeRenderSetting): ClipAreaHexagon {
    return renderHexagon(this.canvasElement, this.canvasElementRange, setting);
  }

  /** Draws a custom-shaped range onto this pair of canvases and gives back how far it reaches. */
  renderCustom(setting: RangeRenderSetting, input: CustomRenderInput): CustomRenderBoundingBox {
    return renderCustom(this.canvasElement, this.canvasElementRange, setting, input);
  }
}
