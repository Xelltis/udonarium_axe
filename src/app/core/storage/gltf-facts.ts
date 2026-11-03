import { isBinaryGltf } from '@axe/core/storage/model-file';

/** How many triangles a 3D model may draw, so one file cannot hold up every seat that draws it. */
export const MAX_MODEL_TRIANGLES = 200_000;

/** What a binary glTF file says of itself, read from its JSON alone before any of it is decoded. */
export interface GltfFacts {
  /** How many triangles its scene draws, each mesh counted as many times as it is placed. */
  readonly triangles: number;
  /** The extensions it uses, such as the compressions it needs decoders for. */
  readonly extensions: readonly string[];
}

interface GltfJson {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives?: GltfPrimitive[] }[];
  accessors?: { count?: number }[];
  extensionsUsed?: string[];
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
}

/** The chunk type of a binary glTF file's JSON, `JSON` read as a little-endian number. */
const JSON_CHUNK = 0x4e4f534a;

/** The primitive modes that draw triangles: a list, a strip and a fan. */
const TRIANGLES = 4;
const TRIANGLE_STRIP = 5;
const TRIANGLE_FAN = 6;

/**
 * What a binary glTF file says of itself, or null for bytes that are not one or whose JSON cannot
 * be read. Only the scene a loader shows is counted, the one the file names or else its first, and
 * a node placed twice is counted twice, as a loader draws it.
 */
export function gltfFactsOf(bytes: ArrayBuffer): GltfFacts | null {
  if (bytes.byteLength < 20 || !isBinaryGltf(new Uint8Array(bytes, 0, 8))) return null;
  const view = new DataView(bytes);
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || 20 + length > bytes.byteLength) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length))) as GltfJson;
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
    return { triangles, extensions: Array.isArray(json.extensionsUsed) ? json.extensionsUsed : [] };
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
