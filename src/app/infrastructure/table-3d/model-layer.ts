import { gltfFactsOf, MAX_MODEL_TRIANGLES } from '@axe/core/storage/gltf-facts';
import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  Group,
  InstancedMesh,
  LoadingManager,
  type Material,
  Matrix4,
  Mesh,
  MeshLambertNodeMaterial,
  type MeshStandardMaterial,
  type Object3D,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';

/** What a model is drawn from: its scene once read, and how large it is as it was made. */
interface LoadedModel {
  readonly gltf: GLTF;
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
}

/** What a model's placement is worked out from: its size as made, whether it is stretched, and its leaves. */
type ModelMeasure = Pick<LoadedModel, 'size'> & {
  readonly stretch?: boolean;
  readonly parts?: readonly Pick<ModelPart, 'within' | 'swing'>[];
};

/** Every copy of a model that plays no motion, drawn together: one instanced mesh for each of its meshes. */
interface Herd {
  readonly parts: readonly InstancedMesh[];
  readonly capacity: number;
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

/** Where the decoders for compressed meshes and textures are served from, alongside the app. */
const DECODERS = 'assets/decoders/';
const DRACO_DECODER = {
  js: `${DECODERS}draco/draco_wasm_wrapper.js`,
  wasm: `${DECODERS}draco/draco_decoder.wasm`,
};
const BASIS_TRANSCODER = `${DECODERS}basis/`;

/**
 * The pieces and blocks drawn as 3D models: each a binary glTF file read from bytes held here, its
 * materials made over to be lit and veiled as the rest of the scene is, stood with its foot at the
 * piece's, fitted inside the piece's box, and turned as the piece is. A model that plays a walk
 * plays it while its piece is moved, and stands in the first pose of its idle otherwise, so a table
 * standing still is not drawn again. Nothing a model names outside its own bytes is ever fetched,
 * and one that draws more triangles than a model may, or cannot be read, is left drawn as its
 * picture. The decoders for compressed meshes and textures are fetched, from the app's own assets,
 * only once a model that needs them comes.
 */
export class ModelLayer {
  readonly group = new Group();
  private readonly manager = new LoadingManager();
  private readonly loader: GLTFLoader;
  private draco: Promise<DRACOLoader> | null = null;
  private ktx2: Promise<KTX2Loader> | null = null;
  private readonly loaded = new Map<string, LoadedModel | null>();
  private readonly loading = new Set<string>();
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
    this.manager.setURLModifier((url) =>
      url.startsWith('blob:') || url.startsWith('data:') || url.startsWith(DECODERS) ? url : 'data:,'
    );
    this.loader = new GLTFLoader(this.manager);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
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
    for (const loaded of this.loaded.values()) loaded?.gltf.scene.traverse(disposeMesh);
    this.loaded.clear();
    void this.draco?.then((loader) => loader.dispose());
    void this.ktx2?.then((loader) => loader.dispose());
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
    this.changed = true;
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
    let herd = this.herds.get(url);
    if (!herd || herd.capacity < flock.length) {
      if (herd) this.unherd(herd);
      const capacity = Math.max(4, 2 ** Math.ceil(Math.log2(flock.length)));
      herd = {
        parts: loaded.parts.map(({ mesh }) => {
          const part = new InstancedMesh(mesh.geometry, mesh.material, capacity);
          part.castShadow = true;
          part.receiveShadow = true;
          part.matrixAutoUpdate = false;
          this.group.add(part);
          return part;
        }),
        capacity,
        copies: 0,
      };
      this.herds.set(url, herd);
    }
    herd.copies = flock.length;
    flock.forEach((model, index) => {
      partPlacementsOf(model, loaded).forEach((matrix, part) => herd.parts[part].setMatrixAt(index, matrix));
    });
    for (const part of herd.parts) {
      part.count = flock.length;
      part.instanceMatrix.needsUpdate = true;
      part.computeBoundingSphere();
    }
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
    if (!url.startsWith('blob:') && !url.startsWith('data:')) return null;
    const bytes = await (await fetch(url)).arrayBuffer();
    const facts = gltfFactsOf(bytes);
    if (!facts || facts.triangles > MAX_MODEL_TRIANGLES) return null;
    if (facts.extensions.includes('KHR_draco_mesh_compression')) this.loader.setDRACOLoader(await this.dracoLoader());
    if (facts.extensions.includes('KHR_texture_basisu')) this.loader.setKTX2Loader(await this.ktx2Loader());
    const gltf = await this.loader.parseAsync(bytes, '');
    gltf.scene.traverse((object) => this.makeOver(object));
    gltf.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(gltf.scene);
    const size = box.getSize(new Vector3());
    const middle = box.getCenter(new Vector3());
    const foot = new Vector3(middle.x, box.min.y, middle.z);
    const fromFoot = new Matrix4().makeTranslation(-foot.x, -foot.y, -foot.z);
    const parts: ModelPart[] = [];
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const swing = swingOf(object);
      parts.push({
        mesh: object,
        within: fromFoot.clone().multiply(object.matrixWorld),
        ...(swing ? { swing: { hinge: swing.hinge.applyMatrix4(fromFoot), deg: swing.deg } } : {}),
      });
    });
    const stretch = (gltf.scene.userData as { fit?: unknown })['fit'] === 'stretch';
    return { gltf, size, foot, animated: gltf.animations.length > 0, parts, stretch };
  }

  private dracoLoader(): Promise<DRACOLoader> {
    this.draco ??= import('three/addons/loaders/DRACOLoader.js').then(({ DRACOLoader }) =>
      new DRACOLoader(this.manager).setDecoderPath(DRACO_DECODER)
    );
    return this.draco;
  }

  private ktx2Loader(): Promise<KTX2Loader> {
    this.ktx2 ??= import('three/addons/loaders/KTX2Loader.js').then(({ KTX2Loader }) =>
      new KTX2Loader(this.manager).setTranscoderPath(BASIS_TRANSCODER).detectSupport(this.renderer())
    );
    return this.ktx2;
  }

  private settle(url: string): void {
    this.loading.delete(url);
    this.lay();
    this.arrived();
  }

  /** Makes a mesh's material over as the scene's own: lit as the board is, veiled and darkened with it, throwing shadows. */
  private makeOver(object: Object3D): void {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const madeOver = (material: Material) => {
      const was = material as MeshStandardMaterial;
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
export function partPlacementsOf(model: TableWorldModel, loaded: ModelMeasure): Matrix4[] {
  const { frame, scaling } = placementPartsOf(model, loaded);
  const placement = frame.clone().multiply(scaling);
  const open = model.door?.open === true;
  return (loaded.parts ?? []).map(({ within, swing }) =>
    open && swing
      ? frame.clone().multiply(swungAbout(scaling, swing)).multiply(scaling).multiply(within)
      : placement.clone().multiply(within)
  );
}

/** The turn a leaf swings open by, about its hinge where the scaling puts it, so that it swings unstretched. */
function swungAbout(scaling: Matrix4, swing: NonNullable<ModelPart['swing']>): Matrix4 {
  const hinge = swing.hinge.clone().applyMatrix4(scaling);
  return new Matrix4()
    .makeTranslation(hinge.x, hinge.y, hinge.z)
    .multiply(new Matrix4().makeRotationY(swing.deg * RADIANS))
    .multiply(new Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z));
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

function disposeMesh(object: Object3D): void {
  if (!(object instanceof Mesh)) return;
  object.geometry.dispose();
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
}
