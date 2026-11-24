import { GLB_HEAD_BYTES, type GltfJson, gltfJsonOf } from '@axe/core/storage/gltf-facts';

/**
 * What a binary glTF file names of itself, for whoever sets a model up to choose among: the motions it
 * plays, the shapes its meshes can be blended towards, and its materials, each by the key
 * `materialKeyOf` gives it.
 */
export interface GltfNames {
  readonly motions: readonly string[];
  readonly shapes: readonly string[];
  readonly materials: readonly string[];
  /** Whether it is a VRM, which motions for VRM models (`.vrma`) can be given to. */
  readonly vrm: boolean;
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
 * shape with none, by where it stands among its mesh's; each name is given once. A VRM names the
 * shapes it blends its face towards first, as it names them from version 1 on, a model from before
 * it read as the reader of VRMs reads it.
 */
export function gltfNamesOf(bytes: ArrayBuffer): GltfNames | null {
  const json = gltfJsonOf(bytes);
  if (!json) return null;
  try {
    const motions = (Array.isArray(json.animations) ? json.animations : []).map((motion, index) =>
      typeof motion?.name === 'string' && motion.name ? motion.name : `animation_${index}`
    );
    const shapes = new Set<string>(vrmExpressionNamesOf(json));
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
    const used = Array.isArray(json.extensionsUsed) ? json.extensionsUsed : [];
    const vrm = used.includes('VRMC_vrm') || used.includes('VRM');
    return { motions: [...new Set(motions)], shapes: [...shapes], materials: [...new Set(materials)], vrm };
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

/** The names the shapes of a VRM from before version 1 are read by, as the reader of VRMs reads them. */
const VRM0_SHAPES: Readonly<Record<string, string>> = {
  a: 'aa',
  e: 'ee',
  i: 'ih',
  o: 'oh',
  u: 'ou',
  blink: 'blink',
  joy: 'happy',
  angry: 'angry',
  sorrow: 'sad',
  fun: 'relaxed',
  lookup: 'lookUp',
  lookdown: 'lookDown',
  lookleft: 'lookLeft',
  lookright: 'lookRight',
  blink_l: 'blinkLeft',
  blink_r: 'blinkRight',
  neutral: 'neutral',
};

/** The shapes a VRM names for its face, by the names the reader of VRMs gives them; none for any other model. */
function vrmExpressionNamesOf(json: GltfJson): string[] {
  const expressions = json.extensions?.VRMC_vrm?.expressions;
  if (expressions) return [...Object.keys(expressions.preset ?? {}), ...Object.keys(expressions.custom ?? {})];
  const groups = json.extensions?.VRM?.blendShapeMaster?.blendShapeGroups;
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => {
    const preset =
      typeof group?.presetName === 'string' && Object.hasOwn(VRM0_SHAPES, group.presetName)
        ? VRM0_SHAPES[group.presetName]
        : undefined;
    const name = preset ?? (typeof group?.name === 'string' ? group.name : '');
    return name ? [name] : [];
  });
}

/** How long the name of a material may be to tell it by. */
const MAX_MATERIAL_NAME = 80;

/** The names a mesh gives its shapes, where it names every one of them. */
function shapeNamesOf(names: unknown, count: number): string[] | null {
  if (!Array.isArray(names) || names.length !== count) return null;
  return names.map((name, index) => (typeof name === 'string' && name ? name : `${index}`));
}
