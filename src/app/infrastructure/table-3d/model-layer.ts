import { isAppModel } from '@axe/core/storage/bundled-models';
import { partFacesOf } from '@axe/domain/character/part-look';
import { Terrain } from '@axe/domain/tabletop/terrain';
import type { WaterCurrent } from '@axe/domain/tabletop/water/water-current';
import type { WaterSpout } from '@axe/domain/tabletop/water/water-falls';
import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import type { WallJoinCell } from '@axe/domain/tabletop/world/wall-joins';
import { UnusedSince } from '@axe/infrastructure/table-3d/unused-since';
import { disposeObject, forgetDrawn } from '@axe/infrastructure/three-kit/dispose';
import { HeldModelReader } from '@axe/infrastructure/three-kit/held-model-reader';
import { cutGeometry, meshesOf, releaseCutShapes } from '@axe/infrastructure/three-kit/model-faces';
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
  /**
   * The mouths water pours from, measured from the model's foot, each node of the model saying where
   * its own is in its extras as `{ "spout": [x, y, z] }`: the mouth of a drain in a wall, facing the
   * way the model's south does.
   */
  readonly spouts?: readonly Vector3[];
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
  /**
   * For a part that turns for as long as it is drawn, as the sails of a windmill do: the point its axis
   * runs through and the axis, measured from the model's foot as the rest is, how many degrees a
   * second it turns about it, and how far it and every part turning with it reach out from the axis,
   * measured the same way.
   */
  readonly spin?: {
    readonly at: Vector3;
    readonly axis: Vector3;
    readonly degPerSecond: number;
    readonly reach: number;
  };
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
  readonly parts?: readonly Pick<ModelPart, 'within' | 'swing' | 'spin' | 'role' | 'hub'>[];
};

/**
 * Every copy of a model that plays no motion, drawn together: one instanced mesh for each of its meshes,
 * each as large as the copies of that mesh it may draw, which for a building's parts is many to a copy.
 */
interface Herd {
  readonly parts: readonly InstancedMesh[];
  readonly capacities: readonly number[];
  copies: number;
  /**
   * The copies of its parts that turn, each with which of its part's copies it is, kept to turn them
   * as time goes without working out again where their models stand; left out where none turns.
   */
  turning?: readonly { readonly index: number; readonly spin: SpinPlacement }[];
}

interface StoodModel {
  readonly owner: string;
  readonly url: string;
  /** The faces the copy leaves out, as written on what it was laid for. */
  readonly cut: string;
  readonly root: Group;
  readonly mixer: AnimationMixer;
  idle: AnimationAction | null;
  walk: AnimationAction | null;
  /** The names of the motions the piece asked for when they were chosen, empty for the model's own. */
  idleName: string;
  walkName: string;
  walking: boolean;
}

/** How many radians a degree is. */
const RADIANS = Math.PI / 180;

/** How wide the water pouring from a spout is, in the units its model was made in. */
const SPOUT_WIDTH = 0.24;

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
 * standing still is not drawn again. A part its model says turns, as the sails of a windmill do, is
 * turned to where it stands at each moment drawn, where the copies of the model are drawn together
 * and things may move; it throws no shadow, as the shadows are not drawn again as it turns. Nothing a model names outside its own bytes is ever fetched,
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
  /** Where the bytes of each model read or being read are, by the key it is kept by (see `modelReadKeyOf`). */
  private readonly readUrls = new Map<string, string>();
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
  /** The spouts last told of, as one text, so that the same spouts are not told of twice. */
  private toldSpouts = '[]';
  /** Whether the parts made to turn do turn: not for a reader who asks for less motion, for whom they stand as they were made. */
  private turns = false;
  /** The moment the turning parts were last turned to, in milliseconds, which a herd laid again is turned to as well. */
  private turnedToMs = 0;
  private readonly turnedPlace = new Matrix4();
  /** Whether the layer has been let go of, after which a model still being read is let go of as it comes. */
  private disposed = false;

  constructor(
    private readonly dress: (material: Material, moonlit: boolean) => void,
    private readonly arrived: () => void,
    private readonly renderer: () => WebGPURenderer,
    private readonly spoutsMoved: (spouts: readonly WaterSpout[]) => void = () => undefined
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

  /** Whether any model is still being read. */
  get isLoading(): boolean {
    return this.loading.size > 0;
  }

  /** The pieces and blocks drawn as models now, which a frame of their shadows follows. */
  set(models: readonly TableWorldModel[]): void {
    if (models === this.laid) return;
    this.laid = models;
    this.lay();
  }

  /** The name of the motion the model of a piece plays now, or null where it plays none or stands in no copy of its own. */
  motionOf(owner: string): string | null {
    const stood = this.stood.get(owner);
    if (!stood) return null;
    const action = stood.walking ? (stood.walk ?? stood.idle) : stood.idle;
    return action?.getClip().name ?? null;
  }

  /**
   * Moves the walks on to a moment, in milliseconds, and turns the parts made to turn to where they
   * stand at it; answers whether any model is walking, or `'slowly'` where parts only turn, which a
   * frame every so often draws well enough.
   */
  advance(timeMs: number): boolean | 'slowly' {
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
    const turning = this.turns && this.turnHerdsTo(timeMs);
    if (walking) return true;
    return turning ? 'slowly' : false;
  }

  /**
   * Lets the parts made to turn turn, or stands them as they were made, as for a reader who asks for
   * less motion.
   */
  setTurning(turns: boolean): void {
    if (turns === this.turns) return;
    this.turns = turns;
    this.turnHerdsTo(turns ? this.turnedToMs : 0);
    if (!turns) this.turnedToMs = 0;
  }

  /** Turns every part made to turn to where it stands at a moment; answers whether there is any. */
  private turnHerdsTo(timeMs: number): boolean {
    // A herd is laid where its parts stand at the moment last turned to, so one moment is turned to once.
    const moved = timeMs !== this.turnedToMs;
    this.turnedToMs = timeMs;
    let any = false;
    for (const herd of this.herds.values()) {
      if (!herd.turning) continue;
      any = true;
      // Nothing has turned since they were last placed: the moment stands, and so do the herds.
      if (!moved) continue;
      const turned = new Set<InstancedMesh>();
      for (const { index, spin } of herd.turning) {
        const part = herd.parts[spin.part];
        part.setMatrixAt(index, spinPlacedAt(spin, timeMs, this.turnedPlace));
        turned.add(part);
      }
      for (const part of turned) {
        part.instanceMatrix.needsUpdate = true;
        part.computeBoundingSphere();
      }
    }
    if (any && moved) this.changed = true;
    return any;
  }

  /** Whether anything was read, stood or moved since this was last asked, which wants drawing. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  /** Lets go of every model stood or herded, of the models read, and of the reader; nothing is drawn after. */
  dispose(): void {
    this.disposed = true;
    for (const stood of this.stood.values()) {
      this.group.remove(stood.root);
      forgetDrawn(stood.root);
      releaseCutShapes(stood.root);
    }
    this.stood.clear();
    for (const herd of this.herds.values()) this.unherd(herd);
    this.herds.clear();
    for (const loaded of this.loaded.values()) if (loaded) disposeObject(loaded.gltf.scene);
    this.loaded.clear();
    this.readUrls.clear();
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
      const one = wanted.get(owner);
      if (
        one &&
        one.url === stood.url &&
        (one.cutFaces ?? '') === stood.cut &&
        (one.ownCopy || this.loaded.get(modelReadKeyOf(one))?.animated)
      ) {
        continue;
      }
      this.group.remove(stood.root);
      forgetDrawn(stood.root);
      releaseCutShapes(stood.root);
      stood.mixer.stopAllAction();
      this.stood.delete(owner);
    }
    const flocks = new Map<string, TableWorldModel[]>();
    for (const model of this.laid) {
      const key = modelReadKeyOf(model);
      let loaded = this.loaded.get(key);
      if (loaded === undefined) {
        this.read(key, model.url, isAppModel(model.model.identifier), moonlitFor(model));
        loaded = this.loaded.get(key);
      }
      if (!loaded) continue;
      if (loaded.animated || model.ownCopy) this.stand(model, loaded);
      else flocks.set(key, [...(flocks.get(key) ?? []), model]);
    }
    for (const [url, herd] of this.herds) {
      if (flocks.has(url)) continue;
      this.unherd(herd);
      this.herds.delete(url);
    }
    for (const [url, flock] of flocks) this.herd(url, this.loaded.get(url)!, flock);
    this.noteUnused();
    this.tellSpouts();
    this.changed = true;
  }

  /** Tells where the spouts of the models laid stand on the table, whenever they are not where they were last told. */
  private tellSpouts(): void {
    const spouts = this.laid.flatMap((model) => spoutsOf(model, this.loaded.get(modelReadKeyOf(model)) ?? null));
    const told = JSON.stringify(spouts);
    if (told === this.toldSpouts) return;
    this.toldSpouts = told;
    this.spoutsMoved(spouts);
  }

  /**
   * Notes when each model read stopped being laid, one that could not be read as well, and has those
   * that have gone unused long enough let go of then, to be read again should one be laid again. A
   * model laid again before that is kept as though it had never gone.
   */
  private noteUnused(): void {
    this.unused.note([...this.loaded.keys()], new Set(this.laid.map(modelReadKeyOf)), performance.now());
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
    for (const key of this.unused.takeDue(performance.now())) {
      const loaded = this.loaded.get(key);
      this.loaded.delete(key);
      if (loaded) this.letGoOf(key, loaded);
      this.readUrls.delete(key);
    }
    this.sweepLater();
  }

  /**
   * Lets go of a model read: its materials, and its meshes' shapes and pictures too unless another copy
   * read of the same bytes, which shares them, is still held (see {@link variantOf}).
   */
  private letGoOf(key: string, loaded: LoadedModel): void {
    if (this.twinOf(key, 'loaded')) disposeMaterialsOf(loaded.gltf.scene);
    else disposeObject(loaded.gltf.scene);
  }

  /** The key of another copy held, or being read, of the same bytes as the one kept by `key`. */
  private twinOf(key: string, held: 'loaded' | 'loading'): string | null {
    const url = this.readUrls.get(key);
    for (const [other, otherUrl] of this.readUrls) {
      if (other === key || otherUrl !== url) continue;
      if (held === 'loading' ? this.loading.has(other) : this.loaded.get(other)) return other;
    }
    return null;
  }

  /** Stands a model that plays a motion where its piece is, as a copy of its own. */
  private stand(model: TableWorldModel, loaded: LoadedModel): void {
    let stood = this.stood.get(model.owner);
    let rechosen = false;
    if (!stood) {
      stood = this.instanceOf(model, loaded);
      this.stood.set(model.owner, stood);
      this.group.add(stood.root);
    } else if (stood.idleName !== model.model.idle || stood.walkName !== model.model.walk) {
      chooseMotions(stood, model, loaded);
      rechosen = true;
    }
    const inner = stood.root.children[0];
    inner.position.set(-loaded.foot.x, -loaded.foot.y, -loaded.foot.z);
    placementOf(model, loaded).decompose(stood.root.position, stood.root.quaternion, stood.root.scale);
    stood.root.updateMatrixWorld(true);
    this.walk(stood, model.walking, rechosen);
  }

  /** Stands the copies of a model that plays no motion where their pieces are, its herd grown where it is too small. */
  private herd(url: string, loaded: LoadedModel, flock: readonly TableWorldModel[]): void {
    const placed = flock.map((model) => placedPartsOf(model, loaded, this.turns ? this.turnedToMs : 0));
    const placements = placed.map((copy) => copy.placements);
    const counts = loaded.parts.map((_, part) => placements.reduce((sum, each) => sum + each[part].length, 0));
    let herd = this.herds.get(url);
    if (!herd || counts.some((count, part) => herd!.capacities[part] < count)) {
      if (herd) this.unherd(herd);
      const capacities = counts.map((count) => Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, count)))));
      herd = {
        parts: loaded.parts.map(({ mesh, spin }, index) => {
          const part = new InstancedMesh(mesh.geometry, mesh.material, capacities[index]);
          part.castShadow = !spin;
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
    const turning: { index: number; spin: SpinPlacement }[] = [];
    const laid = loaded.parts.map(() => 0);
    for (const copy of placed) {
      for (const spin of copy.spins) turning.push({ index: laid[spin.part], spin });
      copy.placements.forEach((each, part) => (laid[part] += each.length));
    }
    herd.turning = turning.length > 0 ? turning : undefined;
    this.placeHerd(herd, placements);
  }

  /** Writes where the copies of a herd's parts are drawn. */
  private placeHerd(herd: Herd, placements: readonly Matrix4[][][]): void {
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

  /**
   * Plays a model's walk while its piece is moved, and holds it in the first pose of its idle
   * otherwise; a motion already playing is left alone unless its motions were chosen afresh.
   */
  private walk(stood: StoodModel, walking: boolean, rechosen = false): void {
    if (stood.walking === walking && !rechosen) return;
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
    root.userData['owner'] = model.owner;
    const cut = partFacesOf(model.cutFaces ?? '');
    meshesOf(inner).forEach((mesh, index) => {
      mesh.userData['partMesh'] = index;
      const triangles = cut.get(index);
      if (triangles) mesh.geometry = cutGeometry(mesh.geometry, triangles);
    });
    const stood: StoodModel = {
      owner: model.owner,
      url: model.url,
      cut: model.cutFaces ?? '',
      root,
      mixer: new AnimationMixer(inner),
      idle: null,
      walk: null,
      idleName: '',
      walkName: '',
      walking: false,
    };
    chooseMotions(stood, model, loaded);
    this.walk(stood, false, true);
    return stood;
  }

  /**
   * Reads a model from bytes held here, its materials made over for the scene, and asks for a frame
   * once it is read, kept by `key` (see `modelReadKeyOf`). The glow it was made with is kept only for one of
   * the app's own (`ownGlow`), and it is greyed by the world's moonlight only as a block (`moonlit`).
   * Bytes another copy is held of, for a piece where this is for a block or the other way round, are
   * not read again: the copy is made of the other (see {@link variantOf}), and one waits for the other
   * being read.
   */
  private read(key: string, url: string, ownGlow: boolean, moonlit: boolean): void {
    if (this.loading.has(key)) return;
    this.readUrls.set(key, url);
    const twin = this.twinOf(key, 'loaded');
    if (twin) {
      this.loaded.set(key, this.variantOf(this.loaded.get(twin)!, moonlit));
      return;
    }
    if (this.twinOf(key, 'loading')) return;
    this.loading.add(key);
    this.parse(url, ownGlow, moonlit).then(
      (loaded) => {
        if (this.disposed) {
          if (loaded) disposeObject(loaded.gltf.scene);
          return;
        }
        this.loaded.set(key, loaded);
        this.settle(key);
      },
      () => {
        if (this.disposed) return;
        this.loaded.set(key, null);
        this.settle(key);
      }
    );
  }

  /** A model read from bytes held here, or null for one that is not to be drawn. */
  private async parse(url: string, ownGlow: boolean, moonlit: boolean): Promise<LoadedModel | null> {
    const read = await this.reader.read(url);
    if (!read) return null;
    const gltf = { scene: read.scene, animations: read.animations };
    const drawn = new Set<Texture>();
    const undrawn = new Set<Texture>();
    gltf.scene.traverse((object) => this.makeOver(object, drawn, undrawn, ownGlow, moonlit));
    for (const picture of drawn) undrawn.delete(picture);
    releaseReadPictures(drawn, undrawn);
    for (const picture of undrawn) picture.dispose();
    return measured(gltf);
  }

  /**
   * A copy of a model read for a piece made of the one read for a block, or the other way round: its
   * meshes' shapes, its pictures and its motions shared with the other, its materials its own, covered
   * for the moonlight as this copy is drawn (`moonlit`), and its measure the other's (see
   * {@link measuredAs}).
   */
  private variantOf(other: LoadedModel, moonlit: boolean): LoadedModel {
    const scene = cloneSkinned(other.gltf.scene) as Group;
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const ownCopy = (material: Material) => {
        const copy = material.clone();
        this.dress(copy, moonlit);
        return copy;
      };
      object.material = Array.isArray(object.material) ? object.material.map(ownCopy) : ownCopy(object.material);
    });
    return measuredAs(other, scene);
  }

  private settle(key: string): void {
    this.loading.delete(key);
    this.lay();
    this.arrived();
  }

  /**
   * Makes a mesh's material over as the scene's own, as `sceneMaterialOf` makes it: lit as the board
   * is, veiled and darkened with it, throwing shadows.
   */
  private makeOver(
    object: Object3D,
    drawn: Set<Texture>,
    undrawn: Set<Texture>,
    ownGlow: boolean,
    moonlit: boolean
  ): void {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const madeOver = (material: Material) => {
      const lit = sceneMaterialOf(material, drawn, undrawn, ownGlow);
      this.dress(lit, moonlit);
      material.dispose();
      return lit;
    };
    object.material = Array.isArray(object.material) ? object.material.map(madeOver) : madeOver(object.material);
  }
}

/** Lets go of the materials of a model's meshes alone, leaving their shapes and pictures to a copy that shares them. */
function disposeMaterialsOf(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
}

/**
 * A copy of a model's scene, made by cloning it, measured as the model was when it was read: its size,
 * its foot and its parts the model's, each part the copy's own mesh at the same place in the walk of
 * the scene (see `meshesOf`). A model is measured once, as it stands when read, so a copy made as the
 * other stands posed by a motion stands as the other does. A copy whose meshes do not answer the
 * model's one for one is measured as it stands.
 */
function measuredAs(other: LoadedModel, scene: Group): LoadedModel {
  const copies = meshesOf(scene);
  const placeOf = new Map<Object3D, number>(meshesOf(other.gltf.scene).map((mesh, index) => [mesh, index]));
  const parts = other.parts.map((part) => ({ ...part, mesh: copies[placeOf.get(part.mesh) ?? -1] }));
  if (copies.length !== placeOf.size || !parts.every((part) => part.mesh instanceof Mesh)) {
    return measured({ scene, animations: other.gltf.animations });
  }
  return { ...other, gltf: { scene, animations: other.gltf.animations }, parts: parts as ModelPart[] };
}

/** A model read and made over for the scene as the layer keeps it: its size and foot as it stands, and its parts as made. */
function measured(gltf: Pick<GLTF, 'scene' | 'animations'>): LoadedModel {
  gltf.scene.updateMatrixWorld(true);
  const box = standingBoxOf(gltf.scene);
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
  const { parts, spouts } = modelPartsOf(gltf.scene, fromFoot, fit);
  const stretch = fit === 'stretch';
  return {
    gltf,
    size,
    foot,
    animated: gltf.animations.length > 0,
    parts,
    stretch,
    facade,
    tile,
    madeHeight,
    joined,
    ...(spouts.length ? { spouts } : {}),
  };
}

/**
 * Whether a model is drawn for a block of the world, which the moonlight greys at night, rather than for
 * a piece, whose colours the players tell pieces apart by and which keeps them.
 */
function moonlitFor(model: TableWorldModel): boolean {
  return model.kind === Terrain.aliasName;
}

/**
 * What a read model is kept by: where its bytes are, and for a piece apart from a block, since the two
 * are made over differently for the moonlight (see `moonlitFor`) and one model may be drawn as both.
 */
export function modelReadKeyOf(model: TableWorldModel): string {
  return moonlitFor(model) ? model.url : `${model.url}${PIECE_READ}`;
}

/** What is added to the key a model drawn for a piece is kept by. */
const PIECE_READ = '#piece';

/**
 * A material of a model made over as the scene's own, lit as the board is: its colour, its picture
 * and how it lets light through kept. The glow it gives off, a neon tube's or a potion's, is kept as
 * strong as it was made, with the picture of that glow, for one of the app's own models (`ownGlow`),
 * made to glow on purpose; one brought in is drawn without, as it always was, since its glow may be
 * no more than a way to look unlit, which would stand out of the dark of a table. The pictures it is
 * drawn with are noted as drawn, and the rest it wore, as its bumps and its shine, as not drawn.
 */
export function sceneMaterialOf(
  material: Material,
  drawn: Set<Texture>,
  undrawn: Set<Texture>,
  ownGlow = false
): MeshLambertNodeMaterial {
  const was = material as MeshStandardMaterial;
  const glows = ownGlow && was.emissive !== undefined && was.emissive.getHex() !== 0;
  const glowMap = glows ? (was.emissiveMap ?? null) : null;
  for (const picture of picturesOf(material)) {
    (picture === was.map || picture === glowMap ? drawn : undrawn).add(picture);
  }
  return new MeshLambertNodeMaterial({
    color: was.color,
    map: was.map ?? null,
    transparent: was.transparent,
    opacity: was.opacity,
    alphaTest: was.alphaTest,
    side: was.side,
    vertexColors: was.vertexColors,
    ...(glows ? { emissive: was.emissive, emissiveMap: glowMap, emissiveIntensity: was.emissiveIntensity ?? 1 } : {}),
  });
}

/**
 * Chooses the motions a copy of a model plays standing and walking, by the names its piece asks for
 * or, where it names none or one the model lacks, by the model's own idle and walk; the idle falls
 * back to its first motion. Chosen again whenever the piece names others, so a name changed once the
 * piece is on the table takes at once.
 */
function chooseMotions(stood: StoodModel, model: TableWorldModel, loaded: LoadedModel): void {
  const clip = (name: string, pattern: RegExp) =>
    (name ? AnimationClip.findByName(loaded.gltf.animations, name) : null) ??
    loaded.gltf.animations.find((candidate) => pattern.test(candidate.name)) ??
    null;
  const idleClip = clip(model.model.idle, /idle|stand|wait/i) ?? loaded.gltf.animations[0] ?? null;
  const walkClip = clip(model.model.walk, /walk|run|move/i);
  stood.mixer.stopAllAction();
  stood.idle = idleClip ? stood.mixer.clipAction(idleClip) : null;
  stood.walk = walkClip ? stood.mixer.clipAction(walkClip) : null;
  stood.idleName = model.model.idle;
  stood.walkName = model.model.walk;
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
 * Where each mesh of a model is drawn for a piece or block at a moment: placed with the model, a leaf
 * that swings on a hinge of its own swung open about it while its door stands open, and a part made
 * to turn turned as far as it has by then.
 */
export function partPlacementsOf(model: TableWorldModel, loaded: ModelMeasure, timeMs = 0): Matrix4[][] {
  return placedPartsOf(model, loaded, timeMs).placements;
}

/**
 * Where each mesh of a model is drawn for a piece or block at a moment, with what of the place of
 * each part that turns stays while it turns: worked out once for the copy, the frame it stands in
 * and its scaling with it, for whoever lays the copy and has its parts turn after. A part that turns
 * is drawn from what is handed back of it, so a copy turned as time goes stands where placing it
 * afresh at that moment would stand it. None turns in a model laid out of a kit, whose parts are
 * placed by the block, or while it swings open as a leaf.
 */
export function placedPartsOf(
  model: TableWorldModel,
  loaded: ModelMeasure,
  timeMs = 0
): { readonly placements: Matrix4[][]; readonly spins: SpinPlacement[] } {
  if (!placedPartByPart(model, loaded)) {
    const kit = loaded.facade ? facadePlacementsOf : loaded.tile ? tilePlacementsOf : joinedPlacementsOf;
    return { placements: kit(model, loaded), spins: [] };
  }
  const { frame, scaling } = placementPartsOf(model, loaded);
  const placement = frame.clone().multiply(scaling);
  const spins: SpinPlacement[] = [];
  const placements = (loaded.parts ?? []).map((part, index) => {
    if (swingsOpen(model, part)) {
      return [frame.clone().multiply(swungAbout(scaling, part.swing!)).multiply(scaling).multiply(part.within)];
    }
    if (!part.spin) return [placement.clone().multiply(part.within)];
    const spin = spinPlacementOf(frame, scaling, part.within, part.spin, index, model.current);
    spins.push(spin);
    return [spinPlacedAt(spin, timeMs)];
  });
  return { placements, spins };
}

/**
 * A part made to turn, as one copy of its model draws it: what stays as it is while it turns, on
 * either side of the turn, so that where it is drawn at a moment is worked out from the moment alone.
 */
export interface SpinPlacement {
  /** Which of its model's parts it is. */
  readonly part: number;
  readonly before: Matrix4;
  readonly axis: Vector3;
  readonly degPerSecond: number;
  readonly after: Matrix4;
}

const TURN = new Matrix4();

/**
 * Where a part made to turn is drawn at a moment, in milliseconds: so many degrees a second from how
 * it was made, about its axis, worked out from the moment alone, so that it stands the same whenever
 * that moment is drawn. Written into the matrix given, where one is.
 */
export function spinPlacedAt(spin: SpinPlacement, timeMs: number, into = new Matrix4()): Matrix4 {
  const turn = (((spin.degPerSecond * timeMs) / 1000) % 360) * RADIANS;
  return into.copy(spin.before).multiply(TURN.makeRotationAxis(spin.axis, turn)).multiply(spin.after);
}

/** Whether a model is drawn one mesh to a part where it stands, rather than laid out of a kit over its block. */
function placedPartByPart(model: TableWorldModel, loaded: ModelMeasure): boolean {
  return !((loaded.facade || loaded.tile || loaded.joined) && model.boxPx);
}

function swingsOpen(model: TableWorldModel, part: Pick<ModelPart, 'swing'>): boolean {
  return model.door?.open === true && part.swing !== undefined;
}

/**
 * The turn of a part about the point its axis runs through where the scaling puts it, so that it
 * turns unstretched, the way `senseInCurrent` says the water flowing under its model turns it.
 */
function spinPlacementOf(
  frame: Matrix4,
  scaling: Matrix4,
  within: Matrix4,
  spin: NonNullable<ModelPart['spin']>,
  part: number,
  current: WaterCurrent | undefined
): SpinPlacement {
  const at = spin.at.clone().applyMatrix4(scaling);
  const sense = current
    ? senseInCurrent(
        current,
        at.clone().applyMatrix4(frame),
        spin.axis.clone().transformDirection(frame),
        spin.reach * new Vector3().setFromMatrixColumn(scaling, 1).length(),
        spin.degPerSecond
      )
    : 1;
  return {
    part,
    before: frame.clone().multiply(new Matrix4().makeTranslation(at.x, at.y, at.z)),
    axis: spin.axis,
    degPerSecond: spin.degPerSecond * sense,
    after: new Matrix4().makeTranslation(-at.x, -at.y, -at.z).multiply(scaling).multiply(within),
  };
}

/** How squarely the water has to run across the way a part turns, from 0 to 1, to turn it one way rather than the other. */
const LEAST_DRIVE = 0.05;

/**
 * Which way a part made to turn turns in the water flowing under its model: 1 the way it was made,
 * -1 the other way round, so that where it dips into the water its lowest point runs the way the
 * water runs, as a watermill's wheel does on whichever bank it stands. A part whose lowest point
 * stays over the surface, that turns about an upright, or about an axis the water runs along, turns
 * as it was made. The point its axis runs through and the axis are as placed on the table (x east, y
 * up and z south, in table pixels), with how far the part reaches out from the axis. Its lowest
 * point runs along the axis crossed with the way down as it turns the way the axis points, which
 * across the table is the axis's own z and minus its x, over how level it lies.
 */
export function senseInCurrent(
  current: WaterCurrent,
  at: Vector3,
  axis: Vector3,
  reach: number,
  degPerSecond: number
): 1 | -1 {
  const level = Math.sqrt(Math.max(0, 1 - axis.y * axis.y));
  if (level < LEAST_DRIVE || at.y - reach * level >= current.surfacePx) return 1;
  const along = (axis.z * current.towardX - axis.x * current.towardY) / level;
  return Math.sign(degPerSecond) * along < -LEAST_DRIVE ? -1 : 1;
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

/**
 * The box a model stands in, which it is fitted to its piece or block by: round all of it that does
 * not turn. A part made to turn, as the sails of a windmill are, sweeps past the body it turns on, so
 * it may reach out of the box, and below the model's foot as a mill wheel dips into its stream. A
 * model all of which turns stands in the box round all of it.
 */
export function standingBoxOf(scene: Object3D): Box3 {
  const box = new Box3();
  scene.updateWorldMatrix(true, true);
  scene.traverse((object) => {
    if (!(object instanceof Mesh) || spinOf(object)) return;
    // By the mesh's own shape alone, as its kind keeps it (a mesh on a skeleton keeps the box of its
    // pose): a part that turns may hang from one that does not, and is not to be counted with it.
    const posed = object as Mesh & { boundingBox?: Box3 | null; computeBoundingBox?: () => void };
    if (posed.boundingBox !== undefined) {
      if (posed.boundingBox === null) posed.computeBoundingBox?.();
      if (posed.boundingBox) box.union(posed.boundingBox.clone().applyMatrix4(object.matrixWorld));
      return;
    }
    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) box.union(geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return box.isEmpty() ? new Box3().setFromObject(scene) : box;
}

/**
 * How a mesh is made to turn, as its node, or one it hangs from, says in its extras: `spin` naming the
 * axis and how many degrees a second, `[x, y, z, degrees]`, and `spinAt` the point the axis runs
 * through, the node's own origin where it names none, both as the node was made. The node that says
 * so is answered with them. Null where none says, or where what is said names no axis or no turning.
 */
export function spinOf(object: Object3D): { node: Object3D; at: Vector3; axis: Vector3; degPerSecond: number } | null {
  for (let node: Object3D | null = object; node; node = node.parent) {
    const data = node.userData as { spin?: unknown; spinAt?: unknown };
    if (!Array.isArray(data.spin)) continue;
    const spin = data.spin as unknown[];
    if (spin.length !== 4 || !spin.every((value) => Number.isFinite(value))) return null;
    const [x, y, z, degPerSecond] = spin as number[];
    const axis = new Vector3(x, y, z);
    if (axis.lengthSq() <= 0 || degPerSecond === 0) return null;
    const point = data.spinAt;
    const named = Array.isArray(point) && point.length === 3 && point.every((value) => Number.isFinite(value));
    const at = named ? new Vector3(...(point as [number, number, number])) : new Vector3();
    return { node, at, axis: axis.normalize(), degPerSecond };
  }
  return null;
}

/**
 * The meshes of a model's scene, its matrices worked out, as its parts, and the mouths its nodes say
 * water pours from, both measured from its foot. The parts of a building's kit, as `fit` names one,
 * are placed as they were made, by the block, and pour nothing; the parts of any other model are
 * placed from its foot, with the hinges they swing on and the axes they turn about.
 */
export function modelPartsOf(
  scene: Object3D,
  fromFoot: Matrix4,
  fit: unknown
): { readonly parts: ModelPart[]; readonly spouts: Vector3[] } {
  const facade = fit === 'facade';
  const joined = fit === 'joined';
  const kit = facade || joined || fit === 'tile';
  const parts: ModelPart[] = [];
  const spouts: Vector3[] = [];
  const turningWith = new Map<number, Object3D>();
  scene.traverse((object) => {
    const spout = kit ? null : spoutOf(object);
    if (spout) spouts.push(spout.applyMatrix4(object.matrixWorld).applyMatrix4(fromFoot));
    if (!(object instanceof Mesh)) return;
    if (kit) {
      parts.push({
        mesh: object,
        within: object.matrixWorld.clone(),
        ...(facade ? { role: kitRoleOf(object) } : {}),
        ...(joined && isHub(object) ? { hub: true } : {}),
      });
      return;
    }
    const swing = swingOf(object);
    const spin = spinOf(object);
    const within = fromFoot.clone().multiply(object.matrixWorld);
    if (spin) turningWith.set(parts.length, spin.node);
    parts.push({
      mesh: object,
      within,
      ...(swing ? { swing: { hinge: swing.hinge.applyMatrix4(fromFoot), deg: swing.deg } } : {}),
      ...(spin ? { spin: turnOf(object, within, spin, fromFoot) } : {}),
    });
  });
  reachTogether(parts, turningWith);
  return { parts, spouts };
}

/**
 * How a mesh of a model turns, measured from the model's foot: about the point and the axis its node
 * says, as far as the mesh reaches out from the axis. Where other meshes hang from the same node,
 * `reachTogether` makes the reach theirs too.
 */
function turnOf(
  mesh: Mesh,
  within: Matrix4,
  spin: NonNullable<ReturnType<typeof spinOf>>,
  fromFoot: Matrix4
): NonNullable<ModelPart['spin']> {
  const at = spin.at.applyMatrix4(spin.node.matrixWorld).applyMatrix4(fromFoot);
  const axis = spin.axis.transformDirection(spin.node.matrixWorld);
  return { at, axis, degPerSecond: spin.degPerSecond, reach: reachFromAxis(mesh, within, at, axis) };
}

/** How far the farthest point of a mesh, placed within its model, lies from an axis through a point. */
function reachFromAxis(mesh: Mesh, within: Matrix4, at: Vector3, axis: Vector3): number {
  const points = mesh.geometry.getAttribute('position');
  if (!points) return 0;
  const point = new Vector3();
  let reach = 0;
  for (let index = 0; index < points.count; index++) {
    point.fromBufferAttribute(points, index).applyMatrix4(within).sub(at);
    reach = Math.max(reach, point.addScaledVector(axis, -point.dot(axis)).length());
  }
  return reach;
}

/**
 * Gives every part turning with others, hung from the same node, the reach of the farthest of them,
 * so that the parts of a wheel are all turned the same way by the water it dips into.
 */
function reachTogether(parts: ModelPart[], turningWith: ReadonlyMap<number, Object3D>): void {
  const reaches = new Map<Object3D, number>();
  for (const [index, node] of turningWith) {
    reaches.set(node, Math.max(reaches.get(node) ?? 0, parts[index].spin?.reach ?? 0));
  }
  for (const [index, node] of turningWith) {
    const part = parts[index];
    if (part.spin) parts[index] = { ...part, spin: { ...part.spin, reach: reaches.get(node) ?? 0 } };
  }
}

/** The mouth a node of a model says water pours from, where it was made, or null for a node that says none. */
function spoutOf(object: Object3D): Vector3 | null {
  const spout = (object.userData as { spout?: unknown }).spout;
  if (!Array.isArray(spout) || spout.length !== 3 || !spout.every((value) => Number.isFinite(value))) return null;
  return new Vector3(spout[0] as number, spout[1] as number, spout[2] as number);
}

/**
 * Where the spouts of a model stand once it is placed for its piece or block, in table pixels: each
 * mouth, how high it is, the way it faces across the floor and how wide its water pours. A model not
 * read yet, or with no spout, has none.
 */
export function spoutsOf(
  model: TableWorldModel,
  loaded: (ModelMeasure & Pick<LoadedModel, 'spouts'>) | null
): WaterSpout[] {
  if (!loaded?.spouts?.length) return [];
  const placement = placementOf(model, loaded);
  const facing = new Vector3(0, 0, 1).transformDirection(placement);
  const across = Math.hypot(facing.x, facing.z) || 1;
  const widthPx = SPOUT_WIDTH * placement.getMaxScaleOnAxis();
  const rounded = (value: number) => Math.round(value * 100) / 100;
  return loaded.spouts.map((spout, index) => {
    const mouth = spout.clone().applyMatrix4(placement);
    return {
      key: `${model.owner}:${index}`,
      x: rounded(mouth.x),
      y: rounded(mouth.z),
      mouthPx: rounded(mouth.y),
      outX: rounded(facing.x / across),
      outY: rounded(facing.z / across),
      widthPx: rounded(widthPx),
    };
  });
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
