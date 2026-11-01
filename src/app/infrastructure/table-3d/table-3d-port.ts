import type { TableWorld } from '@axe/domain/tabletop/world/table-world';

/** Which of the browser's graphics interfaces the table is drawn through. */
export type Table3dBackend = 'webgpu' | 'webgl2';

/** How the camera looks at the board, as the engine is told it. */
export interface Table3dCamera {
  /**
   * The board's points carried into the space the eye looks through, a column at a time
   * (`tableEyeMatrix`): pixels from the middle of the box, x to the right, y down and z out towards
   * the eye.
   */
  readonly eye: readonly number[];
  readonly orthographic: boolean;
  /** The box the camera looks through, in CSS pixels. */
  readonly width: number;
  readonly height: number;
}

/** What draws the table on a canvas. It draws only when something it was told has changed. */
export interface Table3dEngine {
  readonly backend: Table3dBackend;
  setWorld(world: TableWorld): void;
  setCamera(camera: Table3dCamera): void;
  /** Sizes the canvas's drawing to the box it covers, in CSS pixels, at the screen's pixel ratio. */
  resize(width: number, height: number, pixelRatio: number): void;
  /** Draws the scene when anything changed since it was last drawn, and answers whether it drew. */
  renderIfChanged(): boolean;
  /** Calls back when something the engine was loading, such as a picture, has come and wants drawing. */
  onNeedsFrame(listener: () => void): void;
  /** Whether the engine is still loading something it was told to draw. */
  isLoading(): boolean;
  /**
   * Calls back once the graphics card lets the drawing go, as when the driver restarts; the engine
   * draws nothing from then on, and the canvas it drew on can be drawn on no more.
   */
  onLost(listener: () => void): void;
  dispose(): void;
}

export interface Table3dEngineOptions {
  /** Draws through WebGL2 even where WebGPU could be had, as a test does to hold the two side by side. */
  readonly forceWebGL: boolean;
}

/** The module the engine is made in, which the page loads only once the table is to be drawn on a canvas. */
export interface Table3dEngineModule {
  createTable3dEngine(canvas: HTMLCanvasElement, options: Table3dEngineOptions): Promise<Table3dEngine>;
}
