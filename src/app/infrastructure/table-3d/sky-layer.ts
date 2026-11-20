import type { SkyDome, SkyWay } from '@axe/domain/tabletop/world/sky-dome';
import { skyLevelTurn } from '@axe/infrastructure/table-3d/sky-level';
import { sceneDirection } from '@axe/infrastructure/three-kit/board-space';
import {
  abs,
  clamp,
  dot,
  float,
  floor,
  hash,
  length,
  max,
  mix,
  normalize,
  positionLocal,
  pow,
  smoothstep,
  step,
  uniform,
  vec3,
} from 'three/tsl';
import {
  BackSide,
  type Camera,
  Color,
  FogExp2,
  Group,
  type Material,
  Matrix3,
  Mesh,
  MeshBasicNodeMaterial,
  type Node,
  PerspectiveCamera,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';

/** How far off the eye the sky is drawn, in table pixels: well inside how far the camera draws. */
const SKY_RADIUS_PX = 40000;
/**
 * How far beyond the board the haze is taken to run, in table pixels, which is also how far across
 * a scene with no board is taken to be.
 */
const HAZE_REACH_PX = 3000;
/**
 * How many times that breadth off the haze has thickened to all but a third of the view. Thin enough
 * that the board itself is all but clear of it, which a pale sky by day would otherwise wash out.
 */
const HAZE_DEPTH = 6;
/** Where the sky comes in the order things are drawn: before everything, which is all drawn over it. */
const SKY_ORDER = -100;

/**
 * How many stars a way of the sky is cut into, and how few of those hold one: of the cells a star lies
 * wholly inside of, about seven in ten of those the sky passes through, so as many stars show as one
 * in every hundred and sixty-seven cells.
 */
const STAR_CELLS = 260;
const STAR_SHARE = 0.0086;
/** How far out from its point a star shows, in cells: a small round light, not the whole cell. */
const STAR_RADIUS = 0.22;
/** How near the way to the sun or the moon a point of the sky has to be to be its disc, as the cosine of the angle. */
const SUN_DISC = 0.99985;
const MOON_DISC = 0.9997;

/** Half how much a camera that draws no perspective is taken to see up and down, in radians. */
const FLAT_HALF_VIEW = (8 * Math.PI) / 180;

const looking = new Vector3();
const sideways = new Vector3();

const SUN_COLOUR = '#fff6dc';
const MOON_COLOUR = '#e8ecff';

/**
 * The sky round a table, which the camera sees wherever it looks past the board: the sky's colour
 * overhead fading to the horizon's, the glow round a sun near the horizon, the sun and the moon, the
 * stars, and a haze over everything far off. Looked steeply down on, the table stands before the
 * sky as it is seen looking at the horizon, the horizon low in the view and the sky of the hour over
 * it, its sun, moon and stars where they are the way the camera faces; looked at more nearly level,
 * the sky stands where it is, over the horizon the ground meets. Under the horizon is its haze,
 * darker the further down. The sky stands round the eye wherever the eye goes.
 */
export class SkyLayer {
  readonly group = new Group();
  private readonly zenith = colourUniform();
  private readonly horizon = colourUniform();
  private readonly glow = colourUniform();
  private readonly glowStrength = uniform(0);
  private readonly sun = uniform(new Vector3(0, 1, 0));
  private readonly moon = uniform(new Vector3(0, -1, 0));
  private readonly stars = uniform(0);
  /** The turn from the way the eye looks at a point of the sky to the way the sky is drawn there. */
  private readonly level = uniform(new Matrix3());
  private readonly dome: Mesh;
  private laid: SkyDome | null = null;
  private readonly sunColour = uniform(new Color(SUN_COLOUR));
  private readonly moonColour = uniform(new Color(MOON_COLOUR));
  /**
   * The haze the scene is drawn with under the sky, kept one and the same as the hour goes by: a
   * scene given another fog builds every material it draws again, which held the page up for most
   * of half a second at every turn of the clock.
   */
  private readonly haze = new FogExp2(0x000000, 0);

  constructor() {
    const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, depthTest: false });
    material.fog = false;
    material.colorNode = this.skyColour();
    this.dome = new Mesh(new SphereGeometry(SKY_RADIUS_PX, 48, 24), material);
    this.dome.renderOrder = SKY_ORDER;
    this.dome.frustumCulled = false;
    this.dome.visible = false;
    this.group.add(this.dome);
  }

  /** Whether a sky is drawn. */
  get shown(): boolean {
    return this.laid !== null;
  }

  /**
   * Draws the sky as it is at an hour round the board, or takes it away with null. Answers the haze the
   * scene is to be drawn with, or null for none.
   */
  set(sky: SkyDome | null, board: { x: number; y: number; width: number; height: number } | null): FogExp2 | null {
    this.laid = sky;
    this.dome.visible = sky !== null;
    if (!sky) return null;
    this.zenith.value.set(sky.zenith);
    this.horizon.value.set(sky.horizon);
    this.glow.value.set(sky.glow);
    this.glowStrength.value = sky.glowStrength;
    this.sun.value.copy(sceneWay(sky.sun));
    this.moon.value.copy(sceneWay(sky.moon));
    this.stars.value = sky.stars;
    const across = board ? Math.hypot(board.width, board.height) : HAZE_REACH_PX;
    this.haze.color.set(sky.horizon);
    this.haze.density = 1 / (HAZE_DEPTH * (across + HAZE_REACH_PX));
    return this.haze;
  }

  /**
   * Stands the sky round the eye, in the scene's space, and turns it for the way the camera looks, so
   * that a table looked steeply down on stands before the sky as seen looking at the horizon. An eye
   * among the pieces (`amongPieces`) sees the sky as it stands, its horizon where the world's is, as
   * does one with no camera to look by.
   */
  follow(eye: Vector3, camera?: Camera, amongPieces = false): void {
    this.dome.position.copy(eye);
    if (!camera || amongPieces) {
      this.level.value.identity();
      return;
    }
    camera.getWorldDirection(looking);
    sideways.setFromMatrixColumn(camera.matrixWorld, 0);
    const halfView = camera instanceof PerspectiveCamera ? (camera.fov * Math.PI) / 360 : FLAT_HALF_VIEW;
    skyLevelTurn(looking, sideways, halfView, this.level.value);
  }

  /** Lets go of the dome's shape and material. */
  dispose(): void {
    this.dome.geometry.dispose();
    (this.dome.material as Material).dispose();
  }

  /** The sun and the moon, where a point of the dome the sky is drawn the way `way` from shows them. */
  private bodies(way: Node<'vec3'>) {
    const sunShows = smoothstep(-0.03, 0.02, this.sun.y);
    const sunDisc = smoothstep(SUN_DISC, SUN_DISC + 0.00005, max(dot(way, this.sun), 0)).mul(sunShows);
    const moonShows = smoothstep(-0.03, 0.02, this.moon.y).mul(this.stars.mul(0.7).add(0.3));
    const moonDisc = smoothstep(MOON_DISC, MOON_DISC + 0.0001, max(dot(way, this.moon), 0)).mul(moonShows);
    return this.sunColour.mul(sunDisc).add(this.moonColour.mul(moonDisc.mul(0.5)));
  }

  /**
   * The colour of the sky the way a point of the dome lies from its middle. A few of the cells the sky
   * is cut into hold a star, a small round light at the cell's middle as it lies on the sky, and only
   * where all of it lies within its own cell, which alone draws it, so no star is cut off along the
   * cell's side. The stars are over the horizon only: a night sky starred under the board as well would
   * read as the depths of space.
   */
  private skyColour() {
    const way = this.drawnWay();
    const up = way.y;
    const scaled = way.mul(STAR_CELLS);
    const corner = floor(scaled);
    const cell = corner.add(STAR_CELLS + 1);
    const seed = cell.x.add(cell.y.mul(STAR_CELLS * 2 + 3)).add(cell.z.mul((STAR_CELLS * 2 + 3) ** 2));
    const point = normalize(corner.add(0.5)).mul(STAR_CELLS);
    const round = float(1).sub(smoothstep(STAR_RADIUS * 0.4, STAR_RADIUS, length(scaled.sub(point))));
    const off = abs(point.sub(corner.add(0.5)));
    const whole = float(1).sub(step(0.5 - STAR_RADIUS, max(off.x, max(off.y, off.z))));
    const star = smoothstep(1 - STAR_SHARE, 1, hash(seed) as Node<'float'>)
      .mul(round)
      .mul(whole)
      .mul(this.stars)
      .mul(clamp(up.mul(3), 0, 1));
    return this.skyBase(way)
      .add(this.bodies(way))
      .add(vec3(star, star, star));
  }

  /** The way the sky is drawn at a point of the dome: the way from its middle, turned as the camera looks. */
  private drawnWay() {
    return normalize(this.level.mul(normalize(positionLocal)));
  }

  /** The sky's own colour a way from the eye: overhead fading to the horizon, darker below it, with the glow round a low sun. */
  private skyBase(way: Node<'vec3'>) {
    const up = way.y;
    const height = pow(clamp(up, 0, 1), 0.45);
    const above = mix(this.horizon, this.zenith, height);
    const below = mix(this.horizon, this.horizon.mul(0.55), clamp(up.negate().mul(4), 0, 1));
    const base = mix(below, above, smoothstep(-0.02, 0.02, up));
    const towardsSun = max(dot(way, this.sun), 0);
    const glow = this.glow.mul(this.glowStrength.mul(pow(towardsSun, 6)).mul(float(1).sub(height)));
    return base.add(glow);
  }
}

function colourUniform() {
  return uniform(new Color());
}

/** A way of the board as the scene's, of unit length. */
function sceneWay(way: SkyWay): Vector3 {
  return sceneDirection(way).normalize();
}
