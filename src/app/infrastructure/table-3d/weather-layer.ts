import {
  MAX_WEATHER_FALL,
  type WeatherFall,
  weatherFallCount,
  weatherFallSeeds,
  weatherFallSpanPx,
  weatherFallSquarePx,
} from '@axe/domain/tabletop/world/weather-fall';
import type { Table3dWeatherFall } from '@axe/infrastructure/table-3d/table-3d-port';
import {
  abs,
  attribute,
  cameraPosition,
  clamp,
  cos,
  cross,
  float,
  floor,
  length,
  min,
  normalize,
  positionGeometry,
  select,
  sin,
  smoothstep,
  uniform,
  uv,
  varying,
  vec3,
} from 'three/tsl';
import {
  type Camera,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  Vector3,
} from 'three/webgpu';

/** Where the drops come in the order things are drawn: after the fog in the air. */
const WEATHER_ORDER = 950;

/** How much of the square they fall over, at each edge, the drops fade out across. */
const EDGE_FADE = 0.12;

/** How much of the height they fall from, at the top, the drops fade in across. */
const TOP_FADE = 0.15;

/** How far past the edge of the board a drop has faded to nothing, in table pixels. */
const BOARD_FADE_PX = 50;

/** How far off along the way the camera looks the drops fall round, where it looks at no floor. */
const NO_FLOOR_REACH_PX = 600;

/** How far off a corner of the view counts as reaching, where it looks past the floor or at none. */
const FAR_CORNER_PX = 4000;

/**
 * The drops and flakes of rain, a storm or snow, falling through the air round where the camera
 * looks. Each is a little quad drawn where its own fixed start, carried by the time along the way
 * they fall, wraps round into a square that follows the camera, so the same drops are in the same
 * places on every screen and none of them moves on the page's side. They fade out at the edges of
 * that square, past the edges of the board and as they come out of the sky. Lightning flashes are
 * worked out by whoever draws the scene; this layer only lets things fall.
 */
export class WeatherLayer {
  readonly group = new Group();
  private readonly seconds = uniform(0);
  private readonly boxMin = uniform(new Vector3());
  private readonly boxSize = uniform(new Vector3(1, 1, 1));
  private readonly velocity = uniform(new Vector3());
  private readonly widthPx = uniform(1);
  private readonly lengthPx = uniform(1);
  private readonly swayPx = uniform(0);
  private readonly opacity = uniform(1);
  private readonly colour = uniform(new Color());
  private readonly boardSize = uniform(new Vector3(1, 1, 1));
  private readonly cameraRight = uniform(new Vector3(1, 0, 0));
  private readonly cameraUp = uniform(new Vector3(0, 1, 0));
  private readonly geometry = new InstancedBufferGeometry();
  private readonly mesh: Mesh;
  private readonly materials = new Map<WeatherFall['shape'], MeshBasicNodeMaterial>();
  private laid: Table3dWeatherFall | null = null;
  private changed = false;

  constructor() {
    const plane = new PlaneGeometry(1, 1);
    this.geometry.index = plane.index;
    this.geometry.setAttribute('position', plane.getAttribute('position'));
    this.geometry.setAttribute('uv', plane.getAttribute('uv'));
    this.geometry.setAttribute('seed', new InstancedBufferAttribute(weatherFallSeeds(MAX_WEATHER_FALL), 4));
    this.geometry.instanceCount = 0;
    this.mesh = new Mesh(this.geometry, this.materialFor('streak'));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = WEATHER_ORDER;
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  /** How many drops are falling now. */
  get shown(): number {
    return this.mesh.visible ? this.geometry.instanceCount : 0;
  }

  /** Lets the weather given fall, or none. */
  set(weather: Table3dWeatherFall | null): void {
    if (JSON.stringify(weather) === JSON.stringify(this.laid)) return;
    this.laid = weather;
    this.mesh.visible = weather !== null;
    this.changed = true;
    if (!weather) return;
    const { fall, board, ceilingPx } = weather;
    this.mesh.material = this.materialFor(fall.shape);
    this.velocity.value.set(fall.velocity.x, fall.velocity.z, fall.velocity.y);
    this.widthPx.value = fall.widthPx;
    this.lengthPx.value = fall.lengthPx;
    this.swayPx.value = fall.swayPx;
    this.opacity.value = fall.opacity;
    this.colour.value.setStyle(opaqueColourOf(fall.colour));
    this.boardSize.value.set(board.width, ceilingPx, board.depth);
    this.boxSize.value.y = Math.max(1, ceilingPx);
  }

  /**
   * Lets the drops fall to where they are at a moment, in milliseconds, round where the camera now
   * looks; answers whether anything falls.
   */
  advance(timeMs: number, camera: Camera): boolean {
    const laid = this.laid;
    if (!laid) return false;
    this.seconds.value = timeMs / 1000;
    this.follow(camera, laid);
    this.changed = true;
    return true;
  }

  /** Whether anything was laid or fell since this was last asked, which wants drawing. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  dispose(): void {
    this.geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }

  /**
   * Keeps the square the drops fall over round where the camera looks, as wide as it takes in, and no
   * wider than takes in the whole board, round the board's middle then, since none falls past it.
   */
  private follow(camera: Camera, laid: Table3dWeatherFall): void {
    camera.updateMatrixWorld();
    const eye = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    const middle = floorAt(camera, 0, 0) ?? ahead(camera, eye);
    let reach = eye.distanceTo(middle);
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const corner = floorAt(camera, x, y);
      const off = corner ? Math.hypot(corner.x - middle.x, corner.z - middle.z) : FAR_CORNER_PX;
      reach = Math.max(reach, Math.min(off, FAR_CORNER_PX) * 2);
    }
    const { width, depth } = laid.board;
    const whole = weatherFallSquarePx(Math.max(width, depth) + BOARD_FADE_PX * 2);
    const seen = weatherFallSpanPx(reach);
    const span = Math.min(seen, whole);
    const x = seen >= whole ? width / 2 : Math.min(Math.max(middle.x, 0), width);
    const z = seen >= whole ? depth / 2 : Math.min(Math.max(middle.z, 0), depth);
    this.boxMin.value.set(x - span / 2, 0, z - span / 2);
    this.boxSize.value.set(span, Math.max(1, laid.ceilingPx), span);
    this.geometry.instanceCount = weatherFallCount(laid.fall, span);
    this.cameraRight.value.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.cameraUp.value.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  }

  private materialFor(shape: WeatherFall['shape']): MeshBasicNodeMaterial {
    const kept = this.materials.get(shape);
    if (kept) return kept;
    const seed = attribute<'vec4'>('seed', 'vec4');
    const turn = seed.w.mul(Math.PI * 2);
    const sway = vec3(
      sin(this.seconds.mul(0.9).add(turn)).mul(this.swayPx),
      0,
      cos(this.seconds.mul(0.7).add(turn)).mul(this.swayPx)
    );
    const carried = seed.xyz.mul(this.boxSize).add(this.velocity.mul(this.seconds)).add(sway).sub(this.boxMin);
    const middle = this.boxMin.add(carried.sub(this.boxSize.mul(floor(carried.div(this.boxSize)))));
    const along = normalize(this.velocity);
    const toEye = normalize(cameraPosition.sub(middle));
    const across = cross(along, toEye);
    const side = select(length(across).greaterThan(0.05), normalize(across), this.cameraRight);
    const offset =
      shape === 'streak'
        ? side.mul(positionGeometry.x.mul(this.widthPx)).add(along.mul(positionGeometry.y.mul(this.lengthPx)))
        : this.cameraRight
            .mul(positionGeometry.x)
            .add(this.cameraUp.mul(positionGeometry.y))
            .mul(this.widthPx.mul(seed.w.mul(0.8).add(0.6)));
    const within = middle.sub(this.boxMin).div(this.boxSize);
    const edge = min(min(within.x, float(1).sub(within.x)), min(within.z, float(1).sub(within.z)));
    const boardEdge = min(min(middle.x, this.boardSize.x.sub(middle.x)), min(middle.z, this.boardSize.z.sub(middle.z)));
    const fade = varying(
      smoothstep(0, EDGE_FADE, edge)
        .mul(smoothstep(0, TOP_FADE, float(1).sub(within.y)))
        .mul(clamp(boardEdge.add(BOARD_FADE_PX).div(BOARD_FADE_PX), 0, 1))
        .mul(seed.w.mul(0.5).add(0.5)),
      'weatherFade'
    );
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    material.positionNode = middle.add(offset);
    material.colorNode = this.colour;
    const shapeAlpha =
      shape === 'streak'
        ? float(1)
            .sub(abs(uv().x.mul(2).sub(1)))
            .mul(smoothstep(0, 0.6, uv().y))
        : smoothstep(0.5, 0.15, length(uv().sub(0.5)));
    material.opacityNode = shapeAlpha.mul(fade).mul(this.opacity);
    this.materials.set(shape, material);
    return material;
  }
}

/**
 * A colour as written, its alpha left off where it is written as eight hex digits, which a colour
 * read for the drops takes no alpha from; any other way of writing one is read as it is.
 */
export function opaqueColourOf(colour: string): string {
  const hex = /^#([0-9a-f]{6})[0-9a-f]{2}$/i.exec(colour.trim());
  return hex ? `#${hex[1]}` : colour.trim();
}

/** Where the line through a point of the view, from -1 to 1 either way, meets the floor in front of the camera, or null. */
function floorAt(camera: Camera, x: number, y: number): Vector3 | null {
  const near = new Vector3(x, y, -1).unproject(camera);
  const far = new Vector3(x, y, 1).unproject(camera);
  const direction = far.sub(near);
  if (!(direction.y < -1e-6)) return null;
  const along = -near.y / direction.y;
  if (!(along > 0)) return null;
  return near.add(direction.multiplyScalar(along));
}

/** A point some way ahead of the camera, along the way it looks. */
function ahead(camera: Camera, eye: Vector3): Vector3 {
  const forward = new Vector3();
  camera.getWorldDirection(forward);
  return eye.clone().add(forward.multiplyScalar(NO_FLOOR_REACH_PX));
}
