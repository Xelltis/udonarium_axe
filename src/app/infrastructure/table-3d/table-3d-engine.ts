import { LONG_FRAME_MS } from '@axe/core/util/held-clock';
import type { DiceMaterial } from '@axe/domain/dice/dice-3d/dice-look';
import { skyAmbienceFlash } from '@axe/domain/effect/ambience/ambience-sky';
import { MAX_EFFECT_LIGHTS } from '@axe/domain/effect/effect-light';
import type { EffectFrame, EffectGround } from '@axe/domain/effect/scene/effect-scene';
import { cameraDepthOver } from '@axe/domain/tabletop/camera/camera-depth';
import { GROUND_PAINT_LAYERS } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { TABLE_PERSPECTIVE_PX } from '@axe/domain/tabletop/physical-scale';
import { animationIntensity } from '@axe/domain/tabletop/vision-scene/light-flicker';
import { lightAxis } from '@axe/domain/tabletop/vision-scene/light-shape';
import type { GroundMesh } from '@axe/domain/tabletop/world/ground-mesh';
import type { SkyDome } from '@axe/domain/tabletop/world/sky-dome';
import { type SkyLight, skyLightAt } from '@axe/domain/tabletop/world/sky-light';
import type {
  TableWorld,
  TableWorldBoard,
  TableWorldBoardShape,
  TableWorldCap,
  TableWorldWall,
} from '@axe/domain/tabletop/world/table-world';
import { BackdropRing } from '@axe/infrastructure/table-3d/backdrop-ring';
import { BoardLayers } from '@axe/infrastructure/table-3d/board-layers';
import { canvasOfPicture, fitReadPicture, retakeCanvasPicture } from '@axe/infrastructure/table-3d/canvas-picture';
import { CoinLayer } from '@axe/infrastructure/table-3d/coin-layer';
import { ConeLamp } from '@axe/infrastructure/table-3d/cone-lamp';
import { DrawnKinds } from '@axe/infrastructure/table-3d/drawn-kinds';
import { EffectLayer } from '@axe/infrastructure/table-3d/effect-layer';
import { changedChunks, chunkSignatures, facesByOwner, OwnedFaces } from '@axe/infrastructure/table-3d/face-chunks';
import {
  boardGeometry,
  capGeometry,
  griddedTops,
  gridOverBoard,
  gridOverGround,
  groundGeometry,
  mergedFaces,
  wallGeometry,
} from '@axe/infrastructure/table-3d/face-geometry';
import { type FaceLook, faceMaterialOf, lookOf } from '@axe/infrastructure/table-3d/face-materials';
import { FloorCanvasLayer } from '@axe/infrastructure/table-3d/floor-canvas-layer';
import { LAID_OVER_FACES } from '@axe/infrastructure/table-3d/floor-order';
import { FogAirLayer } from '@axe/infrastructure/table-3d/fog-air-layer';
import { ModelLayer } from '@axe/infrastructure/table-3d/model-layer';
import { SkyLayer } from '@axe/infrastructure/table-3d/sky-layer';
import { SHADOW_CASTERS_LAYER, SpriteLayer } from '@axe/infrastructure/table-3d/sprite-layer';
import type {
  Table3dCamera,
  Table3dDiceThrow,
  Table3dEffectLight,
  Table3dEngine,
  Table3dEngineOptions,
  Table3dFloorCanvas,
  Table3dFogAirSheet,
  Table3dGrid,
  Table3dLightMap,
  Table3dShadowLight,
  Table3dStats,
  Table3dVeil,
  Table3dWeatherFall,
} from '@axe/infrastructure/table-3d/table-3d-port';
import { TABLE_3D_QUALITY, type Table3dQualityPlan } from '@axe/infrastructure/table-3d/table-3d-quality';
import { TableDiceLayer } from '@axe/infrastructure/table-3d/table-dice-layer';
import { TablePost } from '@axe/infrastructure/table-3d/table-post';
import { lampColour, SceneVeil } from '@axe/infrastructure/table-3d/veil';
import { WaterLayer } from '@axe/infrastructure/table-3d/water-layer';
import { WeatherLayer } from '@axe/infrastructure/table-3d/weather-layer';
import { disposeObject, forgetDrawn } from '@axe/infrastructure/three-kit/dispose';
import { sourceTriangleOf } from '@axe/infrastructure/three-kit/model-faces';
import {
  attribute,
  float,
  max,
  mix,
  positionLocal,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  texture,
  vec2,
  type vec3,
  vec4,
} from 'three/tsl';
import {
  BufferGeometry,
  Camera,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  type FogExp2,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshLambertNodeMaterial,
  type Node,
  type Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';

/**
 * How near and far the camera draws, in table pixels from the eye. The near plane stands well off
 * the eye, since how finely depth is told apart falls with how near it is, and the grid lies only a
 * hair above the board.
 */
const NEAR_PX = 100;
const FAR_PX = 50000;
/**
 * The furthest off the table's camera draws from, standing far off the board: well within the sky
 * that stands round it, which would otherwise be left out.
 */
const MOST_NEAR_PX = 10000;

/** How much white the board is veiled with while nothing is laid under it, as the page veils it. */
const BOARD_VEIL = 0.15;

/**
 * Where the board and the blocks come in the order things are drawn: before everything standing on
 * them, so the soft edge of a picture standing at the far side of the board is laid over the board
 * rather than over nothing.
 */
const BOARD_ORDER = -2;
const BLOCKS_ORDER = -1;

/** How far above the board the grid is laid, as the page lifts it. */
const GRID_LIFT_PX = 0.15;

/**
 * How much stronger the lights are made than the shares of the sky's light they give: a surface the
 * library lights takes in its light shared out over the half of the sky it faces, a third of it
 * straight on, so a light of strength pi lights a white surface facing it white.
 */
const LIGHT_SCALE = Math.PI;

/** How much harder the sun or the moon and the sky light the scene at the height of a lightning strike, over what they light it. */
const FLASH_BOOST = 3;

/** How much the sky lights the scene at the height of a strike besides, under a sky lighting it with nothing. */
const FLASH_SKY = 0.8;

/** How far the light of a strike has to have changed before the scene is drawn again for it. */
const FLASH_STEP = 0.004;

/** How dark the ground is that the sky lights a surface facing down with, beside the sky itself. */
const GROUND_BOUNCE = 0.6;

/** The pictures the kinds of ground are painted with, in the order of `GROUND_PAINT_LAYERS`. */
const GROUND_PAINT_PICTURES = GROUND_PAINT_LAYERS.map((kind) => `assets/images/ground/${kind}.webp`);

/** How many cells across a tile of a painted kind of ground runs, so its pattern is not seen to repeat cell by cell. */
const GROUND_PAINT_TILE_CELLS = 2;

/**
 * How far off the board's middle the sun and the moon are put, beside how far across the board is:
 * their light falls the same everywhere, and the shadows they throw are worked out from there.
 */
const SKY_DISTANCE_BOARDS = 1.5;
/** How many pixels a side the map of the shadows the sun and the moon throw is drawn in. */
const SKY_SHADOW_PX = 2048;
/** How many lights the scene lights itself with at the most, each throwing shadows of its own. */
const SHADOW_LIGHTS = TABLE_3D_QUALITY.high.shadowedLights;
/** How many pixels a side each face of the map of a lamp's shadows is drawn in. */
const LAMP_SHADOW_PX = 512;
/**
 * How many samples a picture laid on a face is read with along the way the face runs off from the
 * eye: the board and the blocks are seen aslant, and read with one they blur ever more towards the
 * far side, where the page draws them sharp.
 */
const PICTURE_ANISOTROPY = 8;
/**
 * How much further than its dim reach a lamp's light is let fall off to nothing: it falls off slowly
 * at first, so it is still nearly full at its bright reach.
 */
const LAMP_REACH = 1.1;

/** The room the canvas has to draw in, read afresh each time it is asked. */
const drawingRoom = new Vector2();

/** How much of the cone of a lamp thrown one way, from its edge in, its light fades over. */
const THROWN_LAMP_PENUMBRA = 0.3;

/** How long at least the shadows are left as they are after they were drawn again for pieces that moved, in milliseconds. */
const PIECE_SHADOWS_MS = 150;

/** How high anything on the table is reckoned to stand, for the shadows of the sun and the moon to reach it, in table pixels. */
const TALLEST_PX = 2000;

/**
 * The board's axes as the scene's: the board runs x to the east, y to the south and z up, and the
 * scene x to the east, y up and z to the south, which is the board's space seen in a mirror and so
 * the right-handed space a graphics library works in.
 */
const BOARD_TO_SCENE = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/** The eye's space as the camera's: the eye stands `focalPx` out along z, and the camera's y runs up the page. */
function eyeToCamera(focalPx: number): Matrix4 {
  return new Matrix4().makeScale(1, -1, 1).multiply(new Matrix4().makeTranslation(0, 0, -focalPx));
}

/** Makes the engine that draws the table on a canvas, through WebGPU where it can and WebGL2 elsewhere. */
export async function createTable3dEngine(
  canvas: HTMLCanvasElement,
  options: Table3dEngineOptions
): Promise<Table3dEngine> {
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: options.forceWebGL });
  await renderer.init();
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
  return new ThreeTableEngine(renderer, backend);
}

class ThreeTableEngine implements Table3dEngine {
  private readonly scene = new Scene();
  private readonly perspective = new PerspectiveCamera(50, 1, NEAR_PX, FAR_PX);
  private readonly orthographic = new OrthographicCamera(-1, 1, 1, -1, NEAR_PX, FAR_PX);
  private camera: Camera = this.perspective;
  private board: Mesh | null = null;
  private boardShape = '';
  private boardGround: GroundMesh | null = null;
  /** Goes up each time the ground the board is laid over changes, which what is laid over the board follows. */
  private groundGeneration = 0;
  private changed = true;
  private lost = false;
  private loading = 0;
  /** The kinds of thing the scene draws, and which the graphics card has been readied for. */
  private readonly kinds = new DrawnKinds();
  /** The graphics card being readied for kinds of thing it has not drawn, which nothing is drawn during. */
  private readying: Promise<void> | null = null;
  /** When the engine began readying the graphics card for what it is readying it for now. */
  private readyingFrom = 0;
  /** How long the scene stood still on the screen, readying the graphics card or over long frames, until now. */
  private held = 0;
  /** Whether the graphics card is readied for a new kind of thing before the frame that first draws it. */
  private readiesFirst = true;
  private needsFrame: () => void = () => undefined;
  private readonly pictures = new TextureLoader();
  /** The pictures painted ground is drawn with, read the first time any ground is painted. */
  private groundPictures: Texture[] | null = null;
  private readonly loaded = new Map<string, Texture>();
  private readonly facesRoot = new Group();
  private readonly chunks = new Map<string, { owners: Map<string, string>; meshes: Group }>();
  private readonly looks = new Map<string, MeshBasicNodeMaterial | MeshLambertNodeMaterial>();
  private grid: Mesh | null = null;
  private gridPicture: CanvasTexture | null = null;
  private gridDrawn = '';
  private boardHexes: TableWorldBoardShape['hexes'] = null;
  private lastGrid: Table3dGrid | null = null;
  private gridded: readonly TableWorldCap[] = [];
  private topsGrid: Mesh | null = null;
  private laidWalls: readonly TableWorldWall[] | null = null;
  private laidCaps: readonly TableWorldCap[] | null = null;
  private readonly veil = new SceneVeil(SHADOW_LIGHTS, MAX_EFFECT_LIGHTS);
  /** The lamps of the slots, each throwing its light all round or one way, so the scene never has to be built again as lamps change. */
  private readonly lamps = Array.from({ length: SHADOW_LIGHTS }, () => new ConeLamp(0xffffff, 0, 1, 0));
  private laidLamps: readonly Table3dShadowLight[] = [];
  /**
   * The lights effects throw over the table, which throw no shadows: in the scene from the start and
   * left dark while no effect lights, so the scene is not built again as effects come and go.
   */
  private readonly effectLamps = Array.from({ length: MAX_EFFECT_LIGHTS }, () => new PointLight(0xffffff, 0, 1, 0));
  private laidEffectLights = '[]';
  private askedLamps: readonly Table3dShadowLight[] = [];
  /** How many lamps of each kind the quality the table is drawn at lets light the scene. */
  private lampSlots = -1;
  /** What the quality the table is drawn at draws. */
  private plan: Table3dQualityPlan = TABLE_3D_QUALITY.standard;
  private readonly post: TablePost;
  private readonly litLamps = new Set<ConeLamp>();
  private shadowsDrawnAt = -Infinity;
  private shadowTimer: ReturnType<typeof setTimeout> | null = null;
  private flickeredAt = 0;
  private draws = 0;
  private drawCalls = 0;
  private laidSprites: TableWorld['sprites'] = [];
  private readonly sun = new DirectionalLight(0xffffff, 0);
  private readonly sky = new HemisphereLight(0xffffff, 0xffffff, LIGHT_SCALE);
  private lastSkyLight = '';
  private lastSkyDirection: SkyLight['direction'] = { x: 0, y: 0, z: 1 };
  private lastSky: SkyLight = skyLightAt(0.5);
  private boardBox = { x: 0, y: 0, width: 0, height: 0 };
  private readonly sprites = new SpriteLayer(
    (url) => this.spritePicture(url),
    (material) => this.veil.cover(material)
  );
  private readonly floorCanvases = new FloorCanvasLayer();
  private readonly fogAir = new FogAirLayer();
  private readonly weather = new WeatherLayer();
  private readonly effects = new EffectLayer();
  /** How hard lightning lights the scene now, from 0 to 1. */
  private flash = 0;
  private readonly models = new ModelLayer(
    (material) => this.veil.cover(material, 'lit'),
    () => {
      this.piecesMoved();
      this.needsFrame();
    },
    () => this.renderer
  );
  private readonly dice = new TableDiceLayer(
    () => this.renderer,
    (material, lit) => this.veil.cover(material, lit ? 'lit' : 'unlit'),
    BOARD_TO_SCENE
  );
  private readonly skyDome = new SkyLayer();
  private readonly backdrops = new BackdropRing((url) => this.sharedPicture(url, true));
  private laidBackdrops: TableWorld['backdrops'] = [];
  private laidSky: SkyDome | null = null;
  private laidWeather: Table3dWeatherFall | null = null;
  private laidModels: TableWorld['models'] = [];
  private laidSkyKey = 'null';
  private skyFog: FogExp2 | null = null;
  private readonly darkFog = new Fog(0x000000, 0, 1);
  private fadePx = 0;
  private readonly water = new WaterLayer(
    (material, taking) => this.veil.cover(material, taking),
    (url) => this.picture(url)
  );
  private readonly layers = new BoardLayers(
    (url) => this.sharedPicture(url, true),
    (material) => this.veil.cover(material, 'lit')
  );
  private readonly coins = new CoinLayer(
    () => {
      this.changed = true;
      this.needsFrame();
    },
    (material) => this.veil.cover(material)
  );

  constructor(
    private readonly renderer: WebGPURenderer,
    readonly backend: 'webgpu' | 'webgl2'
  ) {
    this.post = new TablePost(renderer, this.veil.glowNode as unknown as Node<'vec3'>);
    for (const camera of [this.perspective, this.orthographic]) camera.matrixAutoUpdate = false;
    this.scene.add(this.facesRoot);
    this.scene.add(this.sprites.group);
    this.scene.add(this.coins.group);
    this.scene.add(this.floorCanvases.group);
    this.scene.add(this.layers.group);
    this.scene.add(this.water.group);
    this.scene.add(this.fogAir.group);
    this.scene.add(this.weather.group);
    this.scene.add(this.effects.group);
    this.scene.add(this.models.group);
    this.scene.add(this.dice.group);
    this.scene.add(this.skyDome.group);
    this.scene.add(this.backdrops.group);
    this.scene.add(this.sun, this.sun.target, this.sky);
    this.sun.castShadow = true;
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.mapSize.set(SKY_SHADOW_PX, SKY_SHADOW_PX);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 1;
    this.sun.shadow.camera.layers.enable(SHADOW_CASTERS_LAYER);
    for (const lamp of this.lamps) {
      lamp.target.position.set(0, -1, 0);
      lamp.target.updateMatrixWorld();
      lamp.castShadow = true;
      lamp.shadow.autoUpdate = false;
      lamp.shadow.mapSize.set(LAMP_SHADOW_PX, LAMP_SHADOW_PX);
      lamp.shadow.bias = -0.002;
      lamp.shadow.camera.layers.enable(SHADOW_CASTERS_LAYER);
      this.scene.add(lamp, lamp.target);
    }
    for (const lamp of this.effectLamps) this.scene.add(lamp);
    this.setQuality(TABLE_3D_QUALITY.standard);
    this.setSkyLight(skyLightAt(0.5));
  }

  setQuality(plan: Table3dQualityPlan): void {
    if (plan !== this.plan) this.changed = true;
    this.plan = plan;
    const slots = Math.min(SHADOW_LIGHTS, plan.shadowedLights);
    if (slots === this.lampSlots && this.sun.castShadow === plan.skyShadows) return;
    this.lampSlots = slots;
    this.lamps.forEach((lamp, index) => (lamp.visible = index < slots));
    this.sun.castShadow = plan.skyShadows;
    this.sun.shadow.needsUpdate = true;
    this.laidLamps = this.askedLamps.slice(0, slots);
    this.lightLamps();
    this.changed = true;
  }

  setShadowLights(lights: readonly Table3dShadowLight[]): void {
    this.askedLamps = lights;
    const laid = JSON.stringify(lights.slice(0, this.lampSlots));
    if (laid === JSON.stringify(this.laidLamps)) return;
    this.laidLamps = lights.slice(0, this.lampSlots);
    this.lightLamps();
    this.changed = true;
  }

  setEffectLights(lights: readonly Table3dEffectLight[]): void {
    const laid = JSON.stringify(lights.slice(0, MAX_EFFECT_LIGHTS));
    if (laid === this.laidEffectLights) return;
    this.laidEffectLights = laid;
    const strengths = this.effectLamps.map((lamp, index) => {
      const light = lights[index];
      lamp.intensity = light ? light.strength * LIGHT_SCALE : 0;
      if (!light) return lampColour({ r: 0, g: 0, b: 0 }, 0);
      lamp.position.set(light.x, light.z, light.y);
      lamp.distance = Math.max(1, light.reachPx);
      lamp.color.set(light.color || '#ffffff');
      return lampColour(lamp.color, light.strength);
    });
    this.veil.setEffectLamps(lights, strengths);
    this.changed = true;
  }

  flicker(timeMs: number): void {
    if (!this.laidLamps.some((light) => light.animation && light.animation !== 'none')) return;
    this.flickeredAt = timeMs;
    this.lightLamps(false);
    this.changed = true;
  }

  /**
   * Stands each lamp where its light is and lights it as strong as the dark leaves room for, so a
   * board lit by one is as bright as the dark would let a lamp make it; a slot with no light in it is
   * left dark, still in the scene, so the scene is not built again as lamps come and go. Has the
   * shadows of a lamp that moved drawn again.
   */
  private lightLamps(moved = true): void {
    const room = Math.max(0, 1 - this.veil.ambient);
    const free = this.lamps.slice(0, this.lampSlots);
    for (const lamp of this.lamps) lamp.intensity = 0;
    this.litLamps.clear();
    const strengths = this.laidLamps.map((light) => {
      const strength = room * animationIntensity(light.animation, this.flickeredAt);
      const lamp = free.shift();
      if (!lamp) return lampColour({ r: 0, g: 0, b: 0 }, 0);
      lamp.intensity = strength * LIGHT_SCALE;
      this.litLamps.add(lamp);
      lamp.position.set(light.x, light.z, light.y);
      lamp.distance = Math.max(1, light.dimPx * LAMP_REACH);
      lamp.color.set(light.color || '#ffffff');
      if (light.angle < 360) {
        const axis = lightAxis(light);
        lamp.target.position.set(light.x + axis.x * 100, light.z + axis.z * 100, light.y + axis.y * 100);
        lamp.target.updateMatrixWorld();
        lamp.angle = ((light.angle / 2) * Math.PI) / 180;
        lamp.penumbra = THROWN_LAMP_PENUMBRA;
      } else {
        lamp.target.position.set(light.x, light.z - 1, light.y);
        lamp.target.updateMatrixWorld();
        lamp.angle = Math.PI;
        lamp.penumbra = 0;
      }
      this.placeShadow(lamp, moved);
      return lampColour(lamp.color, strength);
    });
    this.veil.setLamps(this.laidLamps, strengths);
  }

  /** Sets the box a lamp's shadows are worked out in to its reach, and has them drawn again where it moved. */
  private placeShadow(lamp: ConeLamp, moved: boolean): void {
    const camera = lamp.shadow.camera;
    camera.near = 1;
    camera.far = lamp.distance;
    camera.updateProjectionMatrix();
    if (moved) lamp.shadow.needsUpdate = true;
  }

  /**
   * Has the shadows drawn again for pieces that moved: at once where they were not drawn a moment
   * ago, and otherwise once that moment is out, so a piece dragged about has its shadow follow it a
   * few times a second rather than the whole board's shadows drawn again every frame.
   */
  private piecesMoved(): void {
    const wait = this.shadowsDrawnAt + PIECE_SHADOWS_MS - performance.now();
    if (wait <= 0) {
      this.shadowsMoved();
      return;
    }
    this.shadowTimer ??= setTimeout(() => {
      this.shadowTimer = null;
      this.shadowsMoved();
      this.changed = true;
      this.needsFrame();
    }, wait);
  }

  /** Has the shadows of the sun, the moon and every lamp drawn again, as what throws them has moved. */
  private shadowsMoved(): void {
    this.shadowsDrawnAt = performance.now();
    this.sun.shadow.needsUpdate = true;
    for (const lamp of this.litLamps) lamp.shadow.needsUpdate = true;
  }

  /**
   * Puts the sun or the moon off the board's middle the way its light comes from, with the box its
   * shadows are worked out in round the whole board, and has the shadows drawn again.
   */
  private placeSun(): void {
    const { x, y, z } = this.lastSkyDirection;
    const box = this.boardBox;
    const across = Math.max(1, Math.hypot(box.width, box.height));
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const distance = across * SKY_DISTANCE_BOARDS;
    this.sun.target.position.set(middle.x, 0, middle.y);
    this.sun.position.set(middle.x + x * distance, z * distance, middle.y + y * distance);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    const reach = across / 2 + TALLEST_PX;
    Object.assign(this.sun.shadow.camera, {
      left: -reach,
      right: reach,
      top: reach,
      bottom: -reach,
      near: 1,
      far: distance + reach,
    });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;
  }

  setSkyLight(light: SkyLight): void {
    const lit = JSON.stringify(light);
    if (lit === this.lastSkyLight) return;
    this.lastSkyLight = lit;
    this.lastSkyDirection = light.direction;
    this.lastSky = light;
    this.placeSun();
    this.sun.color.set(light.colour);
    this.sky.color.set(light.skyColour);
    this.sky.groundColor.copy(new Color(light.skyColour).multiplyScalar(GROUND_BOUNCE));
    this.lightSky();
    this.changed = true;
  }

  /** Sets how strong the sky's light is, as the hour has it, dimmed as the table is dark. */
  private lightSky(): void {
    const ambient = this.veil.ambient;
    const struck = 1 + this.flash * FLASH_BOOST;
    this.sun.intensity = this.lastSky.strength * LIGHT_SCALE * ambient * struck;
    this.sky.intensity = (this.lastSky.skyStrength * ambient * struck + this.flash * FLASH_SKY) * LIGHT_SCALE;
  }

  onNeedsFrame(listener: () => void): void {
    this.needsFrame = listener;
  }

  isLoading(): boolean {
    return this.loading > 0 || this.shadowTimer !== null || this.models.isLoading || this.readying !== null;
  }

  modelFaceAt(pageX: number, pageY: number): { owner: string; mesh: number; triangle: number } | null {
    const box = this.renderer.domElement.getBoundingClientRect();
    if (!(box.width > 0) || !(box.height > 0)) return null;
    const ndc = new Vector2(((pageX - box.left) / box.width) * 2 - 1, -((pageY - box.top) / box.height) * 2 + 1);
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.camera);
    for (const hit of ray.intersectObject(this.models.group, true)) {
      const mesh = hit.object.userData['partMesh'];
      if (typeof mesh !== 'number' || hit.faceIndex === undefined || hit.faceIndex === null) continue;
      let at: Object3D | null = hit.object;
      while (at && typeof at.userData['owner'] !== 'string') at = at.parent;
      // A copy with the faces of a lost part cut out counts its triangles afresh; the parts are told
      // by the triangles of the model as it was read.
      const geometry = (hit.object as Partial<Mesh>).geometry;
      const triangle = geometry ? sourceTriangleOf(geometry, hit.faceIndex) : hit.faceIndex;
      if (at) return { owner: at.userData['owner'] as string, mesh, triangle };
    }
    return null;
  }

  heldMs(): number {
    return this.held + (this.readying !== null ? performance.now() - this.readyingFrom : 0);
  }

  readyBeforeDrawing(on: boolean): void {
    this.readiesFirst = on;
  }

  whenDrawn(): Promise<void> {
    const device = (this.renderer.backend as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } } }).device;
    return device ? device.queue.onSubmittedWorkDone() : Promise.resolve();
  }

  stopHoldingBack(): void {
    if (this.shadowTimer === null) return;
    clearTimeout(this.shadowTimer);
    this.shadowTimer = null;
    this.shadowsMoved();
    this.changed = true;
  }

  stats(): Table3dStats {
    const shown = (mesh: Mesh | null) => (mesh?.visible ? mesh.geometry.getAttribute('position').count / 3 : 0);
    return {
      chunks: this.chunks.size,
      boardGridTriangles: shown(this.grid),
      topsGridTriangles: shown(this.topsGrid),
      sprites: this.sprites.group.children.length,
      coins: this.coins.group.children.length,
      floorCanvases: this.floorCanvases.group.children.length,
      layers: this.layers.shown,
      waterParts: this.water.shown,
      fogAirSheets: this.fogAir.shown,
      weatherDrops: this.weather.shown,
      sky: this.skyDome.shown,
      backdrops: this.backdrops.shown,
      models: this.models.shown,
      dice: this.dice.shown,
      effects: this.effects.shown,
      modelMeshes: this.models.meshes,
      veilRevision: this.veil.revision,
      lightMapRevision: this.veil.lightRevision,
      shadowLights: this.laidLamps.length,
      glowRevision: this.veil.glowRevision,
      shadowCasters: this.sprites.casterCount,
      draws: this.draws,
      drawCalls: this.drawCalls,
    };
  }

  onLost(listener: () => void): void {
    this.renderer.onDeviceLost = () => {
      this.lost = true;
      listener();
    };
  }

  setWorld(world: TableWorld): void {
    this.placeBoard(world.board);
    this.layers.place(
      world.layers,
      world.board,
      () => (world.board!.ground ? groundGeometry(world.board!.ground) : boardGeometry(world.board!)),
      `${this.boardShape}|${this.groundGeneration}`
    );
    if (world.walls !== this.laidWalls || world.caps !== this.laidCaps) {
      this.laidWalls = world.walls;
      this.laidCaps = world.caps;
      this.placeFaces(world.walls, world.caps, world.board?.gridSize ?? 50);
    }
    this.sprites.set(world.sprites);
    this.coins.set(world.coins);
    if (world.models !== this.laidModels) {
      this.laidModels = world.models;
      this.models.set(world.models);
      this.piecesMoved();
    }
    this.laidBackdrops = world.backdrops;
    this.standBackdrops();
    this.water.set(
      world.water,
      world.board
        ? () => (world.board!.ground ? groundGeometry(world.board!.ground) : boardGeometry(world.board!))
        : null,
      `${this.boardShape}|${this.groundGeneration}`
    );
    if (world.sprites !== this.laidSprites) {
      this.laidSprites = world.sprites;
      this.piecesMoved();
    }
    this.forgetPictures(world);
    this.changed = true;
  }

  /**
   * Lets go of the pictures nothing in the scene wears any more, as the old picture of a note
   * written in again, and of the materials that wore them.
   */
  private forgetPictures(world: TableWorld): void {
    const worn = new Set<string>();
    for (const face of [...world.walls, ...world.caps]) worn.add(face.pictureUrl);
    for (const wall of world.walls) if (wall.gridUrl) worn.add(wall.gridUrl);
    for (const sprite of world.sprites) if (sprite.look.kind === 'picture') worn.add(sprite.look.url);
    for (const layer of [...world.layers, ...world.backdrops]) worn.add(layer.pictureUrl);
    for (const [key, picture] of this.loaded) {
      const url = key.slice(0, key.lastIndexOf('|'));
      if (worn.has(url)) continue;
      picture.dispose();
      this.loaded.delete(key);
      this.looks.get(key)?.dispose();
      this.looks.delete(key);
    }
  }

  setCamera(view: Table3dCamera): void {
    const focal = view.focalPx ?? TABLE_PERSPECTIVE_PX;
    const eye = new Matrix4().fromArray(view.eye as number[]);
    const toCamera = eyeToCamera(focal).multiply(eye).multiply(BOARD_TO_SCENE);
    if (view.orthographic) {
      Object.assign(this.orthographic, {
        left: -view.width / 2,
        right: view.width / 2,
        top: view.height / 2,
        bottom: -view.height / 2,
      });
      this.orthographic.updateProjectionMatrix();
      this.camera = this.orthographic;
    } else {
      this.perspective.fov = (2 * Math.atan(view.height / 2 / focal) * 180) / Math.PI;
      this.perspective.aspect = view.width / Math.max(1, view.height);
      this.perspective.near = view.nearPx ?? NEAR_PX;
      this.perspective.updateProjectionMatrix();
      this.camera = this.perspective;
    }
    this.camera.matrix.copy(toCamera).invert();
    this.camera.updateMatrixWorld(true);
    const at = new Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    const least = { near: view.nearPx ?? NEAR_PX, far: FAR_PX };
    const depth = cameraDepthOver(
      { x: at.x, y: at.z, z: at.y },
      this.boardBox,
      TALLEST_PX,
      least,
      view.nearPx === undefined && !view.orthographic ? MOST_NEAR_PX : least.near
    );
    const drawing = view.orthographic ? this.orthographic : this.perspective;
    if (drawing.near !== depth.near || drawing.far !== depth.far) {
      drawing.near = depth.near;
      drawing.far = depth.far;
      drawing.updateProjectionMatrix();
    }
    this.skyDome.follow(at);
    this.sprites.face(view.axes);
    this.fadePx = view.fadePx ?? 0;
    this.water.lookFromAmongPieces(view.nearPx !== undefined);
    this.layFog();
    this.changed = true;
  }

  /**
   * The fog the scene is drawn in: the sky's haze where there is a sky, a fade into the dark for an
   * eye that sees into the distance under none, and nothing otherwise. The same fog is kept while it
   * is wanted, its reach changed, so moving the eye builds no shader anew.
   */
  private layFog(): void {
    if (this.skyFog) {
      this.scene.fog = this.skyFog;
      return;
    }
    if (this.fadePx <= 0) {
      this.scene.fog = null;
      return;
    }
    this.darkFog.far = this.fadePx;
    this.scene.fog = this.darkFog;
  }

  setGrid(grid: Table3dGrid | null): void {
    const drawn = grid ? JSON.stringify([grid.box, grid.revision]) : '';
    this.lastGrid = grid;
    if (drawn !== this.gridDrawn) {
      this.gridDrawn = drawn;
      this.placeGrid(grid);
      this.placeTopsGrid();
    } else if (grid) {
      for (const mesh of [this.grid, this.topsGrid]) {
        if (mesh) (mesh.material as MeshBasicNodeMaterial).opacity = grid.opacity;
      }
    }
    for (const mesh of [this.grid, this.topsGrid]) {
      if (mesh) mesh.visible = (grid?.opacity ?? 0) > 0;
    }
    this.changed = true;
  }

  setFloorCanvases(canvases: readonly Table3dFloorCanvas[]): void {
    this.floorCanvases.set(canvases);
    this.changed = true;
  }

  setVeil(veil: Table3dVeil | null): void {
    if (this.veil.setVeil(veil)) this.changed = true;
  }

  setGlow(glow: Table3dVeil | null): void {
    if (this.veil.setGlow(glow)) this.changed = true;
  }

  setLightMap(map: Table3dLightMap | null): void {
    if (!this.veil.setLightMap(map)) return;
    this.lightSky();
    this.lightLamps();
    this.changed = true;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.changed = true;
  }

  advance(timeMs: number): boolean | 'slowly' {
    const drifting = this.layers.advance(timeMs);
    const flowing = this.water.advance(timeMs);
    const hanging = this.fogAir.advance(timeMs);
    const passing = this.backdrops.advance(timeMs);
    const walking = this.models.advance(timeMs);
    const falling = this.weather.advance(timeMs, this.camera);
    this.strike(timeMs);
    this.takeChanges();
    if (walking || falling) return true;
    return drifting || flowing || hanging || passing ? 'slowly' : false;
  }

  setSky(sky: SkyDome | null): void {
    const laid = JSON.stringify([sky, this.board ? this.boardBox : null]);
    if (laid === this.laidSkyKey) return;
    this.laidSkyKey = laid;
    this.laidSky = sky;
    this.skyFog = this.skyDome.set(sky, this.board ? this.boardBox : null);
    this.layFog();
    this.standBackdrops();
    this.changed = true;
  }

  /** Stands the backdrops round the board where a sky is drawn, and takes them away where none is. */
  private standBackdrops(): void {
    this.backdrops.place(this.laidSky ? this.laidBackdrops : [], this.laidSky && this.board ? this.boardBox : null);
  }

  setDice(throws: readonly Table3dDiceThrow[]): void {
    this.dice.set(throws);
    this.takeChanges();
  }

  warmDice(materials: readonly DiceMaterial[]): void {
    for (const material of materials) {
      void this.dice.warm(material, (staging) => this.renderer.compileAsync(staging, this.camera, this.scene));
    }
  }

  setFogAir(sheets: readonly Table3dFogAirSheet[], moving: boolean): void {
    this.fogAir.set(sheets, moving);
    this.takeChanges();
  }

  setEffects(frame: EffectFrame): void {
    this.effects.set(frame);
    this.takeChanges();
  }

  setEffectGround(ground: EffectGround | null): void {
    this.effects.setGround(ground);
  }

  setWeather(weather: Table3dWeatherFall | null): void {
    this.laidWeather = weather;
    this.weather.set(weather);
    if (!weather?.fall.flashes && this.flash !== 0) {
      this.flash = 0;
      this.lightSky();
    }
    this.takeChanges();
  }

  /** Lights the scene as hard as the lightning of a storm strikes at a moment, in milliseconds. */
  private strike(timeMs: number): void {
    const fall = this.laidWeather?.fall;
    const power = fall?.flashes ? skyAmbienceFlash('storm', timeMs, fall.density) : 0;
    if (Math.abs(power - this.flash) < FLASH_STEP && !(power === 0 && this.flash !== 0)) return;
    this.flash = power;
    this.lightSky();
    this.changed = true;
  }

  renderIfChanged(): boolean {
    this.takeChanges();
    if (!this.changed || this.lost || !this.hasRoom()) return false;
    if (this.readying !== null || (this.readiesFirst && this.readyForNewKinds())) return false;
    this.changed = false;
    this.renderer.info.reset();
    const began = performance.now();
    this.post.render(this.scene, this.camera, this.finishing());
    const spent = performance.now() - began;
    if (spent > LONG_FRAME_MS) this.held += spent;
    this.drawCalls = this.renderer.info.render.drawCalls;
    this.draws++;
    return true;
  }

  /**
   * Whether the canvas has any room to draw in. One laid out with none, as for a moment while the
   * view it stands in is laid out, is drawn once it has: the graphics card refuses a picture of no
   * size to keep how near what is drawn lies, and nothing would show anyway.
   */
  private hasRoom(): boolean {
    this.renderer.getDrawingBufferSize(drawingRoom);
    return drawingRoom.x > 0 && drawingRoom.y > 0;
  }

  /**
   * Starts readying the graphics card for the kinds of thing in the scene it has not drawn yet, and
   * answers whether it did; the scene is drawn once that is done. Built on the frame that first draws
   * them, they hold the page up for as long as that takes, most of a second on first opening a table.
   */
  private readyForNewKinds(): boolean {
    const fresh = this.kinds.unreadied(this.scene);
    if (fresh.kinds.length === 0) return false;
    this.readyingFrom = performance.now();
    const readying = this.post
      .compileAsync(this.scene, this.camera, this.finishing(), fresh.things)
      .catch(() => undefined)
      .then(() => {
        this.kinds.markReadied(fresh.kinds);
        if (this.readying === readying) {
          this.held += performance.now() - this.readyingFrom;
          this.readying = null;
        }
        this.needsFrame();
      });
    this.readying = readying;
    return true;
  }

  /**
   * The finishing the scene is drawn through now: the glow spilled only where anything glows, the
   * lamps of a dark table, so a table with nothing glowing on it is drawn straight onto the canvas at
   * any quality short of the one that shades its corners.
   */
  private finishing(): Table3dQualityPlan {
    const glowing = this.veil.glowRevision > 0;
    return this.plan.bloom && !glowing ? { ...this.plan, bloom: false } : this.plan;
  }

  /**
   * Takes up what the layers drifting past the board and behind it, the water, the fog in the air and
   * the models built or moved, which wants drawing.
   */
  private takeChanges(): void {
    const drifted = this.layers.takeChanged();
    const flowed = this.water.takeChanged();
    const hung = this.fogAir.takeChanged() || this.weather.takeChanged();
    const stood = this.backdrops.takeChanged();
    const modelled = this.models.takeChanged();
    const thrown = this.dice.takeChanged();
    const played = this.effects.takeChanged();
    if (drifted || flowed || hung || stood || modelled || thrown || played) this.changed = true;
  }

  dispose(): void {
    if (this.shadowTimer !== null) clearTimeout(this.shadowTimer);
    this.post.dispose();
    this.sprites.dispose();
    this.coins.dispose();
    this.floorCanvases.dispose();
    this.layers.dispose();
    this.water.dispose();
    this.fogAir.dispose();
    this.weather.dispose();
    this.effects.dispose();
    this.skyDome.dispose();
    this.backdrops.dispose();
    this.models.dispose();
    this.dice.dispose();
    this.veil.dispose();
    disposeObject(this.scene);
    for (const picture of this.loaded.values()) picture.dispose();
    for (const picture of this.groundPictures ?? []) picture.dispose();
    for (const material of this.looks.values()) material.dispose();
    try {
      this.renderer.dispose();
    } catch {
      // A renderer whose card let it go has nothing left to give back.
    }
  }

  /**
   * Lays the board flat at the floor with its picture stretched over its box, cut to its cells on a
   * hex board, and builds it again only when any of that changes.
   */
  private placeBoard(board: TableWorldBoard | null): void {
    const shape = board
      ? JSON.stringify([
          board.shape.box,
          board.shape.hexes?.length ?? 0,
          board.gridSize,
          board.gridType,
          board.pictureUrl,
          board.veiled,
        ])
      : '';
    this.floorCanvases.setGround(board?.floorGround ?? null);
    this.sprites.setGround(
      board && !board.floorSurface.isFlat
        ? { surface: board.floorSurface, gridSize: board.gridSize, gridType: board.gridType }
        : null
    );
    if (shape === this.boardShape && board?.ground === this.boardGround) return;
    this.boardShape = shape;
    if (this.boardGround !== (board?.ground ?? null)) this.groundGeneration++;
    this.boardGround = board?.ground ?? null;
    this.boardHexes = board?.shape.hexes ?? null;
    this.gridDrawn = '';
    if (this.lastGrid) this.setGrid(this.lastGrid);
    if (this.board) {
      this.scene.remove(this.board);
      disposeObject(this.board);
      this.board = null;
    }
    if (!board) return;
    const material = new MeshLambertNodeMaterial({ transparent: true, side: DoubleSide });
    material.colorNode = boardColour(
      board.pictureUrl ? this.picture(board.pictureUrl) : null,
      board.veiled,
      board.ground?.paint ? { pictures: this.paintedGround(), tilePx: board.gridSize * GROUND_PAINT_TILE_CELLS } : null
    );
    this.veil.cover(material, 'lit');
    this.board = new Mesh(board.ground ? groundGeometry(board.ground) : boardGeometry(board), material);
    this.board.receiveShadow = true;
    this.boardBox = board.shape.box;
    this.placeSun();
    this.board.renderOrder = BOARD_ORDER;
    this.scene.add(this.board);
    if (this.laidSky) this.setSky(this.laidSky);
  }

  /**
   * Lays the page's grid canvas over the board where the page lays it, a hair above the board as the
   * page lifts it, drawn again from the canvas whenever the page draws on it.
   */
  private placeGrid(grid: Table3dGrid | null): void {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as MeshBasicNodeMaterial).dispose();
      this.grid = null;
    }
    if (!grid) {
      this.gridPicture?.dispose();
      this.gridPicture = null;
      return;
    }
    if (!this.gridPicture || canvasOfPicture(this.gridPicture) !== grid.canvas) {
      this.gridPicture?.dispose();
      this.gridPicture = new CanvasTexture(grid.canvas);
      this.gridPicture.colorSpace = SRGBColorSpace;
    }
    retakeCanvasPicture(this.gridPicture, grid.canvas);
    const geometry = this.boardGround
      ? gridOverGround(this.boardGround, grid.box, GRID_LIFT_PX)
      : gridOverBoard(this.boardHexes, grid.box, GRID_LIFT_PX);
    const material = new MeshBasicNodeMaterial({
      map: this.gridPicture,
      transparent: true,
      opacity: grid.opacity,
      depthWrite: false,
      side: DoubleSide,
      ...LAID_OVER_FACES,
    });
    this.veil.cover(material);
    this.grid = new Mesh(geometry, material);
    this.grid.renderOrder = 1;
    this.scene.add(this.grid);
  }

  /**
   * Lays out the faces of the blocks and of the table's walls in chunks of the table's cells, and
   * builds again only the chunks where anything changed: a block moved takes the chunk it left and
   * the one it came to. Within a chunk the faces wearing the same picture the same way are drawn as
   * one shape, so a chunk is drawn in as many calls as it has pictures rather than faces.
   */
  private placeFaces(walls: readonly TableWorldWall[], caps: readonly TableWorldCap[], gridSize: number): void {
    const owned = facesByOwner(walls, caps, gridSize);
    const wanted = chunkSignatures(owned);
    const before = new Map([...this.chunks].map(([key, chunk]) => [key, chunk.owners]));
    for (const key of changedChunks(before, wanted)) this.buildChunk(key, wanted.get(key) ?? null, owned);
    this.gridded = caps.filter((cap) => cap.gridded);
    this.placeTopsGrid();
  }

  private buildChunk(key: string, owners: Map<string, string> | null, owned: ReadonlyMap<string, OwnedFaces>): void {
    const old = this.chunks.get(key);
    if (old) {
      this.facesRoot.remove(old.meshes);
      forgetDrawn(old.meshes);
      old.meshes.traverse((object) => (object as Mesh).geometry?.dispose());
      this.chunks.delete(key);
    }
    this.shadowsMoved();
    if (!owners) return;
    const byLook = new Map<string, { face: FaceLook; shapes: BufferGeometry[] }>();
    const add = (face: FaceLook, shape: BufferGeometry) => {
      const look = byLook.get(lookOf(face)) ?? { face, shapes: [] };
      look.shapes.push(shape);
      byLook.set(lookOf(face), look);
    };
    for (const owner of owners.keys()) {
      const entry = owned.get(owner)!;
      for (const wall of entry.walls) {
        add(wall, wallGeometry(wall));
        if (wall.gridUrl) {
          const grid = { pictureUrl: wall.gridUrl, tilePx: 0, glass: false, laidOver: true };
          add(
            grid,
            wallGeometry({ ...wall, tilePx: 0, uvs: wall.gridUvs ?? (wall.tilePx > 0 ? undefined : wall.uvs) })
          );
        }
      }
      for (const cap of entry.caps) add(cap, capGeometry(cap));
    }
    const meshes = new Group();
    for (const [look, { face, shapes }] of byLook) {
      const mesh = new Mesh(mergedFaces(shapes), this.sharedLook(look, face));
      mesh.castShadow = !face.glass && !face.colour && !face.laidOver;
      mesh.receiveShadow = true;
      mesh.renderOrder = BLOCKS_ORDER;
      meshes.add(mesh);
      for (const shape of shapes) shape.dispose();
    }
    this.chunks.set(key, { owners, meshes });
    this.facesRoot.add(meshes);
  }

  /** The material every face wearing one picture one way is drawn with, made once. */
  private sharedLook(look: string, face: FaceLook): MeshBasicNodeMaterial | MeshLambertNodeMaterial {
    let material = this.looks.get(look);
    if (!material) {
      material = this.faceMaterial(face);
      this.looks.set(look, material);
    }
    return material;
  }

  /** Lays the table's grid over the tops of the blocks that wear it, as it shows on the board. */
  private placeTopsGrid(): void {
    if (this.topsGrid) {
      this.scene.remove(this.topsGrid);
      this.topsGrid.geometry.dispose();
      (this.topsGrid.material as MeshBasicNodeMaterial).dispose();
      this.topsGrid = null;
    }
    const grid = this.lastGrid;
    if (!grid || !this.gridPicture || this.gridded.length === 0) return;
    const material = new MeshBasicNodeMaterial({
      map: this.gridPicture,
      transparent: true,
      opacity: grid.opacity,
      depthWrite: false,
      side: DoubleSide,
      ...LAID_OVER_FACES,
    });
    this.veil.cover(material);
    this.topsGrid = new Mesh(griddedTops(this.gridded, grid.box, GRID_LIFT_PX), material);
    this.topsGrid.renderOrder = 1;
    this.topsGrid.visible = grid.opacity > 0;
    this.scene.add(this.topsGrid);
  }

  private faceMaterial(face: FaceLook): MeshBasicNodeMaterial | MeshLambertNodeMaterial {
    return faceMaterialOf(
      face,
      (url, tiled) => this.sharedPicture(url, tiled),
      (material, taking) => this.veil.cover(material, taking)
    );
  }

  /** A picture shared by every face that wears it the same way, tiled or stretched. */
  private sharedPicture(url: string, tiled: boolean): Texture {
    const key = `${url}|${tiled}`;
    let picture = this.loaded.get(key);
    if (!picture) {
      picture = this.picture(url);
      if (tiled) picture.wrapS = picture.wrapT = RepeatWrapping;
      this.loaded.set(key, picture);
    }
    return picture;
  }

  /**
   * A picture a sprite wears, shared by every sprite that wears it, with its colours made to carry
   * its clearness: drawn smaller, a picture's clear parts would otherwise run their colour, often
   * white, into the edge of what is solid.
   */
  private spritePicture(url: string): Texture {
    const key = `${url}|sprite`;
    let picture = this.loaded.get(key);
    if (!picture) {
      picture = this.picture(url, () => this.sprites.picturesCame());
      picture.premultiplyAlpha = true;
      this.loaded.set(key, picture);
    }
    return picture;
  }

  /** The pictures of the kinds of ground, tiled across the board, read once and kept until the engine goes. */
  private paintedGround(): Texture[] {
    this.groundPictures ??= GROUND_PAINT_PICTURES.map((url) => {
      const picture = this.picture(url);
      picture.wrapS = RepeatWrapping;
      picture.wrapT = RepeatWrapping;
      return picture;
    });
    return this.groundPictures;
  }

  /**
   * A picture to draw, which asks for a frame once it has come, and has the shadows drawn again: a
   * board throwing a piece's shadow is cut to the picture it wears. What wears it is told as well.
   */
  private picture(url: string, came: () => void = () => undefined): Texture {
    this.loading++;
    const settle = () => {
      this.loading--;
      fitReadPicture(picture);
      came();
      this.changed = true;
      this.shadowsMoved();
      this.needsFrame();
    };
    const picture = this.pictures.load(url, settle, undefined, settle);
    picture.colorSpace = SRGBColorSpace;
    picture.anisotropy = Math.min(PICTURE_ANISOTROPY, this.renderer.getMaxAnisotropy());
    return picture;
  }
}

/** A colour the library's colour-space functions answer, which they do not say is a colour. */
function colourNode(node: unknown): ReturnType<typeof vec3> {
  return node as ReturnType<typeof vec3>;
}

/** The pictures painted ground is drawn with, in the order of `GROUND_PAINT_LAYERS`, and how wide a tile of them is. */
interface PaintedGroundLook {
  readonly pictures: readonly Texture[];
  readonly tilePx: number;
}

/**
 * The board's picture as the page draws it, in sRGB: over a little white where nothing is laid
 * under the board, which shows through where the picture is clear, and over what lies behind. Where
 * the ground is painted, the pictures of its kinds are tiled across the board and laid over it in
 * the shares the ground is painted in.
 */
function boardColour(picture: Texture | null, veiled: boolean, painted: PaintedGroundLook | null = null) {
  const veil = float(veiled ? BOARD_VEIL : 0);
  const sampled = picture ? texture(picture) : vec4(0, 0, 0, 0);
  const clear = float(1).sub(sampled.a);
  const alpha = float(1).sub(float(1).sub(veil).mul(clear));
  const shown = colourNode(sRGBTransferOETF(sampled.rgb))
    .mul(sampled.a)
    .add(veil.mul(clear))
    .div(max(alpha, float(0.0001)));
  if (!painted) return vec4(colourNode(sRGBTransferEOTF(shown)), alpha);
  const shares = attribute('paint', 'vec4');
  const at = vec2(positionLocal.x, positionLocal.z).div(painted.tilePx);
  const [grass, dirt, rock, sand] = painted.pictures.map((kind) => colourNode(sRGBTransferOETF(texture(kind, at).rgb)));
  const covered = shares.x.add(shares.y).add(shares.z).add(shares.w);
  const laid = grass
    .mul(shares.x)
    .add(dirt.mul(shares.y))
    .add(rock.mul(shares.z))
    .add(sand.mul(shares.w))
    .div(max(covered, float(0.0001)));
  const over = colourNode(mix(shown, laid, covered));
  return vec4(colourNode(sRGBTransferEOTF(over)), max(alpha, covered));
}
