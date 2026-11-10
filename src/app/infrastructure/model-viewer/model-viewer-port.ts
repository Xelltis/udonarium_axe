/**
 * A 3D model shown on a canvas of its own, as the list of models shows the one chosen: turning slowly
 * unless the reader asks for less motion, and turned by hand as it is dragged.
 */
export interface ModelStage {
  /** Shows the model held at a URL of bytes held here, and says whether it could be read. */
  show(url: string): Promise<boolean>;
  /** Turns the model about its upright by a drag across, and tips the view by a drag down, in pixels. */
  turnBy(acrossPx: number, downPx: number): void;
  /** Sets whether the model turns on its own. */
  setTurning(on: boolean): void;
  /** Fits the drawing to the canvas as it is laid out now. */
  resize(): void;
  /**
   * The faces of the model a round brush covers, laid where a point of the canvas lands on the model
   * and as wide across as the share of the model given: for each mesh, by its order in the model, its
   * triangles by their order in the mesh. Empty where the point lands on none of the model.
   */
  facesNear(canvasX: number, canvasY: number, widthShare: number): ReadonlyMap<number, readonly number[]>;
  /** Shows faces of the model painted over it: one set strongly, the others faintly. */
  showFaces(
    chosen: ReadonlyMap<number, ReadonlySet<number>>,
    others: readonly ReadonlyMap<number, ReadonlySet<number>>[]
  ): void;
  dispose(): void;
}

/** Takes pictures of 3D models, as the list of models shows each it holds. */
export interface ModelPainter {
  /**
   * A square picture of the model held at a URL of bytes held here, seen a little from above and
   * fitted to the picture, or null where it cannot be read or drawn.
   */
  paint(url: string, sizePx: number): Promise<Blob | null>;
  dispose(): void;
}

/** What the module that draws models on their own gives, loaded only once something asks for it. */
export interface ModelViewerModule {
  createModelStage(canvas: HTMLCanvasElement): ModelStage | null;
  createModelPainter(): ModelPainter | null;
}
