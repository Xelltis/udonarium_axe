import type { TableWorldSeaFloor, TableWorldWater, WaterPart } from '@axe/domain/tabletop/world/table-water';
import {
  abs,
  attribute,
  float,
  fract,
  max,
  mix,
  positionWorld,
  sin,
  smoothstep,
  sRGBTransferEOTF,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshLambertNodeMaterial,
  type Node,
} from 'three/webgpu';

/**
 * Where the water comes in the order things are drawn: its floor after the board and the blocks and
 * before the grid, as the page lays it under the grid; its surface, sides and shore after everything
 * else, so what stands in the water is seen through it below the surface.
 */
const FLOOR_ORDER = 0.5;
const SURFACE_ORDER = 1000;
const SHORE_ORDER = 1001;

/** Draws a face laid over another in front of it, past the depth's rounding. */
const PULLED_FORWARD = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };

/** How many cells one repeat of the net of light spans on the floor, as the page draws it. */
const CAUSTIC_CELLS = 2.6;
/**
 * The same over the floor of a map under water, larger: the surface is far overhead, and over a
 * whole board a fine net reads as a pattern printed on it.
 */
const SEA_CAUSTIC_CELLS = 3.4;
/** How many cells one repeat of the glints spans on the surface. */
const GLINT_CELLS = 5.7;
/** How many seconds a wave takes to run in to the shore. */
const WAVE_SECONDS = 4;

type Taking = 'lit' | 'unlit';

/**
 * The water on the table: its surfaces coloured by the depths under them and glinting, its floors
 * darkened and crossed by a moving net of light, its sides where it stands over lower ground, and the
 * waves breaking on its shore. All of it is built from the triangles the table's water is made into,
 * and built again only when those change; it moves by itself while there is any and it may move.
 */
export class WaterLayer {
  readonly group = new Group();
  private readonly seconds = uniform(0);
  private readonly cellPx = uniform(50);
  private laid: TableWorldWater | null = null;
  private laidBoard = '';
  private meshes: Mesh[] = [];
  private changed = false;

  constructor(private readonly dress: (material: Material, taking: Taking) => void) {}

  /** How many parts of the water are drawn. */
  get shown(): number {
    return this.meshes.length;
  }

  /**
   * Lays the water out, the floor of a map under water over the board's shape, made anew when it is
   * asked for; builds it again only when the water or the board changed.
   */
  set(water: TableWorldWater, board: (() => BufferGeometry) | null, boardKey: string): void {
    if (water === this.laid && boardKey === this.laidBoard) return;
    this.laid = water;
    this.laidBoard = boardKey;
    this.clear();
    this.cellPx.value = water.cellPx;
    this.add(water.surface, this.surfaceMaterial(), SURFACE_ORDER, (geometry) =>
      geometry.setAttribute('flow', new Float32BufferAttribute(water.flow, 2))
    );
    this.add(water.floor, this.floorMaterial(CAUSTIC_CELLS), FLOOR_ORDER);
    if (water.seaFloor && board) this.addSeaFloor(water.seaFloor, board());
    this.add(water.sides, this.sideMaterial(), SURFACE_ORDER);
    this.add(water.shore, this.shoreMaterial(), SHORE_ORDER);
    this.changed = true;
  }

  /** Moves the water to where it is at a moment, in milliseconds; answers whether it moves by itself. */
  advance(timeMs: number): boolean {
    if (!this.laid?.moving || this.meshes.length === 0) return false;
    this.seconds.value = timeMs / 1000;
    this.changed = true;
    return true;
  }

  /** Whether anything was built or moved since this was last asked, which wants drawing. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  dispose(): void {
    this.clear();
  }

  private add(
    part: WaterPart,
    material: MeshLambertNodeMaterial,
    order: number,
    more?: (geometry: BufferGeometry) => void
  ): void {
    if (part.points.length === 0) {
      material.dispose();
      return;
    }
    const geometry = new BufferGeometry();
    const points = new Float32Array(part.points.length);
    for (let i = 0; i < part.points.length; i += 3) {
      points[i] = part.points[i];
      points[i + 1] = part.points[i + 2];
      points[i + 2] = part.points[i + 1];
    }
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(part.colours, 4));
    geometry.setAttribute('extra', new Float32BufferAttribute(part.extra, 1));
    more?.(geometry);
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.meshes.push(mesh);
  }

  /** Lays the floor of a map under water over the board's shape, one colour all over. */
  private addSeaFloor(floor: TableWorldSeaFloor, geometry: BufferGeometry): void {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute(
      'color',
      new Float32BufferAttribute(
        new Float32Array(count * 4).map((_, i) => floor.colour[i % 4]),
        4
      )
    );
    geometry.setAttribute('extra', new Float32BufferAttribute(new Float32Array(count).fill(floor.net), 1));
    const mesh = new Mesh(geometry, this.floorMaterial(SEA_CAUSTIC_CELLS));
    mesh.renderOrder = FLOOR_ORDER;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.meshes.push(mesh);
  }

  private clear(): void {
    for (const mesh of this.meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
    this.meshes = [];
  }

  /** The colour a point is laid in, from sRGB, and how opaque. */
  private colour() {
    const colour = attribute('color', 'vec4');
    return { rgb: vec3(sRGBTransferEOTF(colour.rgb) as unknown as ReturnType<typeof vec3>), a: colour.a };
  }

  /** The surface: its colour, with the sky glinting on the ripples as they drift with the flow. */
  private surfaceMaterial(): MeshLambertNodeMaterial {
    const material = this.material(true);
    const { rgb, a } = this.colour();
    const flow = attribute('flow', 'vec2');
    const at = vec2(positionWorld.x, positionWorld.z)
      .div(this.cellPx.mul(GLINT_CELLS))
      .sub(flow.mul(this.seconds).div(GLINT_CELLS));
    const glint = ripples(at, this.seconds).pow(6).mul(attribute('extra', 'float'));
    material.colorNode = vec4(mix(rgb, vec3(1, 1, 1), glint), max(a, glint));
    this.dress(material, 'lit');
    return material;
  }

  /** The floor: the colour of the depths, crossed by the net of light the surface throws down. */
  private floorMaterial(netCells: number): MeshLambertNodeMaterial {
    const material = this.material(false);
    Object.assign(material, PULLED_FORWARD);
    const { rgb, a } = this.colour();
    const at = vec2(positionWorld.x, positionWorld.z).div(this.cellPx.mul(netCells));
    const net = ripples(at, this.seconds).pow(4).mul(attribute('extra', 'float'));
    material.colorNode = vec4(mix(rgb, vec3(1, 1, 1), net), max(a, net));
    this.dress(material, 'lit');
    return material;
  }

  private sideMaterial(): MeshLambertNodeMaterial {
    const material = this.material(true);
    const { rgb, a } = this.colour();
    material.colorNode = vec4(rgb, a);
    this.dress(material, 'lit');
    return material;
  }

  /** The shore: foam at the land, and waves running in to it from the open water and dying on it. */
  private shoreMaterial(): MeshLambertNodeMaterial {
    const material = this.material(true);
    const away = attribute('extra', 'float');
    const wave = fract(away.add(this.seconds.div(WAVE_SECONDS)));
    const crest = smoothstep(0.75, 0.95, wave).mul(float(1).sub(smoothstep(0.95, 1, wave)));
    const foam = float(1)
      .sub(smoothstep(0, 0.35, away))
      .mul(0.55);
    const shown = max(foam, crest.mul(float(1).sub(away)).mul(0.6));
    material.colorNode = vec4(vec3(1, 1, 1), shown);
    this.dress(material, 'lit');
    return material;
  }

  private material(pulled: boolean): MeshLambertNodeMaterial {
    return new MeshLambertNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      ...(pulled ? PULLED_FORWARD : {}),
    });
  }
}

/**
 * A net of bright lines over the water, from 0 to 1, that wanders as time goes on: two waves running
 * across each other, bent by a third, brightest where they cancel out.
 */
function ripples(at: Node<'vec2'>, seconds: Node<'float'>) {
  const turn = Math.PI * 2;
  const bend = sin(at.y.mul(turn * 1.3).add(seconds.mul(0.4)));
  const one = sin(at.x.mul(turn).add(bend).add(seconds.mul(0.6)));
  const two = sin(
    at.y
      .mul(turn)
      .add(sin(at.x.mul(turn * 1.7).sub(seconds.mul(0.3))))
      .add(seconds.mul(0.5))
  );
  return float(1)
    .sub(abs(one.add(two)).mul(0.5))
    .clamp(0, 1);
}
