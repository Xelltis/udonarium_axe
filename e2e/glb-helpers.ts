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
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const chunk = (type: number, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([chunk(0x4e4f534a, jsonChunk), chunk(0x004e4942, bin)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/** Bytes padded out to a whole number of four, with the byte given. */
function pad(bytes: Buffer, filler: number): Buffer {
  const short = (4 - (bytes.length % 4)) % 4;
  return short ? Buffer.concat([bytes, Buffer.alloc(short, filler)]) : bytes;
}
