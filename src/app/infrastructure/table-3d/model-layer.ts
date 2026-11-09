import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import type { WallJoinCell } from '@axe/domain/tabletop/world/wall-joins';
import { UnusedSince } from '@axe/infrastructure/table-3d/unused-since';
import { disposeObject } from '@axe/infrastructure/three-kit/dispose';
import { HeldModelReader } from '@axe/infrastructure/three-kit/held-model-reader';
import { picturesOf, releaseReadPictures } from '@axe/infrastructure/three-kit/read-pictures';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshLambertNodeMaterial,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';

/**
 * What a model is drawn from: its scene once read, and how large it is as it was made. Only its scene
 * and its motions are kept of what its file was read into, not the reader's own store of the file.
 */
interface LoadedModel {
  readonly gltf: Pick<GLTF, 'scene' | 'animations'>;
  readonly size: Vector3;
  /** The middle of its foot, as it was made: its box's middle across and its lowest point. */
  readonly foot: Vector3;
  /** Whether it plays any motion, which its every copy is then stood on its own to play. */
  readonly animated: boolean;
  /**
   * Whether it is made to be stretched to the box it stands in, each way on its own, as a door or a
   * stair of any size is, rather than fitted inside it keeping its shape. Its scene says so in its
   * extras, as `{ "fit": "stretch" }`.
   */
  readonly stretch?: boolean;
  /**
   * Whether it is the kit a building is made of, its scene saying `{ "fit": "facade" }` in its extras:
   * a wall, a roof and a parapet, each one cell across, which are repeated to fill the block.
   */
  readonly facade?: boolean;
  /**
   * Whether it is one cell of something that runs along a block, its scene saying `{ "fit": "tile" }` in
   * its extras: made one cell square and of a height of one, it is repeated on every cell of the block
   * and stretched to the block's height, as a palisade is along its run.
   */
  readonly tile?: boolean;
  /**
   * Whether a tile keeps the height it was made at, in cells, whatever the height of its block, its
   * scene saying `{ "fit": "tile", "height": "made" }`: a crop stands as tall as it grows on a block
   * thin enough to walk over.
   */
  readonly madeHeight?: boolean;
  /**
   * Whether it is one cell of a wall that joins the walls beside it, its scene saying `{ "fit": "joined" }`
   * in its extras: an arm made from the middle of a cell out to its east side, and a hub that stands in
   * the middle, each made one cell across and of a height of one. The hub stands in the middle of every
   * cell of the block and an arm reaches out from it to each wall and door beside it, all stretched to
   * the block's height.
   */
  readonly joined?: boolean;
  /** Its meshes, each where it stands within the model measured from the model's foot. */
  readonly parts: readonly ModelPart[];
}

/**
 * One mesh of a model, where it stands within the model measured from the model's foot, and for a leaf
 * of a door that swings on a hinge of its own, as a saloon's do, the point it turns about, measured the
 * same way, and how far it turns open, in degrees about the upright as the model was made.
 */
interface ModelPart {
  readonly mesh: Mesh;
  readonly within: Matrix4;
  readonly swing?: { readonly hinge: Vector3; readonly deg: number };
  /** Which part of a building's kit it is, as its node says in its extras as `{ "part": ... }`; a wall if it says none. */
  readonly role?: KitRole;
  /** Whether it is the hub of a joined wall, as its node says in its extras as `{ "part": "hub" }`, rather than its arm. */
  readonly hub?: boolean;
}

/** The parts of a building's kit: its wall, its roof and its parapet. */
type KitRole = 'wall' | 'roof' | 'cap';

/** What a model's placement is worked out from: its size as made, whether it is stretched, and its leaves. */
type ModelMeasure = Pick<LoadedModel, 'size'> & {
  readonly stretch?: boolean;
  readonly facade?: boolean;
  readonly tile?: boolean;
  readonly madeHeight?: boolean;
  readonly joined?: boolean;
  readonly parts?: readonly Pick<ModelPart, 'within' | 'swing' | 'role' | 'hub'>[];
};

/**
 * Every copy of a model that plays no motion, drawn together: one instanced mesh for each of its meshes,
 * each as large as the copies of that mesh it may draw, which for a building's parts is many to a copy.
 */
interface Herd {
  readonly parts: readonly InstancedMesh[];
  readonly capacities: readonly number[];
  copies: number;
}

interface StoodModel {
  readonly owner: string;
  readonly url: string;
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly idle: AnimationAction | null;
  readonly walk: AnimationAction | null;
  walking: boolean;
}

/** How many radians a degree is. */
const RADIANS = Math.PI / 180;

/**
 * How long a model read but no longer laid on the table is kept, in milliseconds, before what it
 * holds is let go of: long enough that a piece the fog hides and shows again, or a table gone to and
 * come back from, is drawn again at once.
 */
export const UNUSED_MODEL_KEEP_MS = 120_000;

/**
 * The pieces and blocks drawn as 3D models: each a binary glTF file read from bytes held here, its
 * materials made over to be lit and veiled as the rest of the scene is, stood with its foot at the
 * piece's, fitted inside the piece's box, and turned as the piece is. A model that plays a walk
 * plays it while its piece is moved, and stands in the first pose of its idle otherwise, so a table
 * standing still is not drawn again. Nothing a model names outside its own bytes is ever fetched,
 * and one that draws more triangles than a model may, or cannot be read, is left drawn as its
 * picture. The decoders for compressed meshes and textures are fetched, from the app's own assets,
 * only once a model that needs them comes. The pixels its pictures were read into are let go of once
 * the graphics card holds them, and a model laid on the table no longer is let go of altogether once
 * it has gone unused for `UNUSED_MODEL_KEEP_MS`, to be read again if it is laid again.
 */
export class ModelLayer {
  readonly group = new Group();
  private readonly reader: HeldModelReader;
  private readonly loaded = new Map<string, LoadedModel | null>();
  private readonly loading = new Set<string>();
  /** When each model read but no longer laid stopped being laid, by its URL. */
  private readonly unused = new UnusedSince(UNUSED_MODEL_KEEP_MS);
  private sweepTimer: ReturnType<typeof setTimeout> | null = null;
  private sweepDueAt = 0;
  private stood = new Map<string, StoodModel>();
  private readonly herds = new Map<string, Herd>();
  private laid: readonly TableWorldModel[] = [];
  private changed = false;
  private lastTimeMs: number | null = null;

  constructor(
    private readonly dress: (material: Material) => void,
    private readonly arrived: () => void,
    private readonly renderer: () => WebGPURenderer
  ) {
    this.reader = new HeldModelReader(() => this.renderer());
  }

  /** How many models are read and stood. */
  get shown(): number {
    let copies = this.stood.size;
    for (const herd of this.herds.values()) copies += herd.copies;
    return copies;
  }

  /** How many meshes the models are drawn with, each instanced mesh counted once however many copies it draws. */
  get meshes(): number {
    let meshes = 0;
    for (const herd of this.herds.values()) meshes += herd.copies > 0 ? herd.parts.length : 0;
    for (const stood of this.stood.values())
      stood.root.traverse((object) => (meshes += object instanceof Mesh ? 1 : 0));
    return meshes;
  }

  get isLoading(): boolean {
    return this.loading.size > 0;
  }

  /** The pieces and blocks drawn as models now, which a frame of their shadows follows. */
  set(models: readonly TableWorldModel[]): void {
    if (models === this.laid) return;
    this.laid = models;
    this.lay();
  }

  /** Moves the walks on to a moment, in milliseconds; answers whether any model is walking. */
  advance(timeMs: number): boolean {
    const step = this.lastTimeMs === null ? 0 : Math.min(0.1, (timeMs - this.lastTimeMs) / 1000);
    this.lastTimeMs = timeMs;
    let walking = false;
    for (const stood of this.stood.values()) {
      if (!stood.walking) continue;
      stood.mixer.update(step);
      walking = true;
      this.changed = true;
    }
    if (!walking) this.lastTimeMs = null;
    return walking;
  }

  /** Whether anything was read, stood or moved since this was last asked, which wants drawing. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  dispose(): void {
    for (const stood of this.stood.values()) this.group.remove(stood.root);
    this.stood.clear();
    for (const herd of this.herds.values()) this.unherd(herd);
    this.herds.clear();
    for (const loaded of this.loaded.values()) if (loaded) disposeObject(loaded.gltf.scene);
    this.loaded.clear();
    this.unused.clear();
    if (this.sweepTimer !== null) clearTimeout(this.sweepTimer);
    this.sweepTimer = null;
    this.reader.dispose();
  }

  /**
   * Stands every model laid where its piece is, reading first any not read yet: a model that plays a
   * motion as a copy of its own, and the copies of one that plays none together in its herd.
   */
  private lay(): void {
    const wanted = new Map(this.laid.map((model) => [model.owner, model]));
    for (const [owner, stood] of this.stood) {
      if (wanted.get(owner)?.url === stood.url) continue;
      this.group.remove(stood.root);
      stood.mixer.stopAllAction();
      this.stood.delete(owner);
    }
    const flocks = new Map<string, TableWorldModel[]>();
    for (const model of this.laid) {
      const loaded = this.loaded.get(model.url);
      if (loaded === undefined) this.read(model.url);
      if (!loaded) continue;
      if (loaded.animated) this.stand(model, loaded);
      else flocks.set(model.url, [...(flocks.get(model.url) ?? []), model]);
    }
    for (const [url, herd] of this.herds) {
      if (flocks.has(url)) continue;
      this.unherd(herd);
      this.herds.delete(url);
    }
    for (const [url, flock] of flocks) this.herd(url, this.loaded.get(url)!, flock);
    this.noteUnused();
    this.changed = true;
  }

  /**
   * Notes when each model read stopped being laid, and has those that have gone unused long enough
   * let go of then. A model laid again before that is kept as though it had never gone.
   */
  private noteUnused(): void {
    const read = [...this.loaded].filter(([, loaded]) => loaded !== null).map(([url]) => url);
    this.unused.note(read, new Set(this.laid.map((model) => model.url)), performance.now());
    this.sweepLater();
  }

  /** Has the layer swept when the next model unused is due, keeping a sweep already set for no later. */
  private sweepLater(): void {
    const now = performance.now();
    const wait = this.unused.nextDueIn(now);
    if (wait === null || (this.sweepTimer !== null && this.sweepDueAt <= now + wait)) return;
    if (this.sweepTimer !== null) clearTimeout(this.sweepTimer);
    this.sweepDueAt = now + wait;
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = null;
      this.sweep();
    }, wait);
  }

  /** Lets go of every model that has gone unused for `UNUSED_MODEL_KEEP_MS`: its meshes, materials and pictures. */
  private sweep(): void {
    for (const url of this.unused.takeDue(performance.now())) {
      const loaded = this.loaded.get(url);
      this.loaded.delete(url);
      if (loaded) disposeObject(loaded.gltf.scene);
    }
    this.sweepLater();
  }

  /** Stands a model that plays a motion where its piece is, as a copy of its own. */
  private stand(model: TableWorldModel, loaded: LoadedModel): void {
    let stood = this.stood.get(model.owner);
    if (!stood) {
      stood = this.instanceOf(model, loaded);
      this.stood.set(model.owner, stood);
      this.group.add(stood.root);
    }
    const inner = stood.root.children[0];
    inner.position.set(-loaded.foot.x, -loaded.foot.y, -loaded.foot.z);
    placementOf(model, loaded).decompose(stood.root.position, stood.root.quaternion, stood.root.scale);
    stood.root.updateMatrixWorld(true);
    this.walk(stood, model.walking);
  }

  /** Stands the copies of a model that plays no motion where their pieces are, its herd grown where it is too small. */
  private herd(url: string, loaded: LoadedModel, flock: readonly TableWorldModel[]): void {
    const placements = flock.map((model) => partPlacementsOf(model, loaded));
    const counts = loaded.parts.map((_, part) => placements.reduce((sum, each) => sum + each[part].length, 0));
    let herd = this.herds.get(url);
    if (!herd || counts.some((count, part) => herd!.capacities[part] < count)) {
      if (herd) this.unherd(herd);
      const capacities = counts.map((count) => Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, count)))));
      herd = {
        parts: loaded.parts.map(({ mesh }, index) => {
          const part = new InstancedMesh(mesh.geometry, mesh.material, capacities[index]);
          part.castShadow = true;
          part.receiveShadow = true;
          part.matrixAutoUpdate = false;
          this.group.add(part);
          return part;
        }),
        capacities,
        copies: 0,
      };
      this.herds.set(url, herd);
    }
    herd.copies = flock.length;
    herd.parts.forEach((part, index) => {
      let at = 0;
      for (const each of placements) for (const matrix of each[index]) part.setMatrixAt(at++, matrix);
      part.count = at;
      part.instanceMatrix.needsUpdate = true;
      part.computeBoundingSphere();
    });
  }

  private unherd(herd: Herd): void {
    for (const part of herd.parts) {
      this.group.remove(part);
      part.dispose();
    }
  }

  /** Plays a model's walk while its piece is moved, and holds it in the first pose of its idle otherwise. */
  private walk(stood: StoodModel, walking: boolean): void {
    if (stood.walking === walking) return;
    stood.walking = walking;
    stood.mixer.stopAllAction();
    const action = walking ? (stood.walk ?? stood.idle) : stood.idle;
    action?.reset().play();
    stood.mixer.update(0);
  }

  private instanceOf(model: TableWorldModel, loaded: LoadedModel): StoodModel {
    const inner = cloneSkinned(loaded.gltf.scene) as Object3D;
    const root = new Group();
    root.add(inner);
    const mixer = new AnimationMixer(inner);
    const clip = (name: string, pattern: RegExp) =>
      (name ? AnimationClip.findByName(loaded.gltf.animations, name) : null) ??
      loaded.gltf.animations.find((candidate) => pattern.test(candidate.name)) ??
      null;
    const idleClip = clip(model.model.idle, /idle|stand|wait/i) ?? loaded.gltf.animations[0] ?? null;
    const walkClip = clip(model.model.walk, /walk|run|move/i);
    const stood: StoodModel = {
      owner: model.owner,
      url: model.url,
      root,
      mixer,
      idle: idleClip ? mixer.clipAction(idleClip) : null,
      walk: walkClip ? mixer.clipAction(walkClip) : null,
      walking: true,
    };
    this.walk(stood, false);
    return stood;
  }

  /** Reads a model from bytes held here, its materials made over for the scene, and asks for a frame once it is read. */
  private read(url: string): void {
    if (this.loading.has(url)) return;
    this.loading.add(url);
    this.parse(url).then(
      (loaded) => {
        this.loaded.set(url, loaded);
        this.settle(url);
      },
      () => {
        this.loaded.set(url, null);
        this.settle(url);
      }
    );
  }

  /** A model read from bytes held here, or null for one that is not to be drawn. */
  private async parse(url: string): Promise<LoadedModel | null> {
    const read = await this.reader.read(url);
    if (!read) return null;
    const gltf = { scene: read.scene, animations: read.animations };
    const drawn = new Set<Texture>();
    const undrawn = new Set<Texture>();
    gltf.scene.traverse((object) => this.makeOver(object, drawn, undrawn));
    for (const picture of drawn) undrawn.delete(picture);
    releaseReadPictures(drawn, undrawn);
    for (const picture of undrawn) picture.dispose();
    gltf.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(gltf.scene);
    const size = box.getSize(new Vector3());
    const middle = box.getCenter(new Vector3());
    const foot = new Vector3(middle.x, box.min.y, middle.z);
    const fromFoot = new Matrix4().makeTranslation(-foot.x, -foot.y, -foot.z);
    const extras = gltf.scene.userData as { fit?: unknown; height?: unknown };
    const fit = extras.fit;
    const facade = fit === 'facade';
    const tile = fit === 'tile';
    const madeHeight = tile && extras.height === 'made';
    const joined = fit === 'joined';
    const parts: ModelPart[] = [];
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (facade || tile || joined) {
        parts.push({
          mesh: object,
          within: object.matrixWorld.clone(),
          ...(facade ? { role: kitRoleOf(object) } : {}),
          ...(joined && isHub(object) ? { hub: true } : {}),
        });
        return;
      }
      const swing = swingOf(object);
      parts.push({
        mesh: object,
        within: fromFoot.clone().multiply(object.matrixWorld),
        ...(swing ? { swing: { hinge: swing.hinge.applyMatrix4(fromFoot), deg: swing.deg } } : {}),
      });
    });
    const stretch = fit === 'stretch';
    return { gltf, size, foot, animated: gltf.animations.length > 0, parts, stretch, facade, tile, madeHeight, joined };
  }

  private settle(url: string): void {
    this.loading.delete(url);
    this.lay();
    this.arrived();
  }

  /**
   * Makes a mesh's material over as the scene's own: lit as the board is, veiled and darkened with
   * it, throwing shadows. The picture of its colour is drawn with, and noted so; the rest of the
   * pictures it wore, as its bumps and its shine, are noted as not drawn.
   */
  private makeOver(object: Object3D, drawn: Set<Texture>, undrawn: Set<Texture>): void {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const madeOver = (material: Material) => {
      const was = material as MeshStandardMaterial;
      for (const picture of picturesOf(material)) (picture === was.map ? drawn : undrawn).add(picture);
      const lit = new MeshLambertNodeMaterial({
        color: was.color,
        map: was.map ?? null,
        transparent: was.transparent,
        opacity: was.opacity,
        alphaTest: was.alphaTest,
        side: was.side,
        vertexColors: was.vertexColors,
      });
      this.dress(lit);
      material.dispose();
      return lit;
    };
    object.material = Array.isArray(object.material) ? object.material.map(madeOver) : madeOver(object.material);
  }
}

/**
 * Where a model stands for its piece, from its foot as it was made: at the piece's foot and as high
 * as it floats, fitted inside the piece's box, turned by the model's own turn and as the piece is,
 * and tipped over as the piece's picture is, about the point its picture is tipped over about: its
 * head to the east for a piece not turned, tipped over by a right angle.
 */
export function placementOf(model: TableWorldModel, loaded: ModelMeasure): Matrix4 {
  const { frame, scaling } = placementPartsOf(model, loaded);
  return frame.multiply(scaling);
}

/**
 * A model's placement in two: where it stands, turned and tipped, and how it is scaled as it was made;
 * a leaf that swings on a hinge of its own is swung between the two. An open door whose model has no
 * such leaves is moved whole, as its faces are.
 */
function placementPartsOf(model: TableWorldModel, loaded: ModelMeasure): { frame: Matrix4; scaling: Matrix4 } {
  const pivot = model.pivotPx;
  const turned = Math.round(model.model.turnDeg / 90) % 2 !== 0;
  const scaling =
    loaded.stretch && model.boxPx && model.heightPx > 0
      ? new Matrix4().makeScale(
          (turned ? model.boxPx.depthPx : model.boxPx.widthPx) / Math.max(loaded.size.x, 1e-6),
          model.heightPx / Math.max(loaded.size.y, 1e-6),
          (turned ? model.boxPx.widthPx : model.boxPx.depthPx) / Math.max(loaded.size.z, 1e-6)
        )
      : uniformScale(model, loaded);
  const door = model.door?.open && !(loaded.parts ?? []).some((part) => part.swing) ? model.door : null;
  const frame = new Matrix4()
    .makeTranslation(
      model.foot.x + (door?.shiftX ?? 0),
      model.foot.z + model.altitudePx + pivot + (door?.liftPx ?? 0),
      model.foot.y + (door?.shiftY ?? 0)
    )
    .multiply(new Matrix4().makeRotationY(-(model.rotateDeg + (door?.turnDeg ?? 0)) * RADIANS))
    .multiply(new Matrix4().makeRotationZ(-model.rollDeg * RADIANS))
    .multiply(new Matrix4().makeTranslation(0, -pivot, 0))
    .multiply(new Matrix4().makeRotationY(-model.model.turnDeg * RADIANS));
  return { frame, scaling };
}

/**
 * Where each mesh of a model is drawn for a piece or block: placed with the model, and a leaf that swings
 * on a hinge of its own swung open about it while its door stands open.
 */
export function partPlacementsOf(model: TableWorldModel, loaded: ModelMeasure): Matrix4[][] {
  if (loaded.facade && model.boxPx) return facadePlacementsOf(model, loaded);
  if (loaded.tile && model.boxPx) return tilePlacementsOf(model, loaded);
  if (loaded.joined && model.boxPx) return joinedPlacementsOf(model, loaded);
  const { frame, scaling } = placementPartsOf(model, loaded);
  const placement = frame.clone().multiply(scaling);
  const open = model.door?.open === true;
  return (loaded.parts ?? []).map(({ within, swing }) => [
    open && swing
      ? frame.clone().multiply(swungAbout(scaling, swing)).multiply(scaling).multiply(within)
      : placement.clone().multiply(within),
  ]);
}

/** The four sides of a block, each as the turn that faces a part made facing south out of it. */
const SIDES = [
  { turn: 0, along: 'x', out: [0, 1] },
  { turn: Math.PI, along: 'x', out: [0, -1] },
  { turn: Math.PI / 2, along: 'z', out: [1, 0] },
  { turn: -Math.PI / 2, along: 'z', out: [-1, 0] },
] as const;

/**
 * Where the parts of a building's kit stand to make the building of a block: its wall, one cell wide
 * and one storey tall facing out, repeated round all four sides and up every storey; its roof, one
 * cell square, laid over the top; its parapet, one cell long, along every edge of the roof. Each side
 * takes as many whole cells as fit it and each storey as much of the height as its share, so the kit
 * fills the block however many cells it is and however tall.
 */
function facadePlacementsOf(model: TableWorldModel, loaded: ModelMeasure): Matrix4[][] {
  const box = model.boxPx!;
  const cell = Math.max(1, box.cellPx ?? box.widthPx);
  const { frame } = placementPartsOf(model, loaded);
  const width = box.widthPx;
  const depth = box.depthPx;
  const height = Math.max(1e-6, model.heightPx);
  const storeys = Math.max(1, Math.round(height / cell));
  const storey = height / storeys;
  const along = (length: number) => Math.max(1, Math.round(length / cell));
  const placed = (x: number, y: number, z: number, turn: number, sx: number, sy: number, sz: number, within: Matrix4) =>
    frame
      .clone()
      .multiply(new Matrix4().makeTranslation(x, y, z))
      .multiply(new Matrix4().makeRotationY(turn))
      .multiply(new Matrix4().makeScale(sx, sy, sz))
      .multiply(within);
  return (loaded.parts ?? []).map(({ within, role }) => {
    const matrices: Matrix4[] = [];
    if (role === 'roof') {
      const across = along(width);
      const deep = along(depth);
      for (let i = 0; i < across; i++) {
        for (let j = 0; j < deep; j++) {
          const x = -width / 2 + (width / across) * (i + 0.5);
          const z = -depth / 2 + (depth / deep) * (j + 0.5);
          matrices.push(placed(x, height, z, 0, width / across, cell, depth / deep, within));
        }
      }
      return matrices;
    }
    for (const side of SIDES) {
      const length = side.along === 'x' ? width : depth;
      const count = along(length);
      const step = length / count;
      const outX = (side.out[0] * width) / 2;
      const outZ = (side.out[1] * depth) / 2;
      for (let i = 0; i < count; i++) {
        const offset = -length / 2 + step * (i + 0.5);
        const x = side.along === 'x' ? (side.out[1] > 0 ? offset : -offset) : outX;
        const z = side.along === 'z' ? (side.out[0] > 0 ? -offset : offset) : outZ;
        if (role === 'cap') matrices.push(placed(x, height, z, side.turn, step, cell, cell, within));
        else
          for (let k = 0; k < storeys; k++)
            matrices.push(placed(x, storey * k, z, side.turn, step, storey, cell, within));
      }
    }
    return matrices;
  });
}

/**
 * Where a tile stands on every cell of a block: one to each whole cell it is across and deep, as the
 * block is turned, each stretched to its cell across and to the block's height up, or for a tile that
 * keeps the height it was made at, as tall as it was made in cells.
 */
function tilePlacementsOf(model: TableWorldModel, loaded: ModelMeasure): Matrix4[][] {
  const box = model.boxPx!;
  const cell = Math.max(1, box.cellPx ?? box.widthPx);
  const { frame } = placementPartsOf(model, loaded);
  const turned = Math.round(model.model.turnDeg / 90) % 2 !== 0;
  const width = turned ? box.depthPx : box.widthPx;
  const depth = turned ? box.widthPx : box.depthPx;
  const across = Math.max(1, Math.round(width / cell));
  const deep = Math.max(1, Math.round(depth / cell));
  const height = loaded.madeHeight ? cell : Math.max(1e-6, model.heightPx);
  return (loaded.parts ?? []).map(({ within }) => {
    const matrices: Matrix4[] = [];
    for (let i = 0; i < across; i++) {
      for (let j = 0; j < deep; j++) {
        const x = -width / 2 + (width / across) * (i + 0.5);
        const z = -depth / 2 + (depth / deep) * (j + 0.5);
        matrices.push(
          frame
            .clone()
            .multiply(new Matrix4().makeTranslation(x, 0, z))
            .multiply(new Matrix4().makeScale(width / across, height, depth / deep))
            .multiply(within)
        );
      }
    }
    return matrices;
  });
}

/**
 * Where a joined wall stands on every cell of a block: its hub in the middle of each cell, and its arm
 * from there out to each side the cell reaches out to, as far as that side and turned to it, all
 * stretched to the block's height. A block that reaches out to nothing runs along its longer side, as
 * a tile does, from one end of each cell to the other.
 */
function joinedPlacementsOf(model: TableWorldModel, loaded: ModelMeasure): Matrix4[][] {
  const box = model.boxPx!;
  const cell = Math.max(1, box.cellPx ?? box.widthPx);
  const height = Math.max(1e-6, model.heightPx);
  const base = model.foot.z + model.altitudePx;
  const cells = model.joins ?? runningCellsOf(model, cell);
  return (loaded.parts ?? []).map(({ within, hub }) => {
    const matrices: Matrix4[] = [];
    for (const { x, y, arms } of cells) {
      const middle = new Matrix4().makeTranslation(x, base, y);
      if (hub) {
        matrices.push(middle.multiply(new Matrix4().makeScale(cell, height, cell)).multiply(within));
        continue;
      }
      for (const arm of arms)
        matrices.push(
          middle
            .clone()
            .multiply(new Matrix4().makeRotationY(-arm.deg * RADIANS))
            .multiply(new Matrix4().makeScale(arm.lengthPx * 2, height, cell))
            .multiply(within)
        );
    }
    return matrices;
  });
}

/**
 * The cells of a block that reaches out to no wall beside it, each running from end to end along the
 * block's longer side, as it is turned, or for a block as deep as it is wide, the way its model is
 * turned.
 */
function runningCellsOf(model: TableWorldModel, cell: number): WallJoinCell[] {
  const box = model.boxPx!;
  const across = Math.max(1, Math.round(box.widthPx / cell));
  const deep = Math.max(1, Math.round(box.depthPx / cell));
  const turn = model.rotateDeg * RADIANS;
  const along =
    model.rotateDeg + (box.depthPx > box.widthPx ? 90 : box.depthPx < box.widthPx ? 0 : model.model.turnDeg);
  const arms = [
    { deg: along, lengthPx: cell / 2 },
    { deg: along + 180, lengthPx: cell / 2 },
  ];
  const cells: WallJoinCell[] = [];
  for (let i = 0; i < across; i++) {
    for (let j = 0; j < deep; j++) {
      const dx = -box.widthPx / 2 + (box.widthPx / across) * (i + 0.5);
      const dy = -box.depthPx / 2 + (box.depthPx / deep) * (j + 0.5);
      cells.push({
        x: model.foot.x + dx * Math.cos(turn) - dy * Math.sin(turn),
        y: model.foot.y + dx * Math.sin(turn) + dy * Math.cos(turn),
        arms,
      });
    }
  }
  return cells;
}

/** The turn a leaf swings open by, about its hinge where the scaling puts it, so that it swings unstretched. */
function swungAbout(scaling: Matrix4, swing: NonNullable<ModelPart['swing']>): Matrix4 {
  const hinge = swing.hinge.clone().applyMatrix4(scaling);
  return new Matrix4()
    .makeTranslation(hinge.x, hinge.y, hinge.z)
    .multiply(new Matrix4().makeRotationY(swing.deg * RADIANS))
    .multiply(new Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z));
}

/** Which part of a building's kit a mesh is, as its node (or one it hangs from) says: a wall if none says. */
function kitRoleOf(object: Object3D): KitRole {
  return partOf(object, ['roof', 'cap', 'wall']) ?? 'wall';
}

/**
 * Which of the parts asked about a mesh is, as the nearest of its node and those it hangs from that
 * names one of them says, passing over any that names another; null where none does.
 */
function partOf<Part extends string>(object: Object3D, parts: readonly Part[]): Part | null {
  for (let node: Object3D | null = object; node; node = node.parent) {
    const part = (node.userData as { part?: unknown }).part;
    if ((parts as readonly unknown[]).includes(part)) return part as Part;
  }
  return null;
}

/** Whether a mesh is the hub of a joined wall, as its node (or one it hangs from) says. */
function isHub(object: Object3D): boolean {
  return partOf(object, ['hub']) === 'hub';
}

/**
 * The hinge a mesh of a door swings on and how far, as its node (or one it hangs from) says in its
 * extras: `{ "hinge": [x, y, z], "swing": degrees }`, the hinge where it stands in the model as made.
 */
function swingOf(object: Object3D): { hinge: Vector3; deg: number } | null {
  for (let node: Object3D | null = object; node; node = node.parent) {
    const data = node.userData as { hinge?: unknown; swing?: unknown };
    const hinge = data.hinge;
    if (
      Array.isArray(hinge) &&
      hinge.length === 3 &&
      hinge.every((value) => typeof value === 'number' && Number.isFinite(value)) &&
      typeof data.swing === 'number' &&
      Number.isFinite(data.swing)
    ) {
      return { hinge: new Vector3(hinge[0], hinge[1], hinge[2]), deg: data.swing };
    }
  }
  return null;
}

/** The scale a model is drawn at to stand as large as it may inside its box, keeping its shape. */
function uniformScale(model: TableWorldModel, loaded: Pick<LoadedModel, 'size'>): Matrix4 {
  const across = Math.max(loaded.size.x, loaded.size.z, 1e-6);
  const tall = Math.max(loaded.size.y, 1e-6);
  const fitted = Math.min(
    Math.max(1, model.footprintPx) / across,
    model.heightPx > 0 ? model.heightPx / tall : Infinity
  );
  const scale = fitted * model.model.scale;
  return new Matrix4().makeScale(scale, scale, scale);
}
