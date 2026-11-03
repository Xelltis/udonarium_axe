import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  Group,
  LoadingManager,
  type Material,
  Mesh,
  MeshLambertNodeMaterial,
  type MeshStandardMaterial,
  type Object3D,
  Vector3,
} from 'three/webgpu';

/** What a model is drawn from: its scene once read, and how large it is as it was made. */
interface LoadedModel {
  readonly gltf: GLTF;
  readonly size: Vector3;
  /** The middle of its foot, as it was made: its box's middle across and its lowest point. */
  readonly foot: Vector3;
}

interface StoodModel {
  readonly owner: string;
  readonly url: string;
  readonly root: Group;
  readonly mixer: AnimationMixer | null;
  readonly idle: AnimationAction | null;
  readonly walk: AnimationAction | null;
  walking: boolean;
}

/** How many radians a degree is. */
const RADIANS = Math.PI / 180;

/**
 * The pieces and blocks drawn as 3D models: each a binary glTF file read from bytes held here, its
 * materials made over to be lit and veiled as the rest of the scene is, stood with its foot at the
 * piece's, fitted to the piece's footprint, and turned as the piece is. A model that plays a walk
 * plays it while its piece is moved, and stands in the first pose of its idle otherwise, so a table
 * standing still is not drawn again. Nothing a model names outside its own bytes is ever fetched.
 */
export class ModelLayer {
  readonly group = new Group();
  private readonly loader: GLTFLoader;
  private readonly loaded = new Map<string, LoadedModel | null>();
  private readonly loading = new Set<string>();
  private stood = new Map<string, StoodModel>();
  private laid: readonly TableWorldModel[] = [];
  private changed = false;
  private lastTimeMs: number | null = null;

  constructor(
    private readonly dress: (material: Material) => void,
    private readonly arrived: () => void
  ) {
    const manager = new LoadingManager();
    manager.setURLModifier((url) => (url.startsWith('blob:') || url.startsWith('data:') ? url : 'data:,'));
    this.loader = new GLTFLoader(manager);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  /** How many models are read and stood, and how many are still being read. */
  get shown(): number {
    return this.stood.size;
  }

  get isLoading(): boolean {
    return this.loading.size > 0;
  }

  /** The pieces and blocks drawn as models now, which a frame of their shadows follows. */
  set(models: readonly TableWorldModel[]): void {
    if (models === this.laid) return;
    this.laid = models;
    const wanted = new Set(models.map((model) => model.owner));
    for (const [owner, stood] of this.stood) {
      if (wanted.has(owner) && models.find((model) => model.owner === owner)?.url === stood.url) continue;
      this.group.remove(stood.root);
      stood.mixer?.stopAllAction();
      this.stood.delete(owner);
    }
    for (const model of models) this.stand(model);
    this.changed = true;
  }

  /** Moves the walks on to a moment, in milliseconds; answers whether any model is walking. */
  advance(timeMs: number): boolean {
    const step = this.lastTimeMs === null ? 0 : Math.min(0.1, (timeMs - this.lastTimeMs) / 1000);
    this.lastTimeMs = timeMs;
    let walking = false;
    for (const stood of this.stood.values()) {
      if (!stood.walking || !stood.mixer) continue;
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
    for (const loaded of this.loaded.values()) loaded?.gltf.scene.traverse(disposeMesh);
    this.loaded.clear();
  }

  /** Stands a model where its piece is, reading it first where it has not been read yet. */
  private stand(model: TableWorldModel): void {
    const loaded = this.loaded.get(model.url);
    if (loaded === undefined) {
      this.read(model.url);
      return;
    }
    if (loaded === null) return;
    let stood = this.stood.get(model.owner);
    if (!stood) {
      stood = this.instanceOf(model, loaded);
      this.stood.set(model.owner, stood);
      this.group.add(stood.root);
    }
    const across = Math.max(loaded.size.x, loaded.size.z, 1e-6);
    const scale = (Math.max(1, model.footprintPx) * model.model.scale) / across;
    const inner = stood.root.children[0];
    inner.position.set(-loaded.foot.x, -loaded.foot.y, -loaded.foot.z);
    stood.root.scale.setScalar(scale);
    stood.root.position.set(model.foot.x, model.foot.z, model.foot.y);
    stood.root.rotation.set(0, -(model.rotateDeg + model.model.turnDeg) * RADIANS, 0);
    stood.root.updateMatrixWorld(true);
    this.walk(stood, model.walking);
  }

  /** Plays a model's walk while its piece is moved, and holds it in the first pose of its idle otherwise. */
  private walk(stood: StoodModel, walking: boolean): void {
    if (stood.walking === walking) return;
    stood.walking = walking;
    if (!stood.mixer) return;
    stood.mixer.stopAllAction();
    const action = walking ? (stood.walk ?? stood.idle) : stood.idle;
    action?.reset().play();
    stood.mixer.update(0);
  }

  private instanceOf(model: TableWorldModel, loaded: LoadedModel): StoodModel {
    const animated = loaded.gltf.animations.length > 0;
    const inner = (animated ? cloneSkinned(loaded.gltf.scene) : loaded.gltf.scene.clone()) as Object3D;
    const root = new Group();
    root.add(inner);
    root.userData['owner'] = model.owner;
    const mixer = animated ? new AnimationMixer(inner) : null;
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
      idle: mixer && idleClip ? mixer.clipAction(idleClip) : null,
      walk: mixer && walkClip ? mixer.clipAction(walkClip) : null,
      walking: true,
    };
    this.walk(stood, false);
    return stood;
  }

  /** Reads a model from bytes held here, its materials made over for the scene, and asks for a frame once it is read. */
  private read(url: string): void {
    if (this.loading.has(url)) return;
    this.loading.add(url);
    this.loader.load(
      url,
      (gltf) => {
        gltf.scene.traverse((object) => this.makeOver(object));
        const box = new Box3().setFromObject(gltf.scene);
        const size = box.getSize(new Vector3());
        const middle = box.getCenter(new Vector3());
        this.loaded.set(url, { gltf, size, foot: new Vector3(middle.x, box.min.y, middle.z) });
        this.settle(url);
      },
      undefined,
      () => {
        this.loaded.set(url, null);
        this.settle(url);
      }
    );
  }

  private settle(url: string): void {
    this.loading.delete(url);
    for (const model of this.laid) if (model.url === url) this.stand(model);
    this.changed = true;
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

function disposeMesh(object: Object3D): void {
  if (!(object instanceof Mesh)) return;
  object.geometry.dispose();
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
}
