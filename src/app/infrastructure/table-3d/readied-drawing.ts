import { DrawnKinds } from '@axe/infrastructure/table-3d/drawn-kinds';
import type { Camera, Object3D, Scene } from 'three/webgpu';

/** What of a renderer a scene is readied and drawn with. */
export interface ReadyingRenderer {
  render(scene: Scene, camera: Camera): unknown;
  compileAsync(thing: Object3D, camera: Camera, scene?: Scene): Promise<unknown>;
}

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
      if (!this.wanted) return;
      this.wanted = false;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.readying = true;
    void this.build(fresh.things).then(() => {
      this.kinds.markReadied(fresh.kinds);
      this.readying = false;
      this.go();
    });
  }

  /** Builds what drawing the things asks for, those taken out of the scene meanwhile passed over. */
  private async build(things: readonly Object3D[]): Promise<void> {
    for (const thing of things) {
      if (this.gone) return;
      if (!isWithin(thing, this.scene)) continue;
      try {
        await this.renderer.compileAsync(thing, this.camera, this.scene);
      } catch {
        // Built on the frame that first draws it instead.
      }
    }
  }
}
