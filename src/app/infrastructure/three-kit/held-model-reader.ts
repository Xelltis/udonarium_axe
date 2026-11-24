import { gltfFactsOf, MAX_MODEL_TRIANGLES } from '@axe/core/storage/gltf-facts';
import { isHeldModelUrl } from '@axe/core/storage/model-file';
import type { VrmRig } from '@axe/infrastructure/three-kit/vrm-rig';
import { LoadingManager } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

/** Where the decoders for compressed meshes and textures are served from, alongside the app. */
const DECODERS = 'assets/decoders/';
const DRACO_DECODER = {
  js: `${DECODERS}draco/draco_wasm_wrapper.js`,
  wasm: `${DECODERS}draco/draco_decoder.wasm`,
};
const BASIS_TRANSCODER = `${DECODERS}basis/`;
/** The extensions a VRM file says it uses: `VRMC_vrm` from version 1, `VRM` before it. */
const VRM_READ: ReadonlySet<string> = new Set(['VRMC_vrm', 'VRM']);
/** The extension a motion for VRM models (`.vrma`) says it uses. */
const VRM_MOTION = 'VRMC_vrm_animation';

/** A model read: its scene and motions, and for a VRM what it is rigged with beyond them. */
export type ReadModel = GLTF & { readonly rig?: VrmRig };

/** The renderer a compressed texture's support is told by. */
export type TextureSupport = Parameters<KTX2Loader['detectSupport']>[0];

/**
 * Reads 3D models from bytes held here, a binary glTF file each: nothing a model names outside its
 * own bytes is ever fetched, and one that draws more triangles than a model may, or is no binary
 * glTF, is not read. The decoders for compressed meshes and textures are fetched, from the app's own
 * assets, only once a model that needs them comes, and so is what reads a VRM (a binary glTF file
 * with the VRM extensions, `.vrm`): its expressions, the parts of it that swing and its MToon
 * materials.
 */
export class HeldModelReader {
  private readonly manager = new LoadingManager();
  private readonly loader: GLTFLoader;
  private draco: Promise<DRACOLoader> | null = null;
  private ktx2: Promise<KTX2Loader> | null = null;
  private vrm: Promise<typeof import('@axe/infrastructure/three-kit/vrm-reading')> | null = null;

  constructor(private readonly renderer: () => TextureSupport) {
    this.manager.setURLModifier((url) => (isHeldModelUrl(url) || url.startsWith(DECODERS) ? url : 'data:,'));
    this.loader = new GLTFLoader(this.manager);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  /** The model held at a URL of bytes held here, or null for one that is not to be drawn. */
  async read(url: string): Promise<ReadModel | null> {
    if (!isHeldModelUrl(url)) return null;
    const bytes = await (await fetch(url)).arrayBuffer();
    const facts = gltfFactsOf(bytes);
    if (!facts || facts.triangles > MAX_MODEL_TRIANGLES) return null;
    if (facts.extensions.includes('KHR_draco_mesh_compression')) this.loader.setDRACOLoader(await this.dracoLoader());
    if (facts.extensions.includes('KHR_texture_basisu')) this.loader.setKTX2Loader(await this.ktx2Loader());
    const vrm = facts.extensions.some((extension) => VRM_READ.has(extension)) ? await this.vrmReading() : null;
    const gltf = await this.loader.parseAsync(bytes, '');
    const rig = vrm?.readiedVrm(gltf) ?? null;
    return rig ? Object.assign(gltf, { rig }) : gltf;
  }

  /**
   * The motion for VRM models (`.vrma`) held at a URL of bytes held here, as what reads VRMs reads
   * it, for a VRM's rig to make over into a motion of its own bones (`VrmRig.motionOf`); null for one
   * that is not held here or holds no such motion.
   */
  async readMotion(url: string): Promise<unknown> {
    if (!isHeldModelUrl(url)) return null;
    const bytes = await (await fetch(url)).arrayBuffer();
    if (!gltfFactsOf(bytes)?.extensions.includes(VRM_MOTION)) return null;
    const reading = await this.vrmReading();
    return reading.vrmMotionIn(await this.loader.parseAsync(bytes, ''));
  }

  /** Lets go of the decoders it fetched. */
  dispose(): void {
    void this.draco?.then((loader) => loader.dispose());
    void this.ktx2?.then((loader) => loader.dispose());
  }

  /** What reads a VRM, fetched and given to the loader the first time a VRM comes. */
  private vrmReading(): Promise<typeof import('@axe/infrastructure/three-kit/vrm-reading')> {
    this.vrm ??= import('@axe/infrastructure/three-kit/vrm-reading').then((reading) => {
      reading.readVrmWith(this.loader);
      return reading;
    });
    return this.vrm;
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
}
