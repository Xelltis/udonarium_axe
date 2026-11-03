import type { Table3dLightMap, Table3dVeil } from '@axe/infrastructure/table-3d/table-3d-port';
import {
  diffuseColor,
  float,
  max,
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

/** How a material takes the darkness: in the light it is lit by, or on the colour it is drawn in. */
export type DarknessTaking = 'lit' | 'unlit';

/**
 * What the page draws over the scene a canvas draws, read from the canvases it draws them on: the fog
 * and what is only remembered, laid over everything as a veil, and the darkness of a dark table with
 * the light of its lamps carved out of it, which darkens everything as light would.
 *
 * Both are read straight down onto the board, so a piece standing in the dark is as dark as the ground
 * at its feet. The veil is laid over each material's own colour in sRGB, as the page lays its canvas
 * over its drawing. The darkness is taken as light, in the light the scene is worked out in: how much
 * a point is lifted out of the dark, read in sRGB as the page draws it, is taken back to that light,
 * so a board lit by it is as dark as the page's, and a lamp the scene lights itself adds to it.
 */
export class SceneVeil {
  private readonly fog = new BoardPicture();
  private readonly light = new BoardPicture();
  private readonly darkness = uniform(0);
  private readonly fogged = this.foggedOutput();
  private readonly lifted = this.liftedOut();

  /** How many times the veil has been laid anew, 0 while there is none. */
  get revision(): number {
    return this.fog.revision;
  }

  /** How many times the darkness has been laid anew, 0 while the table is not dark. */
  get lightRevision(): number {
    return this.light.revision;
  }

  /** How much light reaches the board where no lamp does, which the sky's light is to be scaled by. */
  get ambient(): number {
    return srgbToLinear(1 - this.darkness.value);
  }

  /** Lays the veil and the darkness over a material, taken in its light or on its colour. */
  cover(material: Material, taking: DarknessTaking = 'unlit'): void {
    const node = material as NodeMaterial;
    if (taking === 'lit') {
      (material as unknown as { emissiveNode: unknown }).emissiveNode = diffuseColor.rgb.mul(
        this.lifted.sub(this.ambientNode())
      );
      node.outputNode = this.fogged(output);
    } else {
      node.outputNode = this.fogged(vec4(output.rgb.mul(this.lifted), output.a));
    }
  }

  /** Lays the veil as the page has drawn it now, or takes it away; answers whether anything changed. */
  setVeil(veil: Table3dVeil | null): boolean {
    return this.fog.set(veil);
  }

  /** Lays the darkness as the page has drawn it now, or lights the scene whole; answers whether anything changed. */
  setLightMap(map: Table3dLightMap | null): boolean {
    const darkness = map ? Math.min(1, Math.max(0, map.darkness)) : 0;
    const changed = this.light.set(map) || darkness !== this.darkness.value;
    this.darkness.value = darkness;
    return changed;
  }

  dispose(): void {
    this.fog.dispose();
    this.light.dispose();
  }

  private ambientNode() {
    return colourNode(sRGBTransferEOTF(vec3(float(1).sub(this.darkness)))).x;
  }

  /** How much light reaches a point, from the darkness the page draws there: all of it where the table is not dark. */
  private liftedOut() {
    const dark = this.light.sampled.a.mul(this.light.strength);
    return max(colourNode(sRGBTransferEOTF(vec3(float(1).sub(dark)))).x, this.ambientNode());
  }

  private foggedOutput() {
    const veil = this.fog.sampled;
    const amount = veil.a.mul(this.fog.strength);
    return (drawn: ReturnType<typeof vec4> | typeof output) => {
      const shown = colourNode(sRGBTransferOETF(drawn.rgb.max(float(0))));
      return vec4(colourNode(sRGBTransferEOTF(mix(shown, veil.rgb, amount))), drawn.a);
    };
  }
}

/**
 * A canvas the page draws, laid over the board and read straight down onto it. The picture stays one
 * and the same, drawn from whichever canvas the page lays: a material holds on to the picture it was
 * first drawn with. The card keeps a picture at the size it was first sent at, so one sent again at
 * another size is let go there first, and sent anew.
 */
class BoardPicture {
  private readonly picture: CanvasTexture = canvasPicture(clearCanvas());
  private laidCanvas: HTMLCanvasElement | null = null;
  private laidRevision = 0;
  private laidSize = '1x1';
  private readonly box = uniform(new Vector4(0, 0, 1, 1));
  readonly strength = uniform(0);
  readonly sampled = texture(this.picture, this.boardUv());

  get revision(): number {
    return this.laidCanvas ? this.laidRevision : 0;
  }

  set(laid: Table3dVeil | null): boolean {
    if (!laid) {
      if (!this.laidCanvas) return false;
      this.laidCanvas = null;
      this.strength.value = 0;
      return true;
    }
    if (laid.canvas === this.laidCanvas && laid.revision === this.laidRevision) return false;
    const size = `${laid.canvas.width}x${laid.canvas.height}`;
    if (size !== this.laidSize) {
      this.picture.dispose();
      this.laidSize = size;
    }
    if (laid.canvas !== this.laidCanvas) {
      this.picture.image = laid.canvas;
      this.laidCanvas = laid.canvas;
    }
    this.picture.needsUpdate = true;
    this.laidRevision = laid.revision;
    this.box.value.set(laid.box.x, laid.box.y, Math.max(1, laid.box.width), Math.max(1, laid.box.height));
    this.strength.value = 1;
    return true;
  }

  dispose(): void {
    this.picture.dispose();
    this.laidCanvas = null;
  }

  /** Where a point of the scene falls on the canvas, read straight down onto the board. */
  private boardUv() {
    return vec2(positionWorld.x.sub(this.box.x).div(this.box.z), positionWorld.z.sub(this.box.y).div(this.box.w));
  }
}

/** A value of sRGB taken back to the light the scene is worked out in. */
function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** The canvas as it is read: its values as they are, in sRGB, and its top row at the board's far edge. */
function canvasPicture(canvas: HTMLCanvasElement): CanvasTexture {
  const picture = new CanvasTexture(canvas);
  picture.colorSpace = NoColorSpace;
  picture.flipY = false;
  picture.generateMipmaps = false;
  picture.minFilter = LinearFilter;
  picture.magFilter = LinearFilter;
  return picture;
}

/** A clear canvas of a pixel, which a picture is drawn from while nothing is laid. */
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
