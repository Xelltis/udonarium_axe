import { DrawnKinds } from '@axe/infrastructure/table-3d/drawn-kinds';
import type { Camera, Object3D, Scene } from 'three/webgpu';

/** What of a renderer a scene is readied and drawn with. */
export interface ReadyingRenderer {
  render(scene: Scene, camera: Camera): unknown;
  compileAsync(thing: Object3D, camera: Camera, scene?: Scene): Promise<unknown>;
}

/** How many builds may follow one another before a scene asked for is drawn whatever is left to build. */
const BUILDS_BEFORE_DRAWING = 3;

function isWithin(thing: Object3D, scene: Object3D): boolean {
  for (let at: Object3D | null = thing; at; at = at.parent) if (at === scene) return true;
  return false;
}

/**
 * Draws a scene only once the graphics card is readied for every kind of thing in it. A kind built
 * on the frame that first draws it holds the page up for as long as the building takes, seconds on a
 * machine that draws without a graphics card; built ahead, the page stays free meanwhile, and the
 * scene is drawn as it stands once the building is done. What was asked to be drawn while a kind was
 * being built is drawn then, once.
 */
export class ReadiedDrawing {
  private readonly kinds = new DrawnKinds();
  private readying = false;
  private wanted = false;
  private gone = false;
  private builtInARow = 0;

  constructor(
    private readonly renderer: ReadyingRenderer,
    private readonly scene: Scene,
    private readonly camera: Camera
  ) {}

  /** Draws the scene now, or once the card is readied for the kinds in it that are new to it. */
  draw(): void {
    this.wanted = true;
    this.go();
  }

  /** Readies the card for the kinds in the scene new to it, drawing nothing unless a drawing is asked for meanwhile. */
  ready(): void {
    this.go();
  }

  /** Draws and readies no more: what is being built finishes and is left at that. */
  dispose(): void {
    this.gone = true;
  }

  private go(): void {
    if (this.gone || this.readying) return;
    const fresh = this.kinds.unreadied(this.scene);
    if (fresh.kinds.length === 0) {
      this.builtInARow = 0;
      if (!this.wanted) return;
      this.wanted = false;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // Things new to the card that keep coming, each as the last is built, would keep the scene from
    // ever being drawn: after a few builds in a row it is drawn as it stands, built on that frame.
    if (this.wanted && this.builtInARow >= BUILDS_BEFORE_DRAWING) {
      this.builtInARow = 0;
      this.wanted = false;
      this.kinds.markReadied(fresh.kinds);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.readying = true;
    this.builtInARow++;
    void this.build(fresh.things).then((whole) => {
      // Marked only where every thing was built: one passed over leaves its kind to be asked after
      // again, should it come back, rather than built on the frame that first draws it.
      if (whole) this.kinds.markReadied(fresh.kinds);
      this.readying = false;
      this.go();
    });
  }

  /**
   * Builds what drawing the things asks for, and answers whether all of them were built: one taken
   * out of the scene meanwhile is passed over, and nothing more is built once this is let go of.
   */
  private async build(things: readonly Object3D[]): Promise<boolean> {
    let whole = true;
    for (const thing of things) {
      if (this.gone) return false;
      if (!isWithin(thing, this.scene)) {
        whole = false;
        continue;
      }
      try {
        await this.renderer.compileAsync(thing, this.camera, this.scene);
      } catch {
        // Built on the frame that first draws it instead.
      }
    }
    return whole;
  }
}
