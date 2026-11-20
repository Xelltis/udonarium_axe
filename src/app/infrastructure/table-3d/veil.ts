import { clamp } from '@axe/core/util/clamp';
import { retakeCanvasPicture } from '@axe/infrastructure/table-3d/canvas-picture';
import { litByLamps } from '@axe/infrastructure/table-3d/lamp-lighting';
import type {
  Table3dEffectLight,
  Table3dLightMap,
  Table3dShadowLight,
  Table3dVeil,
} from '@axe/infrastructure/table-3d/table-3d-port';
import { colourNode } from '@axe/infrastructure/three-kit/colour-node';
import {
  diffuseColor,
  dot,
  float,
  length,
  materialEmissive,
  max,
  mix,
  output,
  positionWorld,
  smoothstep,
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
  MeshLambertNodeMaterial,
  MeshStandardNodeMaterial,
  NoColorSpace,
  type Node,
  type NodeMaterial,
  Vector3,
  Vector4,
} from 'three/webgpu';

/**
 * The colour what the moon lights fades towards, beside the grey of its own brightness: a little
 * darker and bluer, as the eye sees by moonlight.
 */
const MOONLIT_TINT = vec3(0.82, 0.92, 1.22);
/**
 * How bright a point is, in the light the scene is worked out in, before the moonlight starts to leave
 * it its colour, and how bright before it leaves all of it: a point a lamp lights keeps its colour.
 */
const MOONLIT_FROM = 0.18;
const MOONLIT_TO = 0.55;

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
  /** How far what the moon lights is drawn as by moonlight, from 0 by day to 1. */
  private readonly moonlit = uniform(0);
  private readonly lamps: readonly ShadowLamp[];
  private readonly fogged = this.foggedOutput();
  private readonly lifted = this.liftedOut();
  private readonly glowing = this.glowLight();

  /**
   * As many lamps as the scene has slots for lights of its own, and then as many as effects may throw
   * lights over the table, which light what the scene draws unlit.
   */
  constructor(
    private readonly shadowSlots: number,
    effectSlots = 0
  ) {
    this.lamps = Array.from({ length: shadowSlots + effectSlots }, () => ({
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
    this.stand(this.lamps.slice(0, this.shadowSlots), lights, (light) => light.dimPx, strengths);
  }

  /**
   * Lights what the scene draws unlit with the lights effects throw over the table, as their light
   * falls off with distance alone, in the colour and strength given: points are in table pixels, x to
   * the east, y to the south and z up.
   */
  setEffectLamps(lights: readonly Table3dEffectLight[], strengths: readonly ReturnType<typeof lampColour>[]): void {
    this.stand(this.lamps.slice(this.shadowSlots), lights, (light) => light.reachPx, strengths);
  }

  /** Stands each of these lamps where its light is, reaching as far as the light does, in its strength; a lamp with no light goes dark. */
  private stand<L extends { x: number; y: number; z: number }>(
    lamps: readonly ShadowLamp[],
    lights: readonly L[],
    reachOf: (light: L) => number,
    strengths: readonly ReturnType<typeof lampColour>[]
  ): void {
    lamps.forEach((lamp, index) => {
      const light = lights[index];
      lamp.at.value.set(light?.x ?? 0, light?.z ?? 0, light?.y ?? 0);
      lamp.reach.value = Math.max(1, light ? reachOf(light) : 1);
      lamp.colour.value.copy(strengths[index] ?? NO_LIGHT);
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

  /**
   * Lays the veil and the darkness over a material, taken in its light or on its colour. A lit
   * material that gives off a glow of its own, as a neon tube or a potion does, keeps it however
   * dark the table is; the veil still hides it.
   *
   * The world is drawn as by moonlight at night (see {@link setMoonlit}); what the players tell apart
   * by its colour, a piece's picture or model, a die or a coin, is covered with `moonlit` false, and
   * keeps its colour, only darkened. Every layer says which it draws, as no default would say it for
   * a layer added later.
   */
  cover(material: Material, taking: DarknessTaking, moonlit: boolean): void {
    const node = material as NodeMaterial;
    const night = (colour: Node<'vec3'>) => (moonlit ? this.byMoonlight(colour) : colour);
    if (taking === 'lit') {
      litByLamps(material);
      if (material instanceof MeshLambertNodeMaterial || material instanceof MeshStandardNodeMaterial) {
        const lifted = diffuseColor.rgb.mul(this.lifted.sub(this.ambientNode()));
        material.emissiveNode = material.emissive.getHex() === 0 ? lifted : lifted.add(materialEmissive);
      }
      node.outputNode = this.fogged(vec4(night(output.rgb).add(this.glowing), output.a));
    } else {
      node.outputNode = this.fogged(
        vec4(night(output.rgb.mul(vec3(this.lifted).add(this.lamplit))).add(this.glowing), output.a)
      );
    }
  }

  /**
   * Draws the scene as by moonlight, so far: a lit colour loses some of its own colour to the bluish
   * grey of its brightness, the dimmer the more, and one a lamp lights brightly keeps it. Nothing by day.
   */
  setMoonlit(share: number): boolean {
    const next = clamp(share, 0, 1);
    if (next === this.moonlit.value) return false;
    this.moonlit.value = next;
    return true;
  }

  /** A lit colour as moonlight leaves it: towards the bluish grey of its brightness, the more the dimmer it is. */
  private byMoonlight(colour: Node<'vec3'>) {
    const brightness = dot(colour, vec3(0.2126, 0.7152, 0.0722));
    const share = this.moonlit.mul(float(1).sub(smoothstep(MOONLIT_FROM, MOONLIT_TO, brightness)));
    return mix(colour, vec3(brightness).mul(MOONLIT_TINT), share);
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
    const darkness = map ? clamp(map.darkness, 0, 1) : 0;
    const changed = this.light.set(map) || darkness !== this.darkness.value;
    this.darkness.value = darkness;
    return changed;
  }

  /** Lets go of the pictures the veil, the darkness and the glow are read from. */
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
 * another size is let go there first, and sent anew. A canvas taken away is followed by the clear
 * pixel the picture began with, so the card does not hold a board's size of nothing.
 */
class BoardPicture {
  private readonly clear = clearCanvas();
  private readonly picture: CanvasTexture = canvasPicture(this.clear);
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
      retakeCanvasPicture(this.picture, this.clear);
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

  /** Lets go of the picture and forgets the canvas it was taken from. */
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

/** The strength of a slot with no lamp in it: no light of any colour. Read, never written to. */
export const NO_LIGHT = new Vector3();

/**
 * A light's colour as strong as a lamp lights with it, in the light the scene is worked out in,
 * written into the vector given or into a new one.
 */
export function lampColour(
  colour: { r: number; g: number; b: number },
  strength: number,
  into: Vector3 = new Vector3()
): Vector3 {
  return into.set(colour.r * strength, colour.g * strength, colour.b * strength);
}
