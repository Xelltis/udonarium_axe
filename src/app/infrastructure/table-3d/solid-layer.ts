import type { FlatPoint, FootprintPart } from '@axe/domain/tabletop/solid/range-footprint';
import type { Solid } from '@axe/domain/tabletop/solid/solid';
import { edgeKey, sharedEdgeKeys, solidWireSegments, WireSegment } from '@axe/domain/tabletop/solid/solid-wire';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';
import type { TableWorldGuide, TableWorldSolid } from '@axe/domain/tabletop/world/table-solids';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line2NodeMaterial,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';

/**
 * Where the ranges standing up off the table come in the order things are drawn: after every piece
 * standing and lying on the table, which are seen through them, and before the fog hanging in the
 * air and the weather, which are seen over them.
 */
const SOLID_ORDER = 800;

/** How many sides a round solid is drawn with round, enough that it reads as round close up. */
const ROUND_SIDES = 48;

/** How wide a solid's lines are drawn, in screen pixels, wide enough to read over any board. */
const WIRE_WIDTH_PX = 2;

/** A solid drawn: its faces and its edges, and what it was drawn from, to tell when to draw it again. */
interface Drawn {
  readonly key: string;
  readonly group: Group;
  readonly faces: Mesh;
  readonly edges: LineSegments2;
}

/**
 * The ranges standing up off the table, each its faces filled in faintly in its range's fill colour
 * and its outline drawn over it in its border colour (`solidWireSegments`), rings and lines over a
 * round one: hidden by the ground and the blocks in front of them, and leaving what stands behind and
 * within them to be seen. A solid is drawn again only as it changes.
 */
export class SolidLayer {
  readonly group = new Group();
  private readonly drawn = new Map<string, Drawn>();
  private readonly guides = new Map<string, { key: string; lines: Group }>();
  /** What was laid last, which is laid again only once it is given anew. */
  private laidSolids: readonly TableWorldSolid[] | null = null;
  private laidGuides: readonly TableWorldGuide[] | null = null;

  /** Draws these guides and takes away any drawn before that are not among them. */
  setGuides(guides: readonly TableWorldGuide[]): void {
    if (guides === this.laidGuides) return;
    this.laidGuides = guides;
    const wanted = new Set<string>();
    for (const guide of guides) {
      wanted.add(guide.id);
      const key = JSON.stringify(guide);
      const drawn = this.guides.get(guide.id);
      if (drawn?.key === key) continue;
      if (drawn) this.dropGuide(guide.id);
      const lines = new Group();
      if (guide.outline) {
        const under = wideLines(guide.segments, guide.outline.colour, guide.outline.opacity, guide.outline.widthPx);
        under.renderOrder = SOLID_ORDER + 2;
        lines.add(under);
      }
      const over = wideLines(guide.segments, guide.colour, guide.opacity, guide.widthPx);
      over.renderOrder = SOLID_ORDER + 3;
      lines.add(over);
      this.group.add(lines);
      this.guides.set(guide.id, { key, lines });
    }
    for (const id of [...this.guides.keys()]) if (!wanted.has(id)) this.dropGuide(id);
  }

  /** How many guides are drawn now. */
  get guideCount(): number {
    return this.guides.size;
  }

  private dropGuide(id: string): void {
    const drawn = this.guides.get(id);
    if (!drawn) return;
    this.group.remove(drawn.lines);
    for (const child of drawn.lines.children as LineSegments2[]) {
      child.geometry.dispose();
      (child.material as Line2NodeMaterial).dispose();
    }
    this.guides.delete(id);
  }

  /** Draws these solids and takes away any drawn before that are not among them. */
  set(solids: readonly TableWorldSolid[]): void {
    if (solids === this.laidSolids) return;
    this.laidSolids = solids;
    const wanted = new Set<string>();
    for (const solid of solids) {
      wanted.add(solid.id);
      const key = JSON.stringify(solid);
      const drawn = this.drawn.get(solid.id);
      if (drawn?.key === key) continue;
      if (drawn) this.drop(solid.id, drawn);
      this.draw(solid, key);
    }
    for (const [id, drawn] of this.drawn) if (!wanted.has(id)) this.drop(id, drawn);
  }

  /** How many solids are drawn now. */
  get count(): number {
    return this.drawn.size;
  }

  /** Lets go of every solid and every guide drawn. */
  dispose(): void {
    for (const [id, drawn] of this.drawn) this.drop(id, drawn);
    for (const id of [...this.guides.keys()]) this.dropGuide(id);
  }

  private draw(solid: TableWorldSolid, key: string): void {
    const geometry = geometryOf(solid.solid);
    const faces = new Mesh(
      geometry,
      new MeshBasicNodeMaterial({
        color: new Color(solid.fill),
        transparent: true,
        opacity: solid.fillOpacity,
        depthWrite: false,
        side: DoubleSide,
      })
    );
    faces.renderOrder = SOLID_ORDER;
    const edges = wideLines(solidWireSegments(solid.solid), solid.edge, solid.edgeOpacity);
    edges.renderOrder = SOLID_ORDER + 1;
    const group = new Group();
    group.add(faces, edges);
    this.group.add(group);
    this.drawn.set(solid.id, { key, group, faces, edges });
  }

  private drop(id: string, drawn: Drawn): void {
    this.group.remove(drawn.group);
    drawn.faces.geometry.dispose();
    (drawn.faces.material as MeshBasicNodeMaterial).dispose();
    drawn.edges.geometry.dispose();
    (drawn.edges.material as Line2NodeMaterial).dispose();
    this.drawn.delete(id);
  }
}

/** Lines drawn as wide as asked whatever their distance, {@link WIRE_WIDTH_PX} where not asked. */
function wideLines(
  segments: readonly WireSegment[],
  colour: string,
  opacity: number,
  widthPx: number = WIRE_WIDTH_PX
): LineSegments2 {
  const geometry = new LineSegmentsGeometry().setPositions(
    segments.flatMap(([a, b]) => [a.x, a.z, a.y, b.x, b.z, b.y])
  );
  return new LineSegments2(
    geometry,
    new Line2NodeMaterial({
      color: new Color(colour),
      linewidth: widthPx,
      worldUnits: false,
      transparent: true,
      opacity,
      depthWrite: false,
    })
  );
}

/** A point of the table in the scene's own axes, which stand the table's up and its south the other way round. */
function scenePoint(point: Vec3): Vector3 {
  return new Vector3(point.x, point.z, point.y);
}

/** The shape a solid is drawn with, in the scene's own axes. */
export function geometryOf(solid: Solid): BufferGeometry {
  switch (solid.kind) {
    case 'sphere':
      return new SphereGeometry(solid.radius, ROUND_SIDES, ROUND_SIDES / 2).translate(
        solid.centre.x,
        solid.centre.z,
        solid.centre.y
      );
    case 'cone': {
      const geometry = new ConeGeometry(solid.endRadius, solid.length, ROUND_SIDES).translate(0, -solid.length / 2, 0);
      const turn = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), scenePoint(solid.frame.way));
      const apex = scenePoint(solid.apex);
      return geometry.applyMatrix4(new Matrix4().compose(apex, turn, new Vector3(1, 1, 1)));
    }
    case 'beam': {
      const width = solid.halfWidth * 2;
      const geometry = new BoxGeometry(width, solid.length, width).translate(0, solid.length / 2, 0);
      const basis = new Matrix4().makeBasis(
        scenePoint(solid.frame.side),
        scenePoint(solid.frame.way),
        scenePoint(solid.frame.lift)
      );
      const start = scenePoint(solid.start);
      basis.setPosition(start);
      return geometry.applyMatrix4(basis);
    }
    case 'column':
      return columnGeometry(solid.parts, solid.bottom, solid.top);
  }
}

/**
 * The shape of a column: each part raised from the bottom to the top, its top and bottom filled in,
 * and its sides stood up only where no other part lies against them, so that a range of its own
 * cells is drawn as one block with no walls between its cells.
 */
function columnGeometry(parts: readonly FootprintPart[], bottom: number, top: number): BufferGeometry {
  const height = Math.max(0, top - bottom);
  const circles = parts.filter((part) => part.kind === 'circle');
  const polygons = parts.flatMap((part) => (part.kind === 'polygon' ? [part.corners] : []));
  const positions: number[] = [];
  const shared = sharedEdgeKeys(polygons);
  for (const corners of polygons) {
    for (let i = 1; i + 1 < corners.length; i++) {
      for (const z of [bottom, top]) {
        positions.push(...flat(corners[0], z), ...flat(corners[i], z), ...flat(corners[i + 1], z));
      }
    }
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      if (shared.has(edgeKey(a, b))) continue;
      positions.push(...flat(a, bottom), ...flat(b, bottom), ...flat(b, top));
      positions.push(...flat(a, bottom), ...flat(b, top), ...flat(a, top));
    }
  }
  for (const circle of circles) {
    const cylinder = new CylinderGeometry(circle.radius, circle.radius, height, ROUND_SIDES)
      .translate(circle.centre.x, bottom + height / 2, circle.centre.y)
      .toNonIndexed();
    positions.push(...(cylinder.getAttribute('position').array as Float32Array));
    cylinder.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

/** A corner of a part at a height, in the scene's own axes. */
function flat(point: FlatPoint, z: number): [number, number, number] {
  return [point.x, z, point.y];
}
