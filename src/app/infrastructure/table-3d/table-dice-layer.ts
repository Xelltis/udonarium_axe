import type { DiceMaterial } from '@axe/domain/dice/dice-3d/dice-look';
import type { DieLabels } from '@axe/domain/dice/dice-3d/dice-throw-plan';
import { dieRadiusOf, type DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import type { DicePicture, ThrowToDraw } from '@axe/infrastructure/dice-3d/dice-3d-engine';
import { faceColorsOf, swirlSeedOf, veinOf } from '@axe/infrastructure/dice-3d/dice-finishes';
import { diceMeshOf } from '@axe/infrastructure/dice-3d/dice-geometry';
import { type DiceThrowResult, throwSecondsOf } from '@axe/infrastructure/dice-3d/dice-physics-message';
import {
  ACCENT_COLORS,
  contactTexture,
  haloTexture,
  type PosedThrow,
  poseThrow,
} from '@axe/infrastructure/dice-3d/dice-pose';
import { diceStudio } from '@axe/infrastructure/dice-3d/dice-studio';
import {
  averageColorOf,
  type DiceColors,
  drawDiceEngraving,
  drawDiceFaces,
  drawDiceMarks,
  lookFor,
} from '@axe/infrastructure/dice-3d/dice-textures';
import { diceNodeMaterial } from '@axe/infrastructure/table-3d/dice-node-materials';
import type { Table3dDiceThrow } from '@axe/infrastructure/table-3d/table-3d-port';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  NoColorSpace,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  type WebGPURenderer,
} from 'three/webgpu';

interface ShownThrow extends PosedThrow {
  readonly root: Group;
  /** Everything made for this throw alone, let go with it. */
  readonly materials: readonly Material[];
  /** What it was built from, so a throw handed over again unchanged is not built again. */
  readonly draw: ThrowToDraw;
}

/** How many faces' pictures are kept for dice to come, the oldest let go first. */
const FACES_KEPT = 24;

/** A d6 lying still in the middle of a tray, which a material's shaders are built ahead with. */
const STILL_D6: DiceThrowResult = {
  frameCount: 1,
  restFrame: 0,
  frames: new Float32Array([0, 0, 1, 0, 0, 0, 1]),
  landed: [0],
  corrections: [[0, 0, 0, 1]],
  attempt: 0,
  fault: null,
};

/**
 * The dice of the rolls thrown on the table, drawn in the table's own scene: hidden by the walls
 * and pieces in front of them, lit by the table's lights, and veiled where the table is. Each throw
 * is the same dice, faces and finish as a chat frame draws, set where its tray lies on the table
 * and moved by its recording; it fades as it leaves. They throw no shadows of their own, which
 * would have the shadows drawn again every frame they tumble, but a soft patch lies under each.
 */
export class TableDiceLayer {
  readonly group = new Group();
  private readonly shownThrows = new Map<string, ShownThrow>();
  private readonly geometries = new Map<DieShape, BufferGeometry>();
  private readonly faces = new Map<string, CanvasTexture>();
  private readonly engravings = new Map<string, CanvasTexture>();
  private readonly marks = new Map<string, CanvasTexture>();
  private readonly pictures = new Map<string, Texture>();
  private readonly pictureTones = new Map<string, string | null>();
  private readonly contactGeometry = new PlaneGeometry(1, 1);
  private contactPicture: CanvasTexture | null = null;
  private haloPicture: CanvasTexture | null = null;
  private studios: { plain: Texture; metal: Texture } | null = null;
  private readonly warmed = new Set<DiceMaterial>();
  private changed = false;

  constructor(
    private readonly renderer: () => WebGPURenderer,
    private readonly dress: (material: Material, lit: boolean) => void,
    private readonly boardToScene: Matrix4
  ) {}

  /** How many throws are on the table now. */
  get shown(): number {
    return this.shownThrows.size;
  }

  /** The throws on the table now, each as far into its recording and as faded as given. */
  set(throws: readonly Table3dDiceThrow[]): void {
    const wanted = new Set(throws.map((diceThrow) => diceThrow.key));
    for (const [key, shown] of this.shownThrows) {
      if (!wanted.has(key)) this.letGo(key, shown);
    }
    for (const diceThrow of throws) {
      let shown = this.shownThrows.get(diceThrow.key);
      if (shown && shown.draw !== diceThrow.draw) {
        this.letGo(diceThrow.key, shown);
        shown = undefined;
      }
      if (!shown) {
        shown = this.build(diceThrow.draw);
        this.shownThrows.set(diceThrow.key, shown);
        this.group.add(shown.root);
      }
      shown.root.matrix.copy(this.boardToScene).multiply(new Matrix4().fromArray(diceThrow.model as number[]));
      shown.root.matrixWorldNeedsUpdate = true;
      for (const material of shown.materials) material.opacity = diceThrow.opacity;
      poseThrow(shown, diceThrow.seconds, diceThrow.opacity);
      shown.root.updateMatrixWorld(true);
    }
    this.changed ||= throws.length > 0 || wanted.size !== this.shownThrows.size;
  }

  /**
   * Builds the shaders of a material ahead of the first die on the table that wears it, with a die
   * of its own standing in a scene of its own, so no throw drawn meanwhile shows it. A critical's
   * ring is built along with the first.
   */
  async warm(material: DiceMaterial, compile: (staging: Scene) => Promise<unknown>): Promise<void> {
    if (this.warmed.has(material)) return;
    this.warmed.add(material);
    const warm = this.build({
      dice: [{ shape: 'd6', labels: 'standard' }],
      color: '#202024',
      material,
      accent: this.warmed.size === 1 ? 'critical' : '',
      tray: { halfWidth: 4, halfDepth: 2 },
      result: STILL_D6,
    });
    const staging = new Scene();
    staging.add(warm.root);
    try {
      await compile(staging);
    } finally {
      staging.remove(warm.root);
      for (const made of warm.materials) made.dispose();
    }
  }

  /** Whether anything was put on the table, moved or taken off it since this was last asked. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  dispose(): void {
    for (const [key, shown] of this.shownThrows) this.letGo(key, shown);
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const textures of [this.faces, this.engravings, this.marks, this.pictures]) {
      for (const texture of textures.values()) texture.dispose();
      textures.clear();
    }
    this.contactGeometry.dispose();
    this.contactPicture?.dispose();
    this.haloPicture?.dispose();
    this.studios?.plain.dispose();
    this.studios?.metal.dispose();
  }

  /** Sets up a throw's dice: each a body moved by the recording, its mesh turned to show the number rolled. */
  private build(draw: ThrowToDraw): ShownThrow {
    const root = new Group();
    root.matrixAutoUpdate = false;
    const materials: Material[] = [];
    const picture = draw.picture ?? null;
    const look = picture ? this.colorsUnder(picture, draw.color, draw.ink) : lookFor(draw.color, draw.ink);
    const made = picture ? 'resin' : (draw.material ?? 'resin');
    const studios = this.studiosFor();
    const bodies = draw.dice.map((die, index) => {
      const body = new Group();
      const wrapped = picture?.fit === 'wrap' ? this.textureOf(picture) : undefined;
      const material = diceNodeMaterial({
        kind: wrapped ? 'picture' : made,
        faces: this.facesOf(die.shape, die.labels, faceColorsOf(made, look), picture),
        engraving: this.engravingOf(die.shape, die.labels),
        marks: this.marksOf(die.shape, die.labels),
        vein: veinOf(look.body),
        seed: swirlSeedOf(draw.seedKey ?? '', index),
        ...(wrapped ? { picture: wrapped } : {}),
        ...(made === 'glass' ? { tint: new Color(look.body) } : {}),
        studio: made === 'metal' ? studios.metal : studios.plain,
      });
      this.dress(material, true);
      materials.push(material);
      const mesh = new Mesh(this.geometryOf(die.shape), material);
      mesh.scale.setScalar(dieRadiusOf(die.shape));
      const [x, y, z, w] = draw.result.corrections[index];
      mesh.quaternion.set(x, y, z, w);
      body.add(mesh);
      root.add(body);
      return body;
    });
    const patch = (color: number, picture: CanvasTexture, glowing: boolean) => {
      const material = new MeshBasicNodeMaterial({
        color,
        map: picture,
        transparent: true,
        depthWrite: false,
        ...(glowing ? { blending: AdditiveBlending, opacity: 0 } : {}),
      });
      this.dress(material, false);
      materials.push(material);
      const mesh = new Mesh<BufferGeometry, Material>(this.contactGeometry, material);
      root.add(mesh);
      return mesh;
    };
    this.contactPicture ??= contactTexture();
    const contacts = draw.dice.map(() => patch(0x000000, this.contactPicture!, false));
    const accent = draw.accent ? ACCENT_COLORS[draw.accent] : null;
    this.haloPicture ??= haloTexture();
    const halos = accent !== null ? draw.dice.map(() => patch(accent, this.haloPicture!, true)) : [];
    return {
      root,
      bodies,
      contacts,
      halos,
      materials,
      draw,
      radii: draw.dice.map((die) => dieRadiusOf(die.shape)),
      restHeights: draw.dice.map((die) => polyhedronOf(die.shape).inradius * dieRadiusOf(die.shape)),
      result: draw.result,
      restSeconds: throwSecondsOf(draw.result, accent !== null).restSeconds,
    };
  }

  private letGo(key: string, shown: ShownThrow): void {
    this.group.remove(shown.root);
    for (const material of shown.materials) material.dispose();
    this.shownThrows.delete(key);
    this.changed = true;
  }

  /** The studio the dice mirror, as a chat frame lights them, and the brighter one metal mirrors. */
  private studiosFor(): { plain: Texture; metal: Texture } {
    if (!this.studios) {
      const pmrem = new PMREMGenerator(this.renderer());
      this.studios = {
        plain: pmrem.fromScene(diceStudio(), 0.02).texture,
        metal: pmrem.fromScene(diceStudio(true), 0.02).texture,
      };
      pmrem.dispose();
    }
    return this.studios;
  }

  private geometryOf(shape: DieShape): BufferGeometry {
    let geometry = this.geometries.get(shape);
    if (!geometry) {
      const mesh = diceMeshOf(shape);
      geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
      geometry.setAttribute('tangent', new BufferAttribute(mesh.tangents, 4));
      geometry.setIndex(new BufferAttribute(mesh.indices, 1));
      this.geometries.set(shape, geometry);
    }
    return geometry;
  }

  /** The picture of a die's faces in its colours, or with a picture laid on each face. */
  private facesOf(shape: DieShape, labels: DieLabels, colors: DiceColors, picture: DicePicture | null): CanvasTexture {
    const onFaces = picture?.fit === 'faces' ? picture : null;
    const key = `${shape}|${labels}|${colors.body}|${colors.ink}|${colors.accent}|${onFaces?.key ?? ''}`;
    let faces = this.faces.get(key);
    if (faces) {
      this.faces.delete(key);
      this.faces.set(key, faces);
      return faces;
    }
    faces = new CanvasTexture(drawDiceFaces(shape, labels, colors, onFaces?.source ?? null));
    faces.colorSpace = SRGBColorSpace;
    this.faces.set(key, faces);
    if (this.faces.size > FACES_KEPT) {
      const [oldest, dropped] = this.faces.entries().next().value!;
      if (![...this.shownThrows.values()].some((shown) => shown.materials.some((m) => usesMap(m, dropped)))) {
        this.faces.delete(oldest);
        dropped.dispose();
      }
    }
    return faces;
  }

  private engravingOf(shape: DieShape, labels: DieLabels): CanvasTexture {
    return this.kept(this.engravings, `${shape}|${labels}`, () => drawDiceEngraving(shape, labels));
  }

  private marksOf(shape: DieShape, labels: DieLabels): CanvasTexture {
    return this.kept(this.marks, `${shape}|${labels}`, () => drawDiceMarks(shape, labels));
  }

  private kept(textures: Map<string, CanvasTexture>, key: string, draw: () => HTMLCanvasElement): CanvasTexture {
    let texture = textures.get(key);
    if (!texture) {
      texture = new CanvasTexture(draw());
      texture.colorSpace = NoColorSpace;
      textures.set(key, texture);
    }
    return texture;
  }

  /** A picture as a texture to wrap round dice, made once for every die that wears it. */
  private textureOf(picture: DicePicture): Texture {
    let texture = this.pictures.get(picture.key);
    if (!texture) {
      texture = new Texture(picture.source as TexImageSource);
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.flipY = false;
      texture.needsUpdate = true;
      this.pictures.set(picture.key, texture);
    }
    return texture;
  }

  /** The colours of a die wearing a picture: the body where it is clear, and ink that stands out from the picture as a whole. */
  private colorsUnder(picture: DicePicture, body: string, ink: string | undefined): DiceColors {
    if (!this.pictureTones.has(picture.key)) this.pictureTones.set(picture.key, averageColorOf(picture.source));
    const tone = this.pictureTones.get(picture.key) ?? body;
    const marks = lookFor(tone, ink);
    return { body: lookFor(body).body, ink: marks.ink, accent: marks.accent };
  }
}

function usesMap(material: Material, texture: Texture): boolean {
  return (material as Material & { map?: Texture | null }).map === texture;
}
