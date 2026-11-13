import type { BufferGeometry, Object3D, Vector3 } from 'three';

/** A mesh as `meshesOf` finds one: anything with a shape and a material of its own. */
interface FacedMesh extends Object3D {
  readonly isMesh: true;
  geometry: BufferGeometry;
  /** Where a corner of the mesh stands in its own space, posed by its bones and morphs as it is drawn. */
  getVertexPosition(index: number, target: Vector3): Vector3;
}

function isFaced(object: Object3D): object is FacedMesh {
  return (object as Partial<FacedMesh>).isMesh === true && (object as Partial<FacedMesh>).geometry !== undefined;
}

/**
 * The meshes of a model in the order they are found walking it, as the faces of a model a part of a
 * piece stands for are told by: the same order wherever the model is read, and in a copy of it.
 */
export function meshesOf(root: Object3D): FacedMesh[] {
  const meshes: FacedMesh[] = [];
  root.traverse((object) => {
    if (isFaced(object)) meshes.push(object);
  });
  return meshes;
}

/** How many triangles a shape is drawn with. */
export function triangleCountOf(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  const count = index ? index.count : (geometry.getAttribute('position')?.count ?? 0);
  return Math.floor(count / 3);
}

/**
 * The middle of each triangle of a mesh in the scene, three numbers a triangle, its corners posed as
 * the mesh is drawn and picked, by its bones and its morphs, rather than as it was bound. The mesh's
 * place in the scene is read as it last stood. `corner` is worked in, as this is used with either
 * build of the library.
 */
export function triangleCentresOf(mesh: FacedMesh, corner: Vector3): Float32Array {
  const position = mesh.geometry.getAttribute('position');
  const indices = mesh.geometry.getIndex();
  const count = triangleCountOf(mesh.geometry);
  const centres = new Float32Array(count * 3);
  for (let triangle = 0; triangle < count; triangle++) {
    for (let at = 0; at < 3; at++) {
      const point = indices ? indices.getX(triangle * 3 + at) : triangle * 3 + at;
      mesh.getVertexPosition(Math.min(point, position.count - 1), corner).applyMatrix4(mesh.matrixWorld);
      centres[triangle * 3] += corner.x / 3;
      centres[triangle * 3 + 1] += corner.y / 3;
      centres[triangle * 3 + 2] += corner.z / 3;
    }
  }
  return centres;
}

/** Where a shape cut from another keeps which of the other's triangles each of its own is. */
const KEPT_TRIANGLES = 'keptTriangles';

/**
 * The triangle of the shape a model was read with that a triangle of a shape drawn from it is: the
 * same one, but in a shape cut from it, whose triangles are counted afresh without those left out.
 */
export function sourceTriangleOf(geometry: BufferGeometry, triangle: number): number {
  const kept = geometry.userData[KEPT_TRIANGLES] as readonly number[] | undefined;
  return kept ? (kept[triangle] ?? triangle) : triangle;
}

/**
 * A shape drawn with the triangles of another but those given, which it shares the points of: only
 * the list of which points the triangles join is its own, so it costs little beside the shape it is
 * cut from. Its groups, the runs of triangles each material draws, are cut the same way.
 */
export function cutGeometry(source: BufferGeometry, cut: ReadonlySet<number>): BufferGeometry {
  // Made of the source's own kind, as the table's scene and a page's showcase each draw with their own build of the library.
  const cutShape = new (source.constructor as new () => BufferGeometry)();
  for (const [name, attribute] of Object.entries(source.attributes)) cutShape.setAttribute(name, attribute);
  cutShape.morphAttributes = source.morphAttributes;
  cutShape.morphTargetsRelative = source.morphTargetsRelative;
  const index = source.getIndex();
  const pointOf = (corner: number) => (index ? index.getX(corner) : corner);
  const triangles = triangleCountOf(source);
  const runs = source.groups.length > 0 ? source.groups : [{ start: 0, count: triangles * 3, materialIndex: 0 }];
  const kept: number[] = [];
  const keptTriangles: number[] = [];
  for (const run of runs) {
    const start = kept.length;
    const first = Math.floor(run.start / 3);
    const last = Math.min(triangles, Math.floor((run.start + run.count) / 3));
    for (let triangle = first; triangle < last; triangle++) {
      if (cut.has(triangle)) continue;
      kept.push(pointOf(triangle * 3), pointOf(triangle * 3 + 1), pointOf(triangle * 3 + 2));
      keptTriangles.push(triangle);
    }
    if (source.groups.length > 0) cutShape.addGroup(start, kept.length - start, run.materialIndex);
  }
  cutShape.setIndex(kept);
  cutShape.userData[KEPT_TRIANGLES] = keptTriangles;
  if (source.boundingBox) cutShape.boundingBox = source.boundingBox.clone();
  if (source.boundingSphere) cutShape.boundingSphere = source.boundingSphere.clone();
  return cutShape;
}

/**
 * Gives back what the shapes cut from others under an object hold on the graphics card of their own:
 * the list of which points their triangles join. The points themselves are the shapes' they were cut
 * from, still drawn, so they are taken off a cut shape before it is let go of, and only its own list
 * goes with it.
 */
export function releaseCutShapes(root: Object3D): void {
  for (const mesh of meshesOf(root)) {
    const geometry = mesh.geometry;
    if (!geometry.userData[KEPT_TRIANGLES]) continue;
    for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
    geometry.dispose();
  }
}
