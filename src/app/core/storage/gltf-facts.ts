import { isBinaryGltf } from '@axe/core/storage/model-file';

/** How many triangles a 3D model may draw, so one file cannot hold up every seat that draws it. */
export const MAX_MODEL_TRIANGLES = 200_000;

/** What a binary glTF file says of itself, read from its JSON alone before any of it is decoded. */
export interface GltfFacts {
  /** How many triangles its scene draws, each mesh counted as many times as it is placed. */
  readonly triangles: number;
  /** The extensions it uses, such as the compressions it needs decoders for. */
  readonly extensions: readonly string[];
  /**
   * How the scene a loader shows says it is laid on what it is drawn for, as its extras name it in
   * `{ "fit": ... }`, such as a wall joined to the walls beside it; empty where it says nothing.
   */
  readonly fit: string;
}

/**
 * What a binary glTF file names of itself, for whoever sets a model up to choose among: the motions it
 * plays, the shapes its meshes can be blended towards, and its materials, each by the key
 * `materialKeyOf` gives it.
 */
export interface GltfNames {
  readonly motions: readonly string[];
  readonly shapes: readonly string[];
  readonly materials: readonly string[];
}

interface GltfJson {
  scene?: number;
  scenes?: { nodes?: number[]; extras?: { fit?: unknown } }[];
  nodes?: GltfNode[];
  meshes?: { primitives?: GltfPrimitive[]; extras?: { targetNames?: unknown } }[];
  accessors?: { count?: number }[];
  extensionsUsed?: string[];
  animations?: { name?: unknown }[];
  materials?: { name?: unknown }[];
}

interface GltfNode {
  mesh?: number;
  children?: number[];
  extensions?: { EXT_mesh_gpu_instancing?: { attributes?: Record<string, number> } };
}

interface GltfPrimitive {
  mode?: number;
  indices?: number;
  attributes?: Record<string, number>;
  targets?: unknown[];
  extras?: { targetNames?: unknown };
}

/** The chunk type of a binary glTF file's JSON, `JSON` read as a little-endian number. */
const JSON_CHUNK = 0x4e4f534a;

/** The primitive modes that draw triangles: a list, a strip and a fan. */
const TRIANGLES = 4;
const TRIANGLE_STRIP = 5;
const TRIANGLE_FAN = 6;

/** How many bytes open a binary glTF file before its JSON: its header and the JSON chunk's own. */
const GLB_HEAD_BYTES = 20;

/**
 * What a binary glTF file held as a blob says of itself, read from its head and its JSON alone rather
 * than from the whole of it; null as {@link gltfFactsOf} has it.
 */
export async function gltfFactsOfBlob(blob: Blob): Promise<GltfFacts | null> {
  const head = await blob.slice(0, GLB_HEAD_BYTES).arrayBuffer();
  if (head.byteLength < GLB_HEAD_BYTES) return null;
  const length = new DataView(head).getUint32(12, true);
  return gltfFactsOf(await blob.slice(0, GLB_HEAD_BYTES + length).arrayBuffer());
}

/**
 * What a binary glTF file says of itself, or null for bytes that are not one or whose JSON cannot
 * be read. Only the scene a loader shows is counted, the one the file names or else its first, and
 * a node placed twice is counted twice, as a loader draws it.
 */
export function gltfFactsOf(bytes: ArrayBuffer): GltfFacts | null {
  const json = gltfJsonOf(bytes);
  if (!json) return null;
  try {
    const scene = json.scenes?.[json.scene ?? 0];
    const counted = new Map<number, number>();
    const counting = new Set<number>();
    const trianglesUnder = (index: number): number => {
      const known = counted.get(index);
      if (known !== undefined) return known;
      if (counting.has(index)) return 0;
      counting.add(index);
      const node = json.nodes?.[index];
      let triangles = node?.mesh === undefined ? 0 : meshTriangles(json, node.mesh) * instancesOf(json, node);
      for (const child of node?.children ?? []) triangles += trianglesUnder(child);
      counting.delete(index);
      counted.set(index, triangles);
      return triangles;
    };
    const triangles = (scene?.nodes ?? []).reduce((sum, index) => sum + trianglesUnder(index), 0);
    const fit = scene?.extras?.fit;
    return {
      triangles,
      extensions: Array.isArray(json.extensionsUsed) ? json.extensionsUsed : [],
      fit: typeof fit === 'string' ? fit : '',
    };
  } catch {
    return null;
  }
}

/**
 * What a binary glTF file held as a blob names of itself, read from its head and its JSON alone; null
 * as {@link gltfNamesOf} has it.
 */
export async function gltfNamesOfBlob(blob: Blob): Promise<GltfNames | null> {
  const head = await blob.slice(0, GLB_HEAD_BYTES).arrayBuffer();
  if (head.byteLength < GLB_HEAD_BYTES) return null;
  const length = new DataView(head).getUint32(12, true);
  return gltfNamesOf(await blob.slice(0, GLB_HEAD_BYTES + length).arrayBuffer());
}

/**
 * What a binary glTF file names of itself, or null for bytes that are not one or whose JSON cannot be
 * read. A motion with no name is named as a loader names it, by where it stands among the motions; a
 * shape with none, by where it stands among its mesh's; each name is given once.
 */
export function gltfNamesOf(bytes: ArrayBuffer): GltfNames | null {
  const json = gltfJsonOf(bytes);
  if (!json) return null;
  try {
    const motions = (Array.isArray(json.animations) ? json.animations : []).map((motion, index) =>
      typeof motion?.name === 'string' && motion.name ? motion.name : `animation_${index}`
    );
    const shapes = new Set<string>();
    for (const mesh of Array.isArray(json.meshes) ? json.meshes : []) {
      const primitive = mesh?.primitives?.[0];
      const count = Array.isArray(primitive?.targets) ? primitive.targets.length : 0;
      const named =
        shapeNamesOf(mesh?.extras?.targetNames, count) ?? shapeNamesOf(primitive?.extras?.targetNames, count);
      for (let index = 0; index < count; index++) shapes.add(named?.[index] ?? `${index}`);
    }
    const materials = (Array.isArray(json.materials) ? json.materials : []).map((material, index) =>
      materialKeyOf(material?.name, index)
    );
    return { motions: [...new Set(motions)], shapes: [...shapes], materials: [...new Set(materials)] };
  } catch {
    return null;
  }
}

/**
 * What a material of a model is told apart by, wherever the model is read: its name, or for one with
 * no name, where it stands among the model's materials, as `#3`.
 */
export function materialKeyOf(name: unknown, index: number): string {
  const named = typeof name === 'string' ? name.trim().slice(0, MAX_MATERIAL_NAME) : '';
  return named && !named.startsWith('#') ? named : `#${index}`;
}

/** How long the name of a material may be to tell it by. */
const MAX_MATERIAL_NAME = 80;

/** The names a mesh gives its shapes, where it names every one of them. */
function shapeNamesOf(names: unknown, count: number): string[] | null {
  if (!Array.isArray(names) || names.length !== count) return null;
  return names.map((name, index) => (typeof name === 'string' && name ? name : `${index}`));
}

/** The JSON of a binary glTF file, or null for bytes that are not one or whose JSON cannot be read. */
function gltfJsonOf(bytes: ArrayBuffer): GltfJson | null {
  if (bytes.byteLength < GLB_HEAD_BYTES || !isBinaryGltf(new Uint8Array(bytes, 0, 8))) return null;
  const view = new DataView(bytes);
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || GLB_HEAD_BYTES + length > bytes.byteLength) return null;
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, GLB_HEAD_BYTES, length)));
    return json && typeof json === 'object' && !Array.isArray(json) ? (json as GltfJson) : null;
  } catch {
    return null;
  }
}

function meshTriangles(json: GltfJson, mesh: number): number {
  let triangles = 0;
  for (const primitive of json.meshes?.[mesh]?.primitives ?? []) {
    const corners = countOf(json, primitive.indices ?? primitive.attributes?.['POSITION']);
    const mode = primitive.mode ?? TRIANGLES;
    if (mode === TRIANGLES) triangles += Math.floor(corners / 3);
    else if (mode === TRIANGLE_STRIP || mode === TRIANGLE_FAN) triangles += Math.max(0, corners - 2);
  }
  return triangles;
}

/** How many times a node's mesh is drawn: once, or once for each instance it is placed at. */
function instancesOf(json: GltfJson, node: GltfNode): number {
  const attributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
  if (!attributes) return 1;
  return Math.max(0, ...Object.values(attributes).map((accessor) => countOf(json, accessor)));
}

function countOf(json: GltfJson, accessor: number | undefined): number {
  const count = accessor === undefined ? 0 : json.accessors?.[accessor]?.count;
  return typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0;
}
