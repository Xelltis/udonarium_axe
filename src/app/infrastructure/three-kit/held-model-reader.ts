import { gltfFactsOf, MAX_MODEL_TRIANGLES } from '@axe/core/storage/gltf-facts';
import { isHeldModelUrl } from '@axe/core/storage/model-file';
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

/** The renderer a compressed texture's support is told by. */
export type TextureSupport = Parameters<KTX2Loader['detectSupport']>[0];

/**
 * Reads 3D models from bytes held here, a binary glTF file each: nothing a model names outside its
 * own bytes is ever fetched, and one that draws more triangles than a model may, or is no binary
 * glTF, is not read. The decoders for compressed meshes and textures are fetched, from the app's own
 * assets, only once a model that needs them comes.
 */
export class HeldModelReader {
  private readonly manager = new LoadingManager();
  private readonly loader: GLTFLoader;
  private draco: Promise<DRACOLoader> | null = null;
  private ktx2: Promise<KTX2Loader> | null = null;

  constructor(private readonly renderer: () => TextureSupport) {
    this.manager.setURLModifier((url) => (isHeldModelUrl(url) || url.startsWith(DECODERS) ? url : 'data:,'));
    this.loader = new GLTFLoader(this.manager);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  /** The model held at a URL of bytes held here, or null for one that is not to be drawn. */
  async read(url: string): Promise<GLTF | null> {
    if (!isHeldModelUrl(url)) return null;
    const bytes = await (await fetch(url)).arrayBuffer();
    const facts = gltfFactsOf(bytes);
    if (!facts || facts.triangles > MAX_MODEL_TRIANGLES) return null;
    if (facts.extensions.includes('KHR_draco_mesh_compression')) this.loader.setDRACOLoader(await this.dracoLoader());
    if (facts.extensions.includes('KHR_texture_basisu')) this.loader.setKTX2Loader(await this.ktx2Loader());
    return this.loader.parseAsync(bytes, '');
  }

  /** Lets go of the decoders it fetched. */
  dispose(): void {
    void this.draco?.then((loader) => loader.dispose());
    void this.ktx2?.then((loader) => loader.dispose());
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
