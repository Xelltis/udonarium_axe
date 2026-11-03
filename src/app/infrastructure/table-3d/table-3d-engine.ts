import { TABLE_PERSPECTIVE_PX } from '@axe/domain/tabletop/physical-scale';
import { animationIntensity } from '@axe/domain/tabletop/vision-scene/light-flicker';
import { lightAxis } from '@axe/domain/tabletop/vision-scene/light-shape';
import type { GroundMesh } from '@axe/domain/tabletop/world/ground-mesh';
import { type SkyLight, skyLightAt } from '@axe/domain/tabletop/world/sky-light';
import type {
  TableWorld,
  TableWorldBoard,
  TableWorldBoardShape,
  TableWorldCap,
  TableWorldWall,
} from '@axe/domain/tabletop/world/table-world';
import { BoardLayers } from '@axe/infrastructure/table-3d/board-layers';
import { CoinLayer } from '@axe/infrastructure/table-3d/coin-layer';
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
import { FloorCanvasLayer } from '@axe/infrastructure/table-3d/floor-canvas-layer';
import { SHADOW_CASTERS_LAYER, SpriteLayer } from '@axe/infrastructure/table-3d/sprite-layer';
import type {
  Table3dCamera,
  Table3dEngine,
  Table3dEngineOptions,
  Table3dFloorCanvas,
  Table3dGrid,
  Table3dLightMap,
  Table3dShadowLight,
  Table3dStats,
  Table3dVeil,
} from '@axe/infrastructure/table-3d/table-3d-port';
import { TABLE_3D_QUALITY, type Table3dQualityPlan } from '@axe/infrastructure/table-3d/table-3d-quality';
import { lampColour, SceneVeil } from '@axe/infrastructure/table-3d/veil';
import { disposeObject } from '@axe/infrastructure/three-kit/dispose';
import { attribute, float, max, mix, sRGBTransferEOTF, sRGBTransferOETF, texture, type vec3, vec4 } from 'three/tsl';
import {
  BufferGeometry,
  Camera,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshLambertNodeMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  RepeatWrapping,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGPURenderer,
} from 'three/webgpu';

/**
 * How near and far the camera draws, in table pixels from the eye. The near plane stands well off
 * the eye, since how finely depth is told apart falls with how near it is, and the grid lies only a
 * hair above the board.
 */
const NEAR_PX = 100;
const FAR_PX = 50000;

/** How much white the board is veiled with while nothing is laid under it, as the page veils it. */
const BOARD_VEIL = 0.15;

/** What a face wears: the picture, how it is laid, and whether it is glass. */
type FaceLook = { pictureUrl: string; tilePx: number; glass: boolean };

/** The key faces drawn with one material share. */
function lookOf(face: FaceLook): string {
  return face.glass || !face.pictureUrl ? 'glass' : `${face.pictureUrl}|${face.tilePx > 0}`;
}

/**
 * Where the board and the blocks come in the order things are drawn: before everything standing on
 * them, so the soft edge of a picture standing at the far side of the board is laid over the board
 * rather than over nothing.
 */
const BOARD_ORDER = -2;
const BLOCKS_ORDER = -1;

/** Draws a face laid flat on another in front of it, as the grid on the board, past the depth's rounding. */
const PULLED_FORWARD = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };

/** How far above the board the grid is laid, as the page lifts it. */
const GRID_LIFT_PX = 0.15;

/** How a glass face is drawn: a pale blue, mostly clear. */
const GLASS_COLOUR = 0xcfe6ff;
const GLASS_OPACITY = 0.25;

/**
 * How much stronger the lights are made than the shares of the sky's light they give: a surface the
 * library lights takes in its light shared out over the half of the sky it faces, a third of it
 * straight on, so a light of strength pi lights a white surface facing it white.
 */
const LIGHT_SCALE = Math.PI;

/** How dark the ground is that the sky lights a surface facing down with, beside the sky itself. */
const GROUND_BOUNCE = 0.6;

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
 * How much further than its dim reach a lamp's light is let fall off to nothing: it falls off slowly
 * at first, so it is still nearly full at its bright reach.
 */
const LAMP_REACH = 1.1;

/** How high anything on the table is reckoned to stand, for the shadows of the sun and the moon to reach it, in table pixels. */
const TALLEST_PX = 2000;

/**
 * The board's axes as the scene's: the board runs x to the east, y to the south and z up, and the
 * scene x to the east, y up and z to the south, which is the board's space seen in a mirror and so
 * the right-handed space a graphics library works in.
 */
const BOARD_TO_SCENE = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/** The eye's space as the camera's: the eye stands out along z, and the camera's y runs up the page. */
const EYE_TO_CAMERA = new Matrix4()
  .makeScale(1, -1, 1)
  .multiply(new Matrix4().makeTranslation(0, 0, -TABLE_PERSPECTIVE_PX));

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
  private needsFrame: () => void = () => undefined;
  private readonly pictures = new TextureLoader();
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
  private readonly veil = new SceneVeil(SHADOW_LIGHTS);
  private readonly lamps = Array.from({ length: SHADOW_LIGHTS }, () => new PointLight(0xffffff, 0, 1, 0));
  /** As many lamps again thrown one way, so a slot can hold either kind and the scene never has to be built again. */
  private readonly spots = Array.from(
    { length: SHADOW_LIGHTS },
    () => new SpotLight(0xffffff, 0, 1, Math.PI / 4, 0.3, 0)
  );
  private laidLamps: readonly Table3dShadowLight[] = [];
  private askedLamps: readonly Table3dShadowLight[] = [];
  /** How many lamps of each kind the quality the table is drawn at lets light the scene. */
  private lampSlots = -1;
  private readonly litLamps = new Set<PointLight | SpotLight>();
  private flickeredAt = 0;
  private draws = 0;
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
    for (const camera of [this.perspective, this.orthographic]) camera.matrixAutoUpdate = false;
    this.scene.add(this.facesRoot);
    this.scene.add(this.sprites.group);
    this.scene.add(this.coins.group);
    this.scene.add(this.floorCanvases.group);
    this.scene.add(this.layers.group);
    this.scene.add(this.sun, this.sun.target, this.sky);
    this.sun.castShadow = true;
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.mapSize.set(SKY_SHADOW_PX, SKY_SHADOW_PX);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 1;
    this.sun.shadow.camera.layers.enable(SHADOW_CASTERS_LAYER);
    for (const lamp of [...this.lamps, ...this.spots]) {
      lamp.castShadow = true;
      lamp.shadow.autoUpdate = false;
      lamp.shadow.mapSize.set(LAMP_SHADOW_PX, LAMP_SHADOW_PX);
      lamp.shadow.bias = -0.002;
      lamp.shadow.camera.layers.enable(SHADOW_CASTERS_LAYER);
      this.scene.add(lamp);
    }
    for (const spot of this.spots) this.scene.add(spot.target);
    this.setQuality(TABLE_3D_QUALITY.standard);
    this.setSkyLight(skyLightAt(0.5));
  }

  setQuality(plan: Table3dQualityPlan): void {
    const slots = Math.min(SHADOW_LIGHTS, plan.shadowedLights);
    if (slots === this.lampSlots && this.sun.castShadow === plan.skyShadows) return;
    this.lampSlots = slots;
    this.lamps.forEach((lamp, index) => (lamp.visible = index < slots));
    this.spots.forEach((spot, index) => (spot.visible = index < slots));
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
    const free = { round: this.lamps.slice(0, this.lampSlots), thrown: this.spots.slice(0, this.lampSlots) };
    for (const lamp of [...this.lamps, ...this.spots]) lamp.intensity = 0;
    this.litLamps.clear();
    const strengths = this.laidLamps.map((light) => {
      const strength = room * animationIntensity(light.animation, this.flickeredAt);
      const thrown = light.angle < 360;
      const lamp: PointLight | SpotLight | undefined = thrown ? free.thrown.shift() : free.round.shift();
      if (!lamp) return lampColour({ r: 0, g: 0, b: 0 }, 0);
      lamp.intensity = strength * LIGHT_SCALE;
      this.litLamps.add(lamp);
      lamp.position.set(light.x, light.z, light.y);
      lamp.distance = Math.max(1, light.dimPx * LAMP_REACH);
      lamp.color.set(light.color || '#ffffff');
      if (lamp instanceof SpotLight) {
        const axis = lightAxis(light);
        lamp.target.position.set(light.x + axis.x * 100, light.z + axis.z * 100, light.y + axis.y * 100);
        lamp.target.updateMatrixWorld();
        lamp.angle = Math.min(Math.PI / 2, ((light.angle / 2) * Math.PI) / 180);
      }
      this.placeShadow(lamp, moved);
      return lampColour(lamp.color, strength);
    });
    this.veil.setLamps(this.laidLamps, strengths);
  }

  /** Sets the box a lamp's shadows are worked out in to its reach, and has them drawn again where it moved. */
  private placeShadow(lamp: PointLight | SpotLight, moved: boolean): void {
    const camera = lamp.shadow.camera;
    camera.near = 1;
    camera.far = lamp.distance;
    camera.updateProjectionMatrix();
    if (moved) lamp.shadow.needsUpdate = true;
  }

  /** Has the shadows of the sun, the moon and every lamp drawn again, as what throws them has moved. */
  private shadowsMoved(): void {
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
    this.sun.intensity = this.lastSky.strength * LIGHT_SCALE * ambient;
    this.sky.intensity = this.lastSky.skyStrength * LIGHT_SCALE * ambient;
  }

  onNeedsFrame(listener: () => void): void {
    this.needsFrame = listener;
  }

  isLoading(): boolean {
    return this.loading > 0;
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
      veilRevision: this.veil.revision,
      lightMapRevision: this.veil.lightRevision,
      shadowLights: this.laidLamps.length,
      glowRevision: this.veil.glowRevision,
      shadowCasters: this.sprites.casterCount,
      draws: this.draws,
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
    if (world.sprites !== this.laidSprites) {
      this.laidSprites = world.sprites;
      this.shadowsMoved();
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
    for (const sprite of world.sprites) if (sprite.look.kind === 'picture') worn.add(sprite.look.url);
    for (const layer of world.layers) worn.add(layer.pictureUrl);
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
    const eye = new Matrix4().fromArray(view.eye as number[]);
    const toCamera = EYE_TO_CAMERA.clone().multiply(eye).multiply(BOARD_TO_SCENE);
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
      this.perspective.fov = (2 * Math.atan(view.height / 2 / TABLE_PERSPECTIVE_PX) * 180) / Math.PI;
      this.perspective.aspect = view.width / Math.max(1, view.height);
      this.perspective.updateProjectionMatrix();
      this.camera = this.perspective;
    }
    this.camera.matrix.copy(toCamera).invert();
    this.camera.updateMatrixWorld(true);
    this.sprites.face(view.axes);
    this.changed = true;
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

  advance(timeMs: number): boolean {
    const drifting = this.layers.advance(timeMs);
    this.takeChanges();
    return drifting;
  }

  renderIfChanged(): boolean {
    this.takeChanges();
    if (!this.changed || this.lost) return false;
    this.changed = false;
    this.renderer.render(this.scene, this.camera);
    this.draws++;
    return true;
  }

  /** Takes up what the layers drifting past the board built or moved, which wants drawing. */
  private takeChanges(): void {
    if (this.layers.takeChanged()) this.changed = true;
  }

  dispose(): void {
    this.sprites.dispose();
    this.coins.dispose();
    this.floorCanvases.dispose();
    this.layers.dispose();
    this.veil.dispose();
    disposeObject(this.scene);
    for (const picture of this.loaded.values()) picture.dispose();
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
    if (shape === this.boardShape && board?.ground === this.boardGround) return;
    this.boardShape = shape;
    if (this.boardGround !== (board?.ground ?? null)) this.groundGeneration++;
    this.boardGround = board?.ground ?? null;
    this.floorCanvases.setGround(this.boardGround);
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
      !!board.ground?.paint
    );
    this.veil.cover(material, 'lit');
    this.board = new Mesh(board.ground ? groundGeometry(board.ground) : boardGeometry(board), material);
    this.board.receiveShadow = true;
    this.boardBox = board.shape.box;
    this.placeSun();
    this.board.renderOrder = BOARD_ORDER;
    this.scene.add(this.board);
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
    if (this.gridPicture?.image !== grid.canvas) {
      this.gridPicture?.dispose();
      this.gridPicture = new CanvasTexture(grid.canvas);
      this.gridPicture.colorSpace = SRGBColorSpace;
    }
    this.gridPicture.needsUpdate = true;
    const geometry = this.boardGround
      ? gridOverGround(this.boardGround, grid.box, GRID_LIFT_PX)
      : gridOverBoard(this.boardHexes, grid.box, GRID_LIFT_PX);
    const material = new MeshBasicNodeMaterial({
      map: this.gridPicture,
      transparent: true,
      opacity: grid.opacity,
      depthWrite: false,
      side: DoubleSide,
      ...PULLED_FORWARD,
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
      for (const wall of entry.walls) add(wall, wallGeometry(wall));
      for (const cap of entry.caps) add(cap, capGeometry(cap));
    }
    const meshes = new Group();
    for (const [look, { face, shapes }] of byLook) {
      const mesh = new Mesh(mergedFaces(shapes), this.sharedLook(look, face));
      mesh.castShadow = !face.glass;
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
      ...PULLED_FORWARD,
    });
    this.veil.cover(material);
    this.topsGrid = new Mesh(griddedTops(this.gridded, grid.box, GRID_LIFT_PX), material);
    this.topsGrid.renderOrder = 1;
    this.topsGrid.visible = grid.opacity > 0;
    this.scene.add(this.topsGrid);
  }

  private faceMaterial(face: {
    pictureUrl: string;
    tilePx: number;
    glass: boolean;
  }): MeshBasicNodeMaterial | MeshLambertNodeMaterial {
    const material =
      face.glass || !face.pictureUrl
        ? new MeshBasicNodeMaterial({
            color: GLASS_COLOUR,
            transparent: true,
            opacity: GLASS_OPACITY,
            depthWrite: false,
            side: DoubleSide,
          })
        : new MeshLambertNodeMaterial({ side: DoubleSide, transparent: true, alphaTest: 0.01 });
    if (!face.glass && face.pictureUrl) material.map = this.sharedPicture(face.pictureUrl, face.tilePx > 0);
    this.veil.cover(material, face.glass || !face.pictureUrl ? 'unlit' : 'lit');
    return material;
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
      picture = this.picture(url);
      picture.premultiplyAlpha = true;
      this.loaded.set(key, picture);
    }
    return picture;
  }

  /**
   * A picture to draw, which asks for a frame once it has come, and has the shadows drawn again: a
   * board throwing a piece's shadow is cut to the picture it wears.
   */
  private picture(url: string): Texture {
    this.loading++;
    const settle = () => {
      this.loading--;
      this.changed = true;
      this.shadowsMoved();
      this.needsFrame();
    };
    const picture = this.pictures.load(url, settle, undefined, settle);
    picture.colorSpace = SRGBColorSpace;
    return picture;
  }
}

/** A colour the library's colour-space functions answer, which they do not say is a colour. */
function colourNode(node: unknown): ReturnType<typeof vec3> {
  return node as ReturnType<typeof vec3>;
}

/**
 * The board's picture as the page draws it, in sRGB: over a little white where nothing is laid
 * under the board, which shows through where the picture is clear, and over what lies behind.
 */
function boardColour(picture: Texture | null, veiled: boolean, painted = false) {
  const veil = float(veiled ? BOARD_VEIL : 0);
  const sampled = picture ? texture(picture) : vec4(0, 0, 0, 0);
  const clear = float(1).sub(sampled.a);
  const alpha = float(1).sub(float(1).sub(veil).mul(clear));
  const shown = colourNode(sRGBTransferOETF(sampled.rgb))
    .mul(sampled.a)
    .add(veil.mul(clear))
    .div(max(alpha, float(0.0001)));
  if (!painted) return vec4(colourNode(sRGBTransferEOTF(shown)), alpha);
  // The paint is laid over the board in sRGB, as the page would lay one picture over another.
  const paint = attribute('color', 'vec4');
  const over = colourNode(mix(shown, paint.rgb, paint.a));
  return vec4(colourNode(sRGBTransferEOTF(over)), max(alpha, paint.a));
}
