import {
  type EyeAxes,
  spriteAxes,
  type TableWorldLook,
  type TableWorldSprite,
} from '@axe/domain/tabletop/world/table-sprites';
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

/**
 * The layer the boards a standing picture throws its shadow with are kept on, which the shadows are
 * drawn from and the camera never looks at.
 */
export const SHADOW_CASTERS_LAYER = 1;

/** How far into its picture a board throwing a shadow lets light through, as a share of its opacity. */
const CASTER_ALPHA_TEST = 0.5;

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

/** An eye for working out the way a sprite lies that does not turn to the eye, which never reads it. */
/** Whether a sprite stands up off what it stands on, turned to the eye or held upright, rather than lying on it. */
function standsUp(sprite: TableWorldSprite): boolean {
  return sprite.facing === 'eye' || Math.abs(sprite.facing.down.z) > 0.5;
}

const UNUSED_EYE: EyeAxes = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } };

/** Turns a sprite that faces the eye to an eye looking along these axes, and on by its own turn. */
function turnToEye(mesh: Mesh, sprite: TableWorldSprite, eye: EyeAxes): void {
  const { across, down } = spriteAxes(sprite, eye);
  mesh.quaternion.setFromRotationMatrix(turnAlong(across, down));
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
  /** The boards a standing picture throws its shadow with, crossed, so the shadow stays put as the camera turns. */
  private readonly casters = new Map<string, { readonly group: Group; readonly look: string }>();
  private readonly casterMaterials = new Map<string, MeshBasicNodeMaterial>();
  private facingEye: readonly { readonly mesh: Mesh; readonly sprite: TableWorldSprite }[] = [];
  private eye: EyeAxes | null = null;

  constructor(
    private readonly pictureOf: (url: string) => Texture,
    private readonly dress: (material: MeshBasicNodeMaterial) => void = () => undefined
  ) {}

  /** How many standing pictures throw a shadow with boards of their own. */
  get casterCount(): number {
    return this.casters.size;
  }

  /** Lays out the sprites the scene holds now, making only the ones not drawn before. */
  set(sprites: readonly TableWorldSprite[]): void {
    const wanted = new Set<string>();
    const facingEye: { mesh: Mesh; sprite: TableWorldSprite }[] = [];
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
      mesh.visible = !sprite.hidden;
      mesh.position.copy(sceneDirection(sprite.centre));
      mesh.scale.set(sprite.widthPx, sprite.heightPx, 1);
      if (sprite.facing === 'eye') {
        facingEye.push({ mesh, sprite });
        if (this.eye) turnToEye(mesh, sprite, this.eye);
      } else {
        const { across, down } = spriteAxes(sprite, UNUSED_EYE);
        mesh.quaternion.setFromRotationMatrix(turnAlong(across, down));
      }
    }
    for (const [id, drawn] of this.drawn) {
      if (wanted.has(id)) continue;
      this.group.remove(drawn.mesh);
      this.drawn.delete(id);
    }
    this.layCasters(sprites);
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
    this.eye = axes;
    for (const { mesh, sprite } of this.facingEye) turnToEye(mesh, sprite, axes);
  }

  /**
   * Stands two boards crossed where each standing picture stands, wearing it, for the shadow it throws:
   * a picture turned to the eye would throw a shadow that turned with the camera, and its shadows would
   * have to be drawn again every time the camera moved.
   */
  private layCasters(sprites: readonly TableWorldSprite[]): void {
    const wanted = new Set<string>();
    for (const sprite of sprites) {
      if (!standsUp(sprite) || sprite.look.kind !== 'picture' || sprite.hidden) continue;
      wanted.add(sprite.id);
      const look = sprite.look.url;
      let caster = this.casters.get(sprite.id);
      if (caster && caster.look !== look) {
        this.group.remove(caster.group);
        caster = undefined;
      }
      if (!caster) {
        const material = this.casterMaterial(look);
        const group = new Group();
        for (const turn of [0, Math.PI / 2]) {
          const board = new Mesh(this.square, material);
          board.rotation.y = turn;
          board.castShadow = true;
          board.layers.set(SHADOW_CASTERS_LAYER);
          group.add(board);
        }
        caster = { group, look };
        this.casters.set(sprite.id, caster);
        this.group.add(group);
      }
      caster.group.position.copy(sceneDirection(sprite.centre));
      caster.group.scale.set(sprite.widthPx, sprite.heightPx, sprite.widthPx);
    }
    for (const [id, caster] of this.casters) {
      if (wanted.has(id)) continue;
      this.group.remove(caster.group);
      this.casters.delete(id);
    }
    for (const [url, material] of this.casterMaterials) {
      if ([...this.casters.values()].some((caster) => caster.look === url)) continue;
      material.dispose();
      this.casterMaterials.delete(url);
    }
  }

  private casterMaterial(url: string): MeshBasicNodeMaterial {
    let material = this.casterMaterials.get(url);
    if (!material) {
      material = new MeshBasicNodeMaterial({
        map: this.pictureOf(url),
        alphaTest: CASTER_ALPHA_TEST,
        side: DoubleSide,
      });
      this.casterMaterials.set(url, material);
    }
    return material;
  }

  dispose(): void {
    this.square.dispose();
    for (const material of this.casterMaterials.values()) material.dispose();
    this.casterMaterials.clear();
    this.casters.clear();
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
    this.dress(material);
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

/**
 * How many steps finer than the graphics card would pick a sprite's picture is read at as it is
 * drawn smaller than it is. The card blends two smaller copies of the picture, each made by
 * averaging, which comes out softer than the page draws a picture shrunk, and a piece's picture,
 * stood up to face the camera, is read at that size all over.
 */
const PICTURE_SHARPNESS = -1;

/** A colour the library's colour-space functions answer, which they do not say is a colour. */
function colourNode(node: unknown): ReturnType<typeof vec3> {
  return node as ReturnType<typeof vec3>;
}

/**
 * A picture whose colours carry its clearness, as a sprite's picture is held, shown as the page
 * shows it: its colours taken back apart from its clearness, and dimmed as the page dims one.
 */
function shown(picture: Texture, brightness: number) {
  const sampled = texture(picture).bias(float(PICTURE_SHARPNESS));
  const colour = colourNode(sampled.rgb.div(max(sampled.a, float(0.0001))));
  if (brightness === 1) return vec4(colour, sampled.a);
  const scaled = colourNode(sRGBTransferOETF(colour)).mul(float(brightness));
  return vec4(colourNode(sRGBTransferEOTF(scaled)), sampled.a);
}

/** A picture dimmed as the page dims one, by scaling its colours as they are written, in sRGB. */
function dimmed(picture: Texture, brightness: number) {
  const sampled = texture(picture).bias(float(PICTURE_SHARPNESS));
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
