import type { EyeAxes, TableWorldLook, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { float, max, sRGBTransferEOTF, sRGBTransferOETF, texture, type vec3, vec4 } from 'three/tsl';
import {
  CanvasTexture,
  DoubleSide,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three/webgpu';

/** How many texture pixels a frame is drawn at per table pixel, at most, and how big it may get. */
const FRAME_DETAIL = 4;
const FRAME_MAX_PX = 1024;

/** Draws a sprite lying flat on a face in front of the face, past the depth's rounding. */
const PULLED_FORWARD = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };

/**
 * Where the sprites lying flat on a face come in the order things are drawn: after the board, the
 * blocks and the grid, one after another from the lowest, so a card laid over another is drawn
 * over it however close the two lie.
 */
const FIRST_LYING = 10;

/** A direction of the board's space as the scene's, whose axes run east, up and south. */
function sceneDirection(v: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(v.x, v.z, v.y);
}

/**
 * The turn that lays a square of the scene, facing out along its z, along a sprite's directions
 * across and down: the square's x runs across, its y up against down, and it faces out of the side
 * the sprite is seen from in front.
 */
function turnAlong(across: { x: number; y: number; z: number }, down: { x: number; y: number; z: number }): Matrix4 {
  const x = sceneDirection(across).normalize();
  const y = sceneDirection(down).negate().normalize();
  const z = new Vector3().crossVectors(x, y).normalize();
  return new Matrix4().makeBasis(x, y, z);
}

interface Drawn {
  readonly mesh: Mesh;
  readonly look: string;
}

/**
 * The sprites of the pieces on the table, each a square of the scene stretched to its size and laid
 * where it lies. A sprite turned to the eye is turned again each time the camera turns. Sprites
 * showing the same thing the same way share one material.
 */
export class SpriteLayer {
  readonly group = new Group();
  private readonly square = new PlaneGeometry(1, 1);
  private readonly drawn = new Map<string, Drawn>();
  private readonly materials = new Map<string, MeshBasicNodeMaterial>();
  private readonly frames = new Map<string, CanvasTexture>();
  private facingEye: readonly Mesh[] = [];
  private eye: Matrix4 | null = null;

  constructor(private readonly pictureOf: (url: string) => Texture) {}

  /** Lays out the sprites the scene holds now, making only the ones not drawn before. */
  set(sprites: readonly TableWorldSprite[]): void {
    const wanted = new Set<string>();
    const facingEye: Mesh[] = [];
    for (const sprite of sprites) {
      wanted.add(sprite.id);
      const look = lookKey(sprite);
      let drawn = this.drawn.get(sprite.id);
      if (drawn && drawn.look !== look) {
        this.group.remove(drawn.mesh);
        drawn = undefined;
      }
      if (!drawn) {
        drawn = { mesh: new Mesh(this.square, this.material(look, sprite)), look };
        this.drawn.set(sprite.id, drawn);
        this.group.add(drawn.mesh);
      }
      const mesh = drawn.mesh;
      mesh.renderOrder = 0;
      mesh.position.copy(sceneDirection(sprite.centre));
      mesh.scale.set(sprite.widthPx, sprite.heightPx, 1);
      if (sprite.facing === 'eye') {
        facingEye.push(mesh);
        if (this.eye) mesh.quaternion.setFromRotationMatrix(this.eye);
      } else {
        mesh.quaternion.setFromRotationMatrix(turnAlong(sprite.facing.across, sprite.facing.down));
      }
    }
    for (const [id, drawn] of this.drawn) {
      if (wanted.has(id)) continue;
      this.group.remove(drawn.mesh);
      this.drawn.delete(id);
    }
    this.facingEye = facingEye;
    this.stackLying(sprites);
    this.forgetUnused();
  }

  /**
   * Draws the sprites lying flat on a face one after another, from the lowest off its face, and
   * the earlier of two as low first. They write no depth, so the order alone says which is over which.
   */
  private stackLying(sprites: readonly TableWorldSprite[]): void {
    const lying = sprites
      .map((sprite, index) => ({ sprite, index }))
      .filter(({ sprite }) => sprite.order !== undefined)
      .sort((a, b) => a.sprite.order! - b.sprite.order! || a.index - b.index);
    lying.forEach(({ sprite }, rank) => {
      const drawn = this.drawn.get(sprite.id);
      if (drawn) drawn.mesh.renderOrder = FIRST_LYING + rank;
    });
  }

  /** Turns the sprites that face the eye to an eye that now looks along these axes. */
  face(axes: EyeAxes): void {
    this.eye = turnAlong(axes.right, { x: -axes.up.x, y: -axes.up.y, z: -axes.up.z });
    for (const mesh of this.facingEye) mesh.quaternion.setFromRotationMatrix(this.eye);
  }

  dispose(): void {
    this.square.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const frame of this.frames.values()) frame.dispose();
    this.materials.clear();
    this.frames.clear();
    this.drawn.clear();
  }

  private material(key: string, sprite: TableWorldSprite): MeshBasicNodeMaterial {
    let material = this.materials.get(key);
    if (material) return material;
    const lying = sprite.order !== undefined;
    material = new MeshBasicNodeMaterial({
      transparent: true,
      alphaTest: 0.01,
      opacity: sprite.opacity ?? 1,
      depthWrite: !lying,
      side: sprite.twoSided ? DoubleSide : FrontSide,
      ...(lying ? PULLED_FORWARD : {}),
    });
    material.map = this.texture(sprite.look, sprite.widthPx, sprite.heightPx);
    if (sprite.look.kind === 'picture') material.colorNode = shown(material.map, sprite.brightness);
    else if (sprite.brightness !== 1) material.colorNode = dimmed(material.map, sprite.brightness);
    this.materials.set(key, material);
    return material;
  }

  private texture(look: TableWorldLook, width: number, height: number): Texture {
    if (look.kind === 'picture') return this.pictureOf(look.url);
    const key = frameKey(look, width, height);
    let frame = this.frames.get(key);
    if (!frame) {
      frame = new CanvasTexture(drawFrame(look, width, height));
      frame.colorSpace = SRGBColorSpace;
      this.frames.set(key, frame);
    }
    return frame;
  }

  /** Lets go of the materials and frames no sprite shows any more. */
  private forgetUnused(): void {
    const looks = new Set([...this.drawn.values()].map((drawn) => drawn.look));
    for (const [key, material] of this.materials) {
      if (looks.has(key)) continue;
      material.dispose();
      this.materials.delete(key);
    }
    const frames = new Set(
      [...this.materials.values()].map((material) => material.map).filter((map) => map instanceof CanvasTexture)
    );
    for (const [key, frame] of this.frames) {
      if (frames.has(frame)) continue;
      frame.dispose();
      this.frames.delete(key);
    }
  }
}

/** A colour the library's colour-space functions answer, which they do not say is a colour. */
function colourNode(node: unknown): ReturnType<typeof vec3> {
  return node as ReturnType<typeof vec3>;
}

/**
 * A picture whose colours carry its clearness, as a sprite's picture is held, shown as the page
 * shows it: its colours taken back apart from its clearness, and dimmed as the page dims one.
 */
function shown(picture: Texture, brightness: number) {
  const sampled = texture(picture);
  const colour = colourNode(sampled.rgb.div(max(sampled.a, float(0.0001))));
  if (brightness === 1) return vec4(colour, sampled.a);
  const scaled = colourNode(sRGBTransferOETF(colour)).mul(float(brightness));
  return vec4(colourNode(sRGBTransferEOTF(scaled)), sampled.a);
}

/** A picture dimmed as the page dims one, by scaling its colours as they are written, in sRGB. */
function dimmed(picture: Texture, brightness: number) {
  const sampled = texture(picture);
  const scaled = colourNode(sRGBTransferOETF(sampled.rgb)).mul(float(brightness));
  return vec4(colourNode(sRGBTransferEOTF(scaled)), sampled.a);
}

/** What sprites sharing a material have alike: what they show, how bright and how clear, from which sides, and whether they lie flat. */
function lookKey(sprite: TableWorldSprite): string {
  const shown =
    sprite.look.kind === 'picture' ? sprite.look.url : frameKey(sprite.look, sprite.widthPx, sprite.heightPx);
  return `${shown}|${sprite.brightness}|${sprite.opacity ?? 1}|${sprite.twoSided}|${sprite.order !== undefined}`;
}

function frameKey(look: Extract<TableWorldLook, { kind: 'frame' }>, width: number, height: number): string {
  return JSON.stringify([look.bands, look.radiusPx, width, height]);
}

/**
 * A frame drawn as the page draws a box's border: each band inside the edge, rounded at the
 * corners, the inner edge of a band rounded the less the wider the band, and each band over the
 * ones before it.
 */
function drawFrame(look: Extract<TableWorldLook, { kind: 'frame' }>, width: number, height: number): HTMLCanvasElement {
  const detail = Math.max(0.25, Math.min(FRAME_DETAIL, FRAME_MAX_PX / Math.max(width, height, 1)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * detail));
  canvas.height = Math.max(1, Math.round(height * detail));
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.scale(canvas.width / width, canvas.height / height);
  for (const band of look.bands) {
    const inner = Math.min(band.widthPx, width / 2, height / 2);
    context.beginPath();
    context.roundRect(0, 0, width, height, look.radiusPx);
    context.roundRect(inner, inner, width - inner * 2, height - inner * 2, Math.max(0, look.radiusPx - inner));
    context.fillStyle = band.colour;
    context.fill('evenodd');
  }
  return canvas;
}
