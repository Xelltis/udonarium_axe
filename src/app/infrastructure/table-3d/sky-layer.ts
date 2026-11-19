import type { SkyDome, SkyWay } from '@axe/domain/tabletop/world/sky-dome';
import { sceneDirection } from '@axe/infrastructure/three-kit/board-space';
import {
  abs,
  cameraPosition,
  clamp,
  dot,
  float,
  floor,
  hash,
  max,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import {
  BackSide,
  Color,
  FogExp2,
  Group,
  type Material,
  Mesh,
  MeshBasicNodeMaterial,
  MeshLambertNodeMaterial,
  type Node,
  Path,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';

/** How far off the eye the sky is drawn, in table pixels: well inside how far the camera draws. */
const SKY_RADIUS_PX = 40000;
/** How far out from the board's middle the ground runs to the horizon, in table pixels. */
const GROUND_REACH_PX = 38000;
/** How far under the board the ground beyond it lies, so the board's own picture always lies over it. */
const GROUND_DROP_PX = 0.5;
/**
 * How far beyond the board the haze is taken to run, in table pixels, which is also how far across
 * a scene with no board is taken to be.
 */
const HAZE_REACH_PX = 3000;
/**
 * How many times that breadth off the haze has thickened to all but a third of the view. Thin enough
 * that the board itself is all but clear of it, which a pale sky by day would otherwise wash out:
 * the ground beyond fades into the horizon of its own accord.
 */
const HAZE_DEPTH = 6;
/**
 * Where the ground beyond the board starts to fade into the horizon's colour, and where it has, in
 * boards across from the board's middle.
 */
const GROUND_FADES_FROM = 0.75;
const GROUND_FADES_TO = 7;
/** Where the sky comes in the order things are drawn: before everything, which is all drawn over it. */
const SKY_ORDER = -100;
const GROUND_ORDER = -50;

/** How many stars a way of the sky is cut into, and how few of those hold one. */
const STAR_CELLS = 260;
const STAR_SHARE = 0.0035;
/** How near the way to the sun or the moon a point of the sky has to be to be its disc, as the cosine of the angle. */
const SUN_DISC = 0.99985;
const MOON_DISC = 0.9997;

/**
 * How much of the sky the ground beyond the board gives back, looking straight down and looking along it:
 * a plain under the sky takes its colour, the more the further off it is looked at.
 */
const GROUND_REFLECTS_BELOW = 0.55;
const GROUND_REFLECTS_ALONG = 0.85;

const SUN_COLOUR = '#fff6dc';
const MOON_COLOUR = '#e8ecff';

/**
 * The sky over a table and the ground running out beyond the board to the horizon, which the camera
 * sees where it looks past the board: the sky's colour overhead fading to the horizon's, the glow round
 * a sun near the horizon, the sun and the moon, the stars, and a haze over everything far off, which
 * the ground beyond the board fades into. The sky stands round the eye wherever the eye goes. The
 * ground is lit by the sky as the board is and gives back the colour of the sky above it, so that
 * looked down on from above it still tells the hour, and fades into the horizon's colour as it runs
 * off; it lies outside the board, which the veil is read over.
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
  private readonly dome: Mesh;
  private ground: Mesh | null = null;
  private groundKey = '';
  private readonly groundColour = new Color();
  private readonly groundTint = uniform(new Color());
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
   * Draws the sky as it is at an hour, with the ground running out from round the board, or takes both
   * away with null. Answers the haze the scene is to be drawn with, or null for none.
   */
  set(sky: SkyDome | null, board: { x: number; y: number; width: number; height: number } | null): FogExp2 | null {
    this.laid = sky;
    this.dome.visible = sky !== null;
    this.placeGround(sky ? board : null);
    if (!sky) return null;
    this.zenith.value.set(sky.zenith);
    this.horizon.value.set(sky.horizon);
    this.glow.value.set(sky.glow);
    this.glowStrength.value = sky.glowStrength;
    this.sun.value.copy(sceneWay(sky.sun));
    this.moon.value.copy(sceneWay(sky.moon));
    this.stars.value = sky.stars;
    this.groundColour.set(sky.ground);
    this.groundTint.value.copy(this.groundColour);
    (this.ground?.material as MeshLambertNodeMaterial | undefined)?.color.copy(this.groundColour);
    const across = board ? Math.hypot(board.width, board.height) : HAZE_REACH_PX;
    this.haze.color.set(sky.horizon);
    this.haze.density = 1 / (HAZE_DEPTH * (across + HAZE_REACH_PX));
    return this.haze;
  }

  /** Stands the sky round the eye, in the scene's space. */
  follow(eye: Vector3): void {
    this.dome.position.copy(eye);
  }

  /** Takes the ground away and lets go of the dome's shape and material. */
  dispose(): void {
    this.placeGround(null);
    this.dome.geometry.dispose();
    (this.dome.material as Material).dispose();
  }

  /** The ground beyond the board: a wide plane round it with the board's box cut out, just under it. */
  private placeGround(board: { x: number; y: number; width: number; height: number } | null): void {
    const key = board ? `${board.x},${board.y},${board.width},${board.height}` : '';
    if (key === this.groundKey) return;
    this.groundKey = key;
    if (this.ground) {
      this.group.remove(this.ground);
      this.ground.geometry.dispose();
      (this.ground.material as Material).dispose();
      this.ground = null;
    }
    if (!board) return;
    const middle = { x: board.x + board.width / 2, y: board.y + board.height / 2 };
    const outline = new Shape()
      .moveTo(middle.x - GROUND_REACH_PX, middle.y - GROUND_REACH_PX)
      .lineTo(middle.x + GROUND_REACH_PX, middle.y - GROUND_REACH_PX)
      .lineTo(middle.x + GROUND_REACH_PX, middle.y + GROUND_REACH_PX)
      .lineTo(middle.x - GROUND_REACH_PX, middle.y + GROUND_REACH_PX)
      .closePath();
    outline.holes.push(
      new Path()
        .moveTo(board.x, board.y)
        .lineTo(board.x, board.y + board.height)
        .lineTo(board.x + board.width, board.y + board.height)
        .lineTo(board.x + board.width, board.y)
        .closePath()
    );
    const geometry = new ShapeGeometry(outline);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, -GROUND_DROP_PX, 0);
    const across = Math.hypot(board.width, board.height);
    const fadesOut = smoothstep(
      float(across * GROUND_FADES_FROM),
      float(across * GROUND_FADES_TO),
      positionWorld.xz.sub(vec2(middle.x, middle.y)).length()
    );
    const near = float(1).sub(fadesOut);
    const material = new MeshLambertNodeMaterial({ color: this.groundColour, side: BackSide });
    material.colorNode = this.groundTint.mul(float(1).sub(this.groundReflects())).mul(near);
    material.emissiveNode = this.reflection().mul(near).add(this.horizon.mul(fadesOut));
    this.ground = new Mesh(geometry, material);
    this.ground.renderOrder = GROUND_ORDER;
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
  }

  /** The sun and the moon, where a point of the dome shows them. */
  private bodies() {
    const way = normalize(positionLocal);
    const sunShows = smoothstep(-0.03, 0.02, this.sun.y);
    const sunDisc = smoothstep(SUN_DISC, SUN_DISC + 0.00005, max(dot(way, this.sun), 0)).mul(sunShows);
    const moonShows = smoothstep(-0.03, 0.02, this.moon.y).mul(this.stars.mul(0.7).add(0.3));
    const moonDisc = smoothstep(MOON_DISC, MOON_DISC + 0.0001, max(dot(way, this.moon), 0)).mul(moonShows);
    return this.sunColour.mul(sunDisc).add(this.moonColour.mul(moonDisc.mul(0.5)));
  }

  /**
   * The way the eye looks at a point of the ground, turned over as the ground turns it back up: the
   * way to the point of the sky the ground there gives back.
   */
  private reflectedWay() {
    const looking = normalize(positionWorld.sub(cameraPosition));
    return vec3(looking.x, looking.y.negate(), looking.z);
  }

  /** How much of the sky the ground gives back where it is looked at: more the further along it the eye looks. */
  private groundReflects() {
    const along = float(1).sub(abs(normalize(positionWorld.sub(cameraPosition)).y));
    return mix(float(GROUND_REFLECTS_BELOW), float(GROUND_REFLECTS_ALONG), pow(clamp(along, 0, 1), 3));
  }

  /** The colour of the sky the ground gives back, its glow round a low sun with it but not the sun, the moon or the stars. */
  private reflection() {
    return this.skyBase(this.reflectedWay()).mul(this.groundReflects());
  }

  /** The colour of the sky the way a point of the dome lies from its middle. */
  private skyColour() {
    const way = normalize(positionLocal);
    const up = way.y;
    const cell = floor(way.mul(STAR_CELLS)).add(STAR_CELLS + 1);
    const seed = cell.x.add(cell.y.mul(STAR_CELLS * 2 + 3)).add(cell.z.mul((STAR_CELLS * 2 + 3) ** 2));
    const star = smoothstep(1 - STAR_SHARE, 1, hash(seed) as Node<'float'>)
      .mul(this.stars)
      .mul(clamp(up.mul(3), 0, 1));
    return this.skyBase(way)
      .add(this.bodies())
      .add(vec3(star, star, star));
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
