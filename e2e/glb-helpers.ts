/**
 * A binary glTF file of one box of one colour, `width` across and deep and `height` tall, standing
 * on its foot at the origin: the smallest 3D model a piece can be drawn as.
 */
export function boxGlb(width: number, height: number, rgb: [number, number, number]): Buffer {
  const half = width / 2;
  const corners = [
    [-half, 0, -half],
    [half, 0, -half],
    [half, 0, half],
    [-half, 0, half],
    [-half, height, -half],
    [half, height, -half],
    [half, height, half],
    [-half, height, half],
  ];
  const faces = [
    [0, 2, 1, 0, 3, 2],
    [4, 5, 6, 4, 6, 7],
    [0, 1, 5, 0, 5, 4],
    [1, 2, 6, 1, 6, 5],
    [2, 3, 7, 2, 7, 6],
    [3, 0, 4, 3, 4, 7],
  ].flat();
  const positions = Buffer.alloc(corners.length * 12);
  corners.forEach((corner, index) =>
    corner.forEach((value, axis) => positions.writeFloatLE(value, index * 12 + axis * 4))
  );
  const indices = Buffer.alloc(faces.length * 2);
  faces.forEach((value, index) => indices.writeUInt16LE(value, index * 2));
  const bin = pad(Buffer.concat([positions, indices]), 0);
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [...rgb.map((value) => value / 255), 1] } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length },
      { buffer: 0, byteOffset: positions.length, byteLength: indices.length },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: corners.length,
        type: 'VEC3',
        min: [-half, 0, -half],
        max: [half, height, half],
      },
      { bufferView: 1, componentType: 5123, count: faces.length, type: 'SCALAR' },
    ],
  };
  return packGlb(json, bin);
}

/** The bones a VRM must name, each under its parent, and where it stands from it: a figure a metre and a half tall. */
const HUMAN_BONES: readonly (readonly [string, string | null, [number, number, number]])[] = [
  ['hips', null, [0, 0.9, 0]],
  ['spine', 'hips', [0, 0.1, 0]],
  ['head', 'spine', [0, 0.4, 0]],
  ['leftUpperArm', 'spine', [0.2, 0.3, 0]],
  ['leftLowerArm', 'leftUpperArm', [0.25, 0, 0]],
  ['leftHand', 'leftLowerArm', [0.25, 0, 0]],
  ['rightUpperArm', 'spine', [-0.2, 0.3, 0]],
  ['rightLowerArm', 'rightUpperArm', [-0.25, 0, 0]],
  ['rightHand', 'rightLowerArm', [-0.25, 0, 0]],
  ['leftUpperLeg', 'hips', [0.1, -0.05, 0]],
  ['leftLowerLeg', 'leftUpperLeg', [0, -0.4, 0]],
  ['leftFoot', 'leftLowerLeg', [0, -0.4, 0]],
  ['rightUpperLeg', 'hips', [-0.1, -0.05, 0]],
  ['rightLowerLeg', 'rightUpperLeg', [0, -0.4, 0]],
  ['rightFoot', 'rightLowerLeg', [0, -0.4, 0]],
];

/**
 * The nodes of a figure's bones, from the first index given on, each named as the bone it is and
 * holding the bones under it, and the bones by the node each is.
 */
function skeleton(from: number) {
  const nodes = HUMAN_BONES.map(([name, , translation]) => ({ name, translation, children: [] as number[] }));
  HUMAN_BONES.forEach(([, parent], index) => {
    if (parent) nodes[HUMAN_BONES.findIndex(([name]) => name === parent)].children.push(from + index);
  });
  const humanBones = Object.fromEntries(HUMAN_BONES.map(([name], index) => [name, { node: from + index }]));
  return {
    nodes: nodes.map((node) => (node.children.length ? node : { name: node.name, translation: node.translation })),
    humanBones,
  };
}

/**
 * A VRM (version 1) of one box standing beside a figure's bones, which draws as the box and is
 * moved by motions for VRM models as any VRM is: the smallest VRM a piece can be drawn as.
 */
export function boxVrm(): Buffer {
  const box = boxGlb(0.4, 1.5, [200, 160, 120]);
  const read = readGlb(box);
  const { nodes, humanBones } = skeleton(1);
  read.json.scenes = [{ nodes: [0, 1] }];
  read.json.nodes = [...read.json.nodes, ...nodes];
  read.json.extensionsUsed = ['VRMC_vrm'];
  read.json.extensions = {
    VRMC_vrm: {
      specVersion: '1.0',
      meta: { name: 'box', authors: ['Udonarium Axe e2e'], licenseUrl: 'https://vrm.dev/licenses/1.0/' },
      humanoid: { humanBones },
    },
  };
  return packGlb(read.json, read.bin);
}

/**
 * A motion for VRM models (`.vrma`) lifting the left upper arm over a second, turned about the way
 * the figure faces: the smallest motion a VRM can be given.
 */
export function armLiftVrma(): Buffer {
  const { nodes, humanBones } = skeleton(0);
  const times = [0, 1];
  const turns = [0, 0, 0, 1, 0, 0, 0.5, 0.866];
  const bin = Buffer.alloc((times.length + turns.length) * 4);
  [...times, ...turns].forEach((value, index) => bin.writeFloatLE(value, index * 4));
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    animations: [
      {
        channels: [{ sampler: 0, target: { node: humanBones['leftUpperArm'].node, path: 'rotation' } }],
        samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }],
      },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: times.length * 4 },
      { buffer: 0, byteOffset: times.length * 4, byteLength: turns.length * 4 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: times.length, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 1, componentType: 5126, count: turns.length / 4, type: 'VEC4' },
    ],
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: { VRMC_vrm_animation: { specVersion: '1.0', humanoid: { humanBones } } },
  };
  return packGlb(json, bin);
}

/** A binary glTF file of the JSON and the binary chunk given. */
function packGlb(json: object, bin: Buffer): Buffer {
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const chunk = (type: number, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([chunk(0x4e4f534a, jsonChunk), chunk(0x004e4942, pad(bin, 0))]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/** The JSON of a binary glTF file, as far as these helpers write it. */
interface GltfJson {
  scenes: { nodes: number[] }[];
  nodes: object[];
  extensionsUsed?: string[];
  extensions?: object;
}

/** The JSON and the binary chunk of a binary glTF file packed by {@link packGlb}. */
function readGlb(glb: Buffer): { json: GltfJson; bin: Buffer } {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(
    glb
      .subarray(20, 20 + jsonLength)
      .toString('utf8')
      .trim()
  );
  const binStart = 20 + jsonLength;
  const binLength = glb.readUInt32LE(binStart);
  return { json, bin: glb.subarray(binStart + 8, binStart + 8 + binLength) };
}

/** Bytes padded out to a whole number of four, with the byte given. */
function pad(bytes: Buffer, filler: number): Buffer {
  const short = (4 - (bytes.length % 4)) % 4;
  return short ? Buffer.concat([bytes, Buffer.alloc(short, filler)]) : bytes;
}
