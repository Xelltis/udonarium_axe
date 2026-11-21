import { isAppModel } from '@axe/core/storage/bundled-models';
import { partFacesOf } from '@axe/domain/character/part-look';
import { materialLookIn, MODEL_AS_MADE, type ModelLook, writeModelLook } from '@axe/domain/tabletop/model-look';
import { actHolds } from '@axe/domain/tabletop/model-motions';
import { Terrain } from '@axe/domain/tabletop/terrain';
import type { WaterCurrent } from '@axe/domain/tabletop/water/water-current';
import type { WaterSpout } from '@axe/domain/tabletop/water/water-falls';
import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import type { WallJoinCell } from '@axe/domain/tabletop/world/wall-joins';
import { type ActorPace, ModelActor, posedPlacement } from '@axe/infrastructure/table-3d/model-actor';
import {
  drawnPicturesOf,
  type MadeMaterial,
  madeMaterialOf,
  type ModelDetail,
  type ModelSceneMaterial,
  sceneMaterialFor,
} from '@axe/infrastructure/table-3d/model-materials';
import { UnusedSince } from '@axe/infrastructure/table-3d/unused-since';
import { disposeObject, forgetDrawn } from '@axe/infrastructure/three-kit/dispose';
import { HeldModelReader } from '@axe/infrastructure/three-kit/held-model-reader';
import { cutGeometry, meshesOf, releaseCutShapes } from '@axe/infrastructure/three-kit/model-faces';
import { releaseReadPictures } from '@axe/infrastructure/three-kit/read-pictures';
import type { VrmRig } from '@axe/infrastructure/three-kit/vrm-rig';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  Box3,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
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
  /** Whether any of its meshes can be blended towards shapes, each copy as far as its own piece has it. */
  readonly shaped?: boolean;
  /**
   * What the materials of its meshes were made of, by the meshes' order in the model (see `meshesOf`):
   * what a copy drawn another way has its own materials made from. Shared by every copy read of the
   * same bytes, with the pictures they name.
   */
  readonly made: readonly MadeOfMesh[];
  /** Whether it keeps the glow it was made with, as only one of the app's own models does. */
  readonly ownGlow: boolean;
  /** For a VRM, the shapes it names and the parts of it that swing, made again for each copy. */
  readonly rig?: VrmRig;
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

/** What the material of a mesh was made of, or of each of its materials where it wears several. */
type MadeOfMesh = MadeMaterial | readonly MadeMaterial[];

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
  /** What the model read it is a copy of is kept by (see `modelReadKeyOf`). */
  readonly key: string;
  /** The faces the copy leaves out, as written on what it was laid for. */
  readonly cut: string;
  readonly root: Group;
  /** What plays its motions, moves its face, and says where a hand moves the whole of it. */
  readonly actor: ModelActor;
  /** Where it is placed for its piece, before a hand moves it. */
  readonly placed: Matrix4;
  /** Its piece's foot in the scene, which a hand moves it about. */
  readonly foot: Vector3;
  /** The way across the floor to the other in its act, or the way it faces, of unit length in the scene. */
  readonly toward: Vector3;
  /** How wide its piece is, in table pixels, which a hand moves it by. */
  widthPx: number;
  /** How fast it wanted drawing when it was last moved on. */
  pace: ActorPace;
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
 * materials made over to be lit and veiled as the rest of the scene is, as its piece has them drawn
 * (see `sceneMaterialFor`), stood with its foot at the
 * piece's, fitted inside the piece's box, and turned as the piece is. A piece's model walks while its
 * piece is moved, acts what its piece is asked to act, and otherwise stands in its idle, blinking and
 * breathing with the shapes it has (see `ModelActor`); one with no motion of its own for any of these
 * is moved whole, as a figure in the hand, and is drawn with the copies of its model while it only
 * stands. A standing motion is drawn a frame now and then, and held in its first pose where standing
 * motions are not played, so that table is not drawn again while nothing else moves. A part its model says turns, as the sails of a windmill do, is
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
  /** The moment the models were last moved on to, in milliseconds; none before the first. */
  private movedToMs: number | null = null;
  /** Whether a model standing still plays the motion it stands in and moves its face. */
  private standing = true;
  /** The acts played through by a hand moving a copy alone, by piece, after which the copy is drawn with the others again. */
  private readonly actsOver = new Map<string, string>();
  private readonly posedPlace = new Matrix4();
  /** The spouts last told of, as one text, so that the same spouts are not told of twice. */
  private toldSpouts = '[]';
  /**
   * Whether anything of a model moves of itself, the parts made to turn and the motions of the pieces'
   * models: not for a reader who asks for less motion, for whom each stands as it was made, or as its
   * act leaves it.
   */
  private turns = false;
  /** The moment the turning parts were last turned to, in milliseconds, which a herd laid again is turned to as well. */
  private turnedToMs = 0;
  private readonly turnedPlace = new Matrix4();
  /** Whether the layer has been let go of, after which a model still being read is let go of as it comes. */
  private disposed = false;
  /** How much of what the models' materials were made of is drawn. */
  private detail: ModelDetail = 'full';
  /** Which reading of the models this is: one more each time all read are let go of, so one read for an earlier is told. */
  private reading = 0;

  constructor(
    private readonly dress: (material: ModelSceneMaterial, moonlit: boolean) => void,
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

  /** Whether the model laid for a piece or block has been read, and so is drawn. */
  draws(owner: string): boolean {
    const model = this.laid.find((one) => one.owner === owner);
    return model !== undefined && !!this.loaded.get(modelReadKeyOf(model));
  }

  /** Whether any model is still being read. */
  get isLoading(): boolean {
    return this.loading.size > 0;
  }

  /**
   * Sets how much of what the models' materials were made of is drawn. Every model read is let go of
   * and read afresh where that changes, as the pictures a model is not drawn with are let go of once
   * it is read.
   */
  setDetail(detail: ModelDetail): void {
    if (detail === this.detail) return;
    this.detail = detail;
    this.letGoOfAll();
    this.lay();
  }

  /** The pieces and blocks drawn as models now, which a frame of their shadows follows. */
  set(models: readonly TableWorldModel[]): void {
    if (models === this.laid) return;
    this.laid = models;
    this.lay();
  }

  /** The name of the motion the model of a piece plays now, or null where it plays none or stands in no copy of its own. */
  motionOf(owner: string): string | null {
    return this.stood.get(owner)?.actor.motion ?? null;
  }

  /**
   * Moves the models on to a moment, in milliseconds: their motions, their faces and what a hand
   * moves of them, and the parts made to turn to where they stand at it. Answers whether any model
   * is walking or acting, or `'slowly'` where models only stand in their motions or parts only turn,
   * which a frame every so often draws well enough.
   */
  advance(timeMs: number): boolean | 'slowly' {
    this.movedToMs = timeMs;
    const moment = this.moment();
    let fastest: ActorPace = 'still';
    let through = false;
    for (const stood of this.stood.values()) {
      const before = stood.pace;
      const posed = stood.actor.pose;
      stood.pace = stood.actor.advance(moment);
      if (stood.actor.pose !== posed) this.place(stood);
      if (stood.pace !== 'still' || before !== 'still') this.changed = true;
      if (stood.pace === 'fast' || (stood.pace === 'slow' && fastest === 'still')) fastest = stood.pace;
      const over = stood.actor.finishedAct;
      if (over && this.actsOver.get(stood.owner) !== over.key) {
        this.actsOver.set(stood.owner, over.key);
        through = true;
      }
    }
    if (through) this.lay();
    const turning = this.turns && this.turnHerdsTo(timeMs);
    if (fastest === 'fast') return true;
    return fastest === 'slow' || turning ? 'slowly' : false;
  }

  /** Sets whether a model standing still plays the motion it stands in and moves its face, or holds its first pose. */
  setStanding(standing: boolean): void {
    if (standing === this.standing) return;
    this.standing = standing;
    this.settleStood();
  }

  /**
   * Lets the models move of themselves, the parts made to turn and the motions of the pieces' models,
   * or stands them as they were made, as for a reader who asks for less motion.
   */
  setTurning(turns: boolean): void {
    if (turns === this.turns) return;
    this.turns = turns;
    this.turnHerdsTo(turns ? this.turnedToMs : 0);
    if (!turns) this.turnedToMs = 0;
    this.lay();
  }

  /** What the models are asked to do at the moment they were last moved on to, or now where they never were. */
  private moment(): { timeMs: number; moving: boolean; standing: boolean } {
    return { timeMs: this.movedToMs ?? performance.now(), moving: this.turns, standing: this.standing };
  }

  /** Moves every model stood on to the moment again, as what it is asked to do there has changed. */
  private settleStood(): void {
    const moment = this.moment();
    for (const stood of this.stood.values()) {
      stood.pace = stood.actor.advance(moment);
      this.place(stood);
    }
    this.changed = true;
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
    this.letGoOfAll();
    this.reader.dispose();
  }

  /** Takes every model stood or herded out of the scene, and lets go of every model read. */
  private letGoOfAll(): void {
    for (const stood of this.stood.values()) {
      this.group.remove(stood.root);
      forgetDrawn(stood.root);
      releaseCutShapes(stood.root);
      stood.actor.dispose();
    }
    this.stood.clear();
    for (const herd of this.herds.values()) this.unherd(herd);
    this.herds.clear();
    for (const loaded of this.loaded.values()) if (loaded) letGoOfWhole(loaded);
    this.loaded.clear();
    this.readUrls.clear();
    this.loading.clear();
    this.reading++;
    this.unused.clear();
    if (this.sweepTimer !== null) clearTimeout(this.sweepTimer);
    this.sweepTimer = null;
  }

  /**
   * Stands every model laid where its piece is, reading first any not read yet: a model that moves
   * as a copy of its own (see {@link standsApart}), and the copies of one that does not together in
   * its herd.
   */
  private lay(): void {
    const wanted = new Map(this.laid.map((model) => [model.owner, model]));
    for (const owner of this.actsOver.keys())
      if (wanted.get(owner)?.act?.key !== this.actsOver.get(owner)) this.actsOver.delete(owner);
    for (const [owner, stood] of this.stood) {
      const one = wanted.get(owner);
      const loaded = this.loaded.get(stood.key);
      if (
        one &&
        loaded &&
        modelReadKeyOf(one) === stood.key &&
        (one.cutFaces ?? '') === stood.cut &&
        this.standsApart(one, loaded)
      ) {
        continue;
      }
      this.group.remove(stood.root);
      forgetDrawn(stood.root);
      releaseCutShapes(stood.root);
      stood.actor.dispose();
      this.stood.delete(owner);
    }
    const flocks = new Map<string, TableWorldModel[]>();
    for (const model of this.laid) {
      const key = modelReadKeyOf(model);
      let loaded = this.loaded.get(key);
      if (loaded === undefined) {
        this.read(key, model.url, isAppModel(model.model.identifier), moonlitFor(model), model.model.look);
        loaded = this.loaded.get(key);
      }
      if (!loaded) continue;
      if (this.standsApart(model, loaded)) this.stand(model, loaded);
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

  /**
   * Whether a model is stood as a copy of its own rather than drawn with the other copies of it: one
   * that plays a motion or can be blended towards shapes, one a part of its piece is painted over,
   * one down, which stays as its going down left it, and one a hand is moving now, walking or
   * acting, until the act is through, whether or not it is still asked for.
   */
  private standsApart(model: TableWorldModel, loaded: LoadedModel): boolean {
    if (loaded.animated || loaded.shaped || model.ownCopy) return true;
    if (!model.model.motions.made) return false;
    if (model.act && actHolds(model.act)) return true;
    if (!this.turns) return false;
    if (model.walking || this.stood.get(model.owner)?.actor.acting) return true;
    return model.act !== undefined && this.actsOver.get(model.owner) !== model.act.key;
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
    else letGoOfWhole(loaded);
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

  /** Stands a model that moves where its piece is, as a copy of its own, doing what its piece asks of it. */
  private stand(model: TableWorldModel, loaded: LoadedModel): void {
    let stood = this.stood.get(model.owner);
    if (!stood) {
      stood = this.instanceOf(model, loaded);
      this.stood.set(model.owner, stood);
      this.group.add(stood.root);
    }
    const inner = stood.root.children[0];
    inner.position.set(-loaded.foot.x, -loaded.foot.y, -loaded.foot.z);
    stood.placed.copy(placementOf(model, loaded));
    stood.foot.set(model.foot.x, model.foot.z + model.altitudePx, model.foot.y);
    towardOf(model, stood.placed, stood.toward);
    stood.widthPx = Math.max(1, model.footprintPx);
    const moment = this.moment();
    stood.actor.cast(model.model);
    stood.actor.walk(model.walking, moment.timeMs);
    stood.actor.perform(model.act ?? null);
    stood.actor.speak(model.speaking === true);
    stood.pace = stood.actor.advance(moment);
    this.place(stood);
  }

  /** Puts a model stood where it is placed for its piece, moved from there as a hand moves it now. */
  private place(stood: StoodModel): void {
    stood.root.matrix.copy(
      posedPlacement(stood.placed, stood.foot, stood.toward, stood.actor.pose, stood.widthPx, this.posedPlace)
    );
    stood.root.updateMatrixWorld(true);
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
          part.visible = mesh.visible;
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

  private instanceOf(model: TableWorldModel, loaded: LoadedModel): StoodModel {
    const inner = cloneSkinned(loaded.gltf.scene) as Object3D;
    const root = new Group();
    root.matrixAutoUpdate = false;
    root.add(inner);
    root.userData['owner'] = model.owner;
    const cut = partFacesOf(model.cutFaces ?? '');
    meshesOf(inner).forEach((mesh, index) => {
      mesh.userData['partMesh'] = index;
      const triangles = cut.get(index);
      if (triangles) mesh.geometry = cutGeometry(mesh.geometry, triangles);
    });
    return {
      owner: model.owner,
      key: modelReadKeyOf(model),
      cut: model.cutFaces ?? '',
      root,
      actor: new ModelActor(inner, loaded.gltf.animations, model.owner, loaded.rig ?? null),
      placed: new Matrix4(),
      foot: new Vector3(),
      toward: new Vector3(0, 0, 1),
      widthPx: 1,
      pace: 'still',
    };
  }

  /**
   * Reads a model from bytes held here, its materials made over for the scene as its piece has them
   * drawn (`look`), and asks for a frame once it is read, kept by `key` (see `modelReadKeyOf`). The
   * glow it was made with is kept only for one of the app's own (`ownGlow`), and it is greyed by the
   * world's moonlight only as a block (`moonlit`). Bytes another copy is held of, for a piece where
   * this is for a block or drawn another way, are not read again: the copy is made of the other (see
   * {@link variantOf}), and one waits for the other being read. A model that comes after all read were
   * let go of is let go of as it comes.
   */
  private read(key: string, url: string, ownGlow: boolean, moonlit: boolean, look: ModelLook): void {
    if (this.loading.has(key)) return;
    this.readUrls.set(key, url);
    const twin = this.twinOf(key, 'loaded');
    if (twin) {
      this.loaded.set(key, this.variantOf(this.loaded.get(twin)!, moonlit, look));
      return;
    }
    if (this.twinOf(key, 'loading')) return;
    this.loading.add(key);
    const reading = this.reading;
    const stale = () => this.disposed || reading !== this.reading;
    this.parse(url, ownGlow, moonlit, look, this.detail).then(
      (loaded) => {
        if (stale()) {
          if (loaded) letGoOfWhole(loaded);
          return;
        }
        this.loaded.set(key, loaded);
        this.settle(key);
      },
      () => {
        if (stale()) return;
        this.loaded.set(key, null);
        this.settle(key);
      }
    );
  }

  /** A model read from bytes held here, or null for one that is not to be drawn. */
  private async parse(
    url: string,
    ownGlow: boolean,
    moonlit: boolean,
    look: ModelLook,
    detail: ModelDetail
  ): Promise<LoadedModel | null> {
    const read = await this.reader.read(url);
    if (!read) return null;
    const gltf = { scene: read.scene, animations: read.animations };
    const { made, worn } = madeOf(gltf.scene, materialIndexIn(read));
    const drawn = new Set<Texture>();
    const undrawn = new Set<Texture>();
    for (const one of made.flat()) {
      for (const picture of drawnPicturesOf(one, detail, ownGlow)) drawn.add(picture);
      for (const picture of one.pictures) undrawn.add(picture);
    }
    for (const picture of drawn) undrawn.delete(picture);
    releaseReadPictures(drawn, undrawn);
    for (const picture of undrawn) picture.dispose();
    for (const material of worn) material.dispose();
    this.wear(gltf.scene, made, look, moonlit, ownGlow, detail);
    return { ...measured(gltf), made, ownGlow, ...(read.rig ? { rig: read.rig } : {}) };
  }

  /**
   * A copy of a model read made of another read of the same bytes, for a piece where the other is for
   * a block or drawn another way: its meshes' shapes, its pictures and its motions shared with the
   * other, its materials its own, made as this copy has them drawn (`look`) and covered for the
   * moonlight as it is drawn (`moonlit`), and its measure the other's (see {@link measuredAs}).
   */
  private variantOf(other: LoadedModel, moonlit: boolean, look: ModelLook = MODEL_AS_MADE): LoadedModel {
    const scene = cloneSkinned(other.gltf.scene) as Group;
    this.wear(scene, other.made, look, moonlit, other.ownGlow, this.detail);
    return measuredAs(other, scene);
  }

  private settle(key: string): void {
    this.loading.delete(key);
    this.lay();
    this.arrived();
  }

  /**
   * Gives the meshes of a model's scene the scene's own materials, made of what theirs were made of as
   * the model's piece has them drawn: lit as the board is, veiled and darkened with it, throwing
   * shadows. Meshes made of the same material share the one made for it, and a mesh whose one
   * material is left undrawn is not drawn at all.
   */
  private wear(
    scene: Object3D,
    made: readonly MadeOfMesh[],
    look: ModelLook,
    moonlit: boolean,
    ownGlow: boolean,
    detail: ModelDetail
  ): void {
    const dressed = new Map<MadeMaterial, ModelSceneMaterial>();
    const wornFor = (one: MadeMaterial) => {
      let material = dressed.get(one);
      if (!material) {
        material = sceneMaterialFor(one, materialLookIn(look, one.key), look.finish, detail, ownGlow);
        this.dress(material, moonlit);
        dressed.set(one, material);
      }
      return material;
    };
    meshesOf(scene).forEach((found, index) => {
      const of = made[index];
      if (!of) return;
      const mesh = found as unknown as Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = isSeveral(of) ? of.map(wornFor) : wornFor(of);
      mesh.visible = isSeveral(of) || !materialLookIn(look, of.key).hidden;
    });
  }
}

function isSeveral(of: MadeOfMesh): of is readonly MadeMaterial[] {
  return Array.isArray(of);
}

/**
 * What the materials of a model's meshes were made of, by the meshes' order in the model, with the
 * materials they were read off, which are let go of once the scene's own take their place. A material
 * is told by where the file says it stands among the model's (`indexOf`), or where the file does not
 * say, by where it was first met walking the model.
 */
function madeOf(
  scene: Object3D,
  indexOf: (material: Material) => number | undefined
): { made: MadeOfMesh[]; worn: Material[] } {
  const known = new Map<Material, MadeMaterial>();
  const one = (material: Material) => {
    let made = known.get(material);
    if (!made) {
      made = madeMaterialOf(material, indexOf(material) ?? known.size);
      known.set(material, made);
    }
    return made;
  };
  const made = meshesOf(scene).map((found) => {
    const worn = (found as unknown as Mesh).material;
    return Array.isArray(worn) ? worn.map(one) : one(worn);
  });
  return { made, worn: [...known.keys()] };
}

/** Where each material of a model read stands among the model's, as the file it was read from says. */
function materialIndexIn(read: Partial<Pick<GLTF, 'parser'>>): (material: Material) => number | undefined {
  const told = read.parser?.associations as ReadonlyMap<unknown, { materials?: number } | undefined> | undefined;
  return (material) => told?.get(material)?.materials;
}

/**
 * Lets go of all a model read holds: its meshes' shapes, its materials, and every picture its
 * materials were made of, those none of its materials is drawn with now among them.
 */
function letGoOfWhole(loaded: LoadedModel): void {
  disposeObject(loaded.gltf.scene);
  for (const one of loaded.made.flat()) for (const picture of one.pictures) picture.dispose();
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
    return { ...measured({ scene, animations: other.gltf.animations }), made: other.made, ownGlow: other.ownGlow };
  }
  return { ...other, gltf: { scene, animations: other.gltf.animations }, parts: parts as ModelPart[] };
}

/** A model read and made over for the scene, measured: its size and foot as it stands, and its parts as made. */
function measured(gltf: Pick<GLTF, 'scene' | 'animations'>): Omit<LoadedModel, 'made' | 'ownGlow'> {
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
    shaped: meshesOf(gltf.scene).some((mesh) => ((mesh as unknown as Mesh).morphTargetInfluences?.length ?? 0) > 0),
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
 * What a read model is kept by: where its bytes are, for a piece apart from a block, since the two
 * are made over differently for the moonlight (see `moonlitFor`) and one model may be drawn as both,
 * and by how its piece has its materials drawn, where that is not as it was made.
 */
export function modelReadKeyOf(model: TableWorldModel): string {
  const look = model.model.look === MODEL_AS_MADE ? '' : writeModelLook(model.model.look);
  return `${model.url}${moonlitFor(model) ? '' : PIECE_READ}${look ? `${LOOK_READ}${look}` : ''}`;
}

/** What is added to the key a model drawn for a piece is kept by. */
const PIECE_READ = '#piece';
/** What is added, before the look itself, to the key a model drawn another way than it was made is kept by. */
const LOOK_READ = '#look=';

/**
 * The way across the floor a model acts, of unit length in the scene, written into `into`: towards
 * the other in its act where its piece is told of one, else the way it faces as it is placed.
 */
function towardOf(model: TableWorldModel, placed: Matrix4, into: Vector3): Vector3 {
  const other = model.act?.toward;
  if (other) into.set(other.x, 0, other.y);
  else into.set(0, 0, 1).transformDirection(placed).setY(0);
  return into.lengthSq() > 1e-9 ? into.normalize() : into.set(0, 0, 1);
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
