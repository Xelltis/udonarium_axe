import { retakeCanvasPicture } from '@axe/infrastructure/table-3d/canvas-picture';
import { litByLamps } from '@axe/infrastructure/table-3d/lamp-lighting';
import type { Table3dLightMap, Table3dShadowLight, Table3dVeil } from '@axe/infrastructure/table-3d/table-3d-port';
import {
  diffuseColor,
  float,
  length,
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
import {
  CanvasTexture,
  LinearFilter,
  type Material,
  NoColorSpace,
  type NodeMaterial,
  Vector3,
  Vector4,
} from 'three/webgpu';

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
  private readonly glow = new BoardPicture();
  private readonly darkness = uniform(0);
  private readonly lamps: readonly ShadowLamp[];
  private readonly fogged = this.foggedOutput();
  private readonly lifted = this.liftedOut();
  private readonly glowing = this.glowLight();

  /** As many lamps as the scene has slots for lights of its own, which light what the scene draws unlit. */
  constructor(slots: number) {
    this.lamps = Array.from({ length: slots }, () => ({
      at: vectorUniform(),
      reach: numberUniform(),
      colour: vectorUniform(),
    }));
    this.lamplit = this.lampLight();
  }

  private readonly lamplit: ReturnType<typeof vec3>;

  /**
   * Lights what the scene draws unlit with the lights it lights itself, as their light falls off with
   * distance alone, in the colour each is, as strong as the dark leaves room for: points are in table
   * pixels, x to the east, y to the south and z up.
   */
  setLamps(lights: readonly Table3dShadowLight[], strengths: readonly ReturnType<typeof lampColour>[]): void {
    this.lamps.forEach((lamp, index) => {
      const light = lights[index];
      lamp.at.value.set(light?.x ?? 0, light?.z ?? 0, light?.y ?? 0);
      lamp.reach.value = Math.max(1, light?.dimPx ?? 1);
      lamp.colour.value.copy(strengths[index] ?? new Vector3());
    });
  }

  /** How many times the veil has been laid anew, 0 while there is none. */
  get revision(): number {
    return this.fog.revision;
  }

  /** How many times the darkness has been laid anew, 0 while the table is not dark. */
  get lightRevision(): number {
    return this.light.revision;
  }

  /** How many times the glow of the lamps has been laid anew, 0 while there is none. */
  get glowRevision(): number {
    return this.glow.revision;
  }

  /**
   * The glow of the lamps at a point of the scene, read straight down onto the board, which is what
   * glows on a dark table: nothing anywhere else, nor where the table is not dark.
   */
  get glowNode() {
    return this.glowing;
  }

  /** How much light reaches the board where no lamp does, which the sky's light is to be scaled by. */
  get ambient(): number {
    return srgbToLinear(1 - this.darkness.value);
  }

  /** Lays the veil and the darkness over a material, taken in its light or on its colour. */
  cover(material: Material, taking: DarknessTaking = 'unlit'): void {
    const node = material as NodeMaterial;
    if (taking === 'lit') {
      litByLamps(material);
      (material as unknown as { emissiveNode: unknown }).emissiveNode = diffuseColor.rgb.mul(
        this.lifted.sub(this.ambientNode())
      );
      node.outputNode = this.fogged(vec4(output.rgb.add(this.glowing), output.a));
    } else {
      node.outputNode = this.fogged(
        vec4(output.rgb.mul(vec3(this.lifted).add(this.lamplit)).add(this.glowing), output.a)
      );
    }
  }

  /** Lays the veil as the page has drawn it now, or takes it away; answers whether anything changed. */
  setVeil(veil: Table3dVeil | null): boolean {
    return this.fog.set(veil);
  }

  /** Lays the glow of the lamps as the page has drawn it now, or takes it away; answers whether anything changed. */
  setGlow(glow: Table3dVeil | null): boolean {
    return this.glow.set(glow);
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
    this.glow.dispose();
  }

  private ambientNode() {
    return colourNode(sRGBTransferEOTF(vec3(float(1).sub(this.darkness)))).x;
  }

  /** How much light reaches a point, from the darkness the page draws there: all of it where the table is not dark. */
  private liftedOut() {
    const dark = this.light.sampled.a.mul(this.light.strength);
    return max(colourNode(sRGBTransferEOTF(vec3(float(1).sub(dark)))).x, this.ambientNode());
  }

  /**
   * The glow the page draws round its lamps, added over what the scene draws as the page adds it over
   * its own drawing, taken back to the light the scene is worked out in.
   */
  private glowLight() {
    const glow = this.glow.sampled;
    return colourNode(sRGBTransferEOTF(glow.rgb.mul(glow.a).mul(this.glow.strength)));
  }

  /** How much the lamps add to a point the scene draws unlit, as their light falls off with distance. */
  private lampLight() {
    let lit = colourNode(vec3(0, 0, 0));
    for (const lamp of this.lamps) {
      const away = length(positionWorld.sub(lamp.at)).div(lamp.reach).min(float(1));
      const fall = float(1).sub(away.pow(4)).pow(2);
      lit = colourNode(lit.add(lamp.colour.mul(fall)));
    }
    return lit;
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
    retakeCanvasPicture(this.picture, laid.canvas);
    this.laidCanvas = laid.canvas;
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
  retakeCanvasPicture(picture, canvas);
  return picture;
}

/**
 * A clear canvas of a pixel, which a picture is drawn from while nothing is laid. It is given a
 * context to hold that pixel, as WebGPU cannot copy a canvas that has never had one.
 */
function clearCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  canvas.getContext('2d')?.clearRect(0, 0, 1, 1);
  return canvas;
}

/** A colour the library's colour-space functions answer, which they do not say is a colour. */
function colourNode(node: unknown): ReturnType<typeof vec3> {
  return node as ReturnType<typeof vec3>;
}

/** A lamp lighting what the scene draws unlit: where it stands in the scene, how far it reaches and its strength in colour. */
interface ShadowLamp {
  readonly at: ReturnType<typeof vectorUniform>;
  readonly reach: ReturnType<typeof numberUniform>;
  readonly colour: ReturnType<typeof vectorUniform>;
}

function vectorUniform() {
  return uniform(new Vector3());
}

function numberUniform() {
  return uniform(1);
}

/** A light's colour as strong as a lamp lights with it, in the light the scene is worked out in. */
export function lampColour(colour: { r: number; g: number; b: number }, strength: number): Vector3 {
  return new Vector3(colour.r * strength, colour.g * strength, colour.b * strength);
}
