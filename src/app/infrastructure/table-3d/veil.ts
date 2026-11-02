import type { Table3dVeil } from '@axe/infrastructure/table-3d/table-3d-port';
import {
  float,
  mix,
  output,
  positionWorld,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { CanvasTexture, LinearFilter, type Material, NoColorSpace, type NodeMaterial, Vector4 } from 'three/webgpu';

/**
 * The veil laid over everything standing in the scene, read from the canvas the page draws it on.
 *
 * Each material's own colour is taken back to sRGB, the veil laid over it there, and the result taken
 * back again: the page lays its canvas over its drawing in sRGB, and laid over in the light the scene
 * is worked out in, a half-dark veil comes out far lighter than the page's. A point is read straight
 * down onto the board, so a piece standing in the dark is as dark as the ground at its feet.
 */
export class SceneVeil {
  private readonly picture: CanvasTexture = canvasPicture(clearCanvas());
  private laidCanvas: HTMLCanvasElement | null = null;
  private laidRevision = 0;
  private readonly box = uniform(new Vector4(0, 0, 1, 1));
  private readonly strength = uniform(0);
  private readonly sampled = texture(this.picture, this.boardUv());
  private readonly over = this.veiledOutput();

  /** How many times the veil has been laid anew, 0 while there is none. */
  get revision(): number {
    return this.laidCanvas ? this.laidRevision : 0;
  }

  /** Lays the veil over a material's output. */
  cover(material: Material): void {
    (material as NodeMaterial).outputNode = this.over;
  }

  /**
   * Lays the veil as the page has drawn it now, or takes it away; answers whether anything changed.
   * The picture stays one and the same, drawn from whichever canvas the page lays: a material holds
   * on to the picture it was first drawn with.
   */
  set(veil: Table3dVeil | null): boolean {
    if (!veil) {
      if (!this.laidCanvas) return false;
      this.laidCanvas = null;
      this.strength.value = 0;
      return true;
    }
    if (veil.canvas === this.laidCanvas && veil.revision === this.laidRevision) return false;
    if (veil.canvas !== this.laidCanvas) {
      this.picture.image = veil.canvas;
      this.laidCanvas = veil.canvas;
    }
    this.picture.needsUpdate = true;
    this.laidRevision = veil.revision;
    this.box.value.set(veil.box.x, veil.box.y, Math.max(1, veil.box.width), Math.max(1, veil.box.height));
    this.strength.value = 1;
    return true;
  }

  dispose(): void {
    this.picture.dispose();
    this.laidCanvas = null;
  }

  /** Where a point of the scene falls on the veil's canvas, read straight down onto the board. */
  private boardUv() {
    return vec2(positionWorld.x.sub(this.box.x).div(this.box.z), positionWorld.z.sub(this.box.y).div(this.box.w));
  }

  private veiledOutput() {
    const veil = this.sampled;
    const amount = veil.a.mul(this.strength);
    const shown = colourNode(sRGBTransferOETF(output.rgb.max(float(0))));
    return vec4(colourNode(sRGBTransferEOTF(mix(shown, veil.rgb, amount))), output.a);
  }
}

/** The canvas as the veil reads it: its values as they are, in sRGB, and its top row at the board's far edge. */
function canvasPicture(canvas: HTMLCanvasElement): CanvasTexture {
  const picture = new CanvasTexture(canvas);
  picture.colorSpace = NoColorSpace;
  picture.flipY = false;
  picture.generateMipmaps = false;
  picture.minFilter = LinearFilter;
  picture.magFilter = LinearFilter;
  return picture;
}

/** A clear canvas of a pixel, which the picture is drawn from while no veil is laid. */
function clearCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas;
}

/** A colour the library's colour-space functions answer, which they do not say is a colour. */
function colourNode(node: unknown): ReturnType<typeof vec3> {
  return node as ReturnType<typeof vec3>;
}
