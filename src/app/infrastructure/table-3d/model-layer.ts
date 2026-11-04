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
  /** Its meshes, each where it stands within the model measured from the model's foot. */
  readonly parts: readonly { readonly mesh: Mesh; readonly within: Matrix4 }[];
}

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
    const matrix = new Matrix4();
    flock.forEach((model, index) => {
      const placement = placementOf(model, loaded);
      loaded.parts.forEach(({ within }, part) =>
        herd.parts[part].setMatrixAt(index, matrix.multiplyMatrices(placement, within))
      );
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
    const parts: { mesh: Mesh; within: Matrix4 }[] = [];
    gltf.scene.traverse((object) => {
      if (object instanceof Mesh) parts.push({ mesh: object, within: fromFoot.clone().multiply(object.matrixWorld) });
    });
    return { gltf, size, foot, animated: gltf.animations.length > 0, parts };
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
 * and tipped over as the piece's picture is, about the middle of the box's width over its foot: its
 * head to the east for a piece not turned, tipped over by a right angle.
 */
export function placementOf(model: TableWorldModel, loaded: Pick<LoadedModel, 'size'>): Matrix4 {
  const across = Math.max(loaded.size.x, loaded.size.z, 1e-6);
  const tall = Math.max(loaded.size.y, 1e-6);
  const fitted = Math.min(
    Math.max(1, model.footprintPx) / across,
    model.heightPx > 0 ? model.heightPx / tall : Infinity
  );
  const scale = fitted * model.model.scale;
  const pivot = model.footprintPx / 2;
  return new Matrix4()
    .makeTranslation(model.foot.x, model.foot.z + model.altitudePx + pivot, model.foot.y)
    .multiply(new Matrix4().makeRotationY(-model.rotateDeg * RADIANS))
    .multiply(new Matrix4().makeRotationZ(-model.rollDeg * RADIANS))
    .multiply(new Matrix4().makeTranslation(0, -pivot, 0))
    .multiply(new Matrix4().makeRotationY(-model.model.turnDeg * RADIANS))
    .multiply(new Matrix4().makeScale(scale, scale, scale));
}

function disposeMesh(object: Object3D): void {
  if (!(object instanceof Mesh)) return;
  object.geometry.dispose();
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
}
