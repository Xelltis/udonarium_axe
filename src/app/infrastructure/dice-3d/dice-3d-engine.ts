import type { DiceMaterial, DicePictureFit } from '@axe/domain/dice/dice-3d/dice-look';
import { DieLabels } from '@axe/domain/dice/dice-3d/dice-throw-plan';
import { dieRadiusOf, DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { Tray } from '@axe/domain/dice/dice-3d/throw-validation';
import {
  DiceDressing,
  DiceDressingKind,
  dressDie,
  faceColorsOf,
  FINISHES,
  swirlSeedOf,
  veinOf,
} from '@axe/infrastructure/dice-3d/dice-finish';
import { diceMeshOf } from '@axe/infrastructure/dice-3d/dice-geometry';
import { DiceThrowResult, FRAME_STRIDE, FRAMES_PER_SECOND } from '@axe/infrastructure/dice-3d/dice-physics-message';
import { diceStudio } from '@axe/infrastructure/dice-3d/dice-studio';
import {
  averageColorOf,
  DiceColors,
  drawDiceEngraving,
  drawDiceFaces,
  drawDiceMarks,
  FacePicture,
  lookFor,
} from '@axe/infrastructure/dice-3d/dice-textures';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  NoColorSpace,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  RepeatWrapping,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

/** One die of a throw: its shape and the numbers it wears. */
export interface DieOfThrow {
  readonly shape: DieShape;
  readonly labels: DieLabels;
}

/**
 * A throw to draw: its dice, their colours, the tray, and how the physics moved them and turned
 * each to show its number.
 */
export interface ThrowToDraw {
  readonly dice: readonly DieOfThrow[];
  /** The colour of the dice, which their numbers are inked to stand out from. */
  readonly color: string;
  /** The colour of their numbers, as the one who rolled asked; empty for one that stands out from the body. */
  readonly ink?: string;
  /** What the dice are made of; resin unless the one who rolled asked otherwise. */
  readonly material?: DiceMaterial;
  /** A picture the dice wear in place of their colour, which makes them resin. */
  readonly picture?: DicePicture;
  /** A critical or a fumble, which the dice flash gold or red as they come to rest; empty for neither. */
  readonly accent?: 'critical' | 'fumble' | '';
  /**
   * What the dice's own swirls and the parts of a wrapped picture they show are worked out from:
   * the same for the roll wherever and however it is drawn, so they do not change when its
   * recording is cut down to where the dice came to rest.
   */
  readonly seedKey?: string;
  readonly tray: Tray;
  readonly result: DiceThrowResult;
}

/** A picture dice wear: what it is known by, the picture itself, and how it is put on them. */
export interface DicePicture {
  readonly key: string;
  readonly source: FacePicture;
  readonly fit: DicePictureFit;
}

/** How a throw is looked at: from above and in front of its tray in a frame, or by the table's own camera. */
export type ThrowView =
  | { readonly kind: 'frame' }
  | {
      readonly kind: 'table';
      /** From the tray's world to the clip space of the screen, as sixteen numbers in column order. */
      readonly projection: ArrayLike<number>;
      /** Where the eye stands in the tray's world, which the dice's shine is seen from; null from infinitely far. */
      readonly eye: readonly [number, number, number] | null;
    };

/** Where on the engine's canvas a throw was drawn, in its device pixels from the top left. */
export interface DrawnRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The size of what is drawn, in CSS pixels, and how many device pixels each takes. */
export interface DrawSize {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

/** A throw set up to be drawn, frame after frame. */
export interface PreparedThrow {
  readonly root: Group;
  readonly bodies: readonly Group[];
  /** The soft dark patch under each die where it meets the floor. */
  readonly contacts: readonly Mesh<PlaneGeometry, MeshBasicMaterial>[];
  /** How far each die reaches from its middle, and how high its middle stands when it lies on a face. */
  readonly radii: readonly number[];
  readonly restHeights: readonly number[];
  readonly result: DiceThrowResult;
  readonly tray: Tray;
  /** How long the dice take to stop, in seconds. */
  readonly restSeconds: number;
  /** How long the recording runs, in seconds. */
  readonly totalSeconds: number;
  /** How long the throw has something to show, the flash of a critical or a fumble included, in seconds. */
  readonly endSeconds: number;
  /** The ring of light under each die that a critical or a fumble flashes. */
  readonly halos: readonly Mesh<PlaneGeometry, MeshBasicMaterial>[];
  /** The materials made for this throw's dice alone, as a marbled die's own swirl. */
  readonly owned: readonly MeshPhysicalMaterial[];
}

/**
 * How dark the patch under a die is where it touches the floor, how wide beside the die, and how
 * high the die rises before the patch is gone: the light's shadow alone leaves a die looking stuck
 * on rather than standing on a busy table.
 */
const CONTACT_OPACITY = 0.55;
const CONTACT_SPREAD = 2.3;
const CONTACT_FADE_HEIGHT = 3;
/** How far above the floor the patch lies, so it is drawn over the floor and not into it. */
const CONTACT_LIFT = 0.02;
/**
 * The ring of light a critical or a fumble flashes under each die as it comes to rest: its colour,
 * how wide beside the die, and how long it swells and fades, in seconds.
 */
const ACCENT_COLORS = { critical: 0xffc53d, fumble: 0xff3344 } as const;
const HALO_SPREAD = 3.4;
const ACCENT_SECONDS = 1.1;
const TEXTURE_CACHE_SIZE = 24;
/** Every shape and way of numbering it a roll can throw, whose engravings are cut ahead. */
const ENGRAVINGS: readonly (readonly [DieShape, DieLabels])[] = [
  ['d6', 'standard'],
  ['d20', 'standard'],
  ['d10', 'standard'],
  ['d10', 'tens'],
  ['d8', 'standard'],
  ['d12', 'standard'],
  ['d4', 'standard'],
  ['d6', 'd3'],
];
const SHADOW_MAP_PX = 1024;
/** How the frame's camera looks at the tray: its field of view, and how high above the floor it stands. */
const FRAME_FOV = 18;
const FRAME_ELEVATION = (72 * Math.PI) / 180;
/** How high the tallest die stands as it rests, so one against the far wall keeps its top in the frame. */
const TALLEST_DIE = 2;
/**
 * How far past the tray shadows are cast: a little in a frame, whose edges are the tray's walls, and
 * further on the table, where a die flying in from outside the tray throws its shadow on the board.
 */
const FRAME_SHADOW_REACH = 3;
const TABLE_SHADOW_REACH = 8;
/** How wide the soft edge of a die's shadow is, in the units of the tray. */
const PENUMBRA = 0.22;
/**
 * How far the floor that takes the dice's shadows runs past the tray in a frame, so it fills the
 * frame however the camera stands. The mat itself is laid under the frame by the page.
 */
const FRAME_FLOOR_REACH = 60;
/**
 * How dark the dice's shadows fall: deeper on the mat of a frame, as on the felt it stands in for,
 * and lighter over the table's own picture.
 */
const FRAME_SHADOW_OPACITY = 0.62;
const TABLE_SHADOW_OPACITY = 0.5;

/**
 * Draws the dice of chat rolls in 3D: one renderer for every throw on the page, drawing off screen,
 * whose picture is copied wherever the throw is shown.
 */
export class Dice3dEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly frameCamera = new PerspectiveCamera(30, 2, 0.5, 400);
  private readonly tableCamera = new PerspectiveCamera();
  private readonly light = new DirectionalLight(0xffffff, 2.4);
  private readonly shadowCatcher: Mesh;
  private readonly geometries = new Map<DieShape, BufferGeometry>();
  private readonly contactGeometry = new PlaneGeometry(1, 1);
  private readonly contactTexture = contactTexture();
  private readonly haloTexture = haloTexture();
  private readonly materials = new Map<string, MeshPhysicalMaterial>();
  /** One engraving for every die of a shape numbered the same way, whatever its colours. */
  private readonly engravings = new Map<string, CanvasTexture>();
  /** Where the marks lie on every die of a shape numbered the same way, for the dice not of resin. */
  private readonly marks = new Map<string, CanvasTexture>();
  private metalLight: Texture | null = null;
  /** The pictures dice have worn, each made a texture once, by its key. */
  private readonly pictures = new Map<string, Texture>();
  /** The average colour of each picture, which the ink of a die wearing it stands out from. */
  private readonly pictureTones = new Map<string, string | null>();
  /** The materials whose shaders have been built ahead of the first die that wears them. */
  private readonly warmed = new Set<DiceMaterial>(['resin']);
  /**
   * Engravings cut ahead, kept as pictures until a die first wears them: a texture draws on the
   * page's randomness for its name, which a quiet moment must leave as it found it.
   */
  private readonly carved = new Map<string, HTMLCanvasElement>();
  private lost = false;

  private constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    // The neutral curve keeps a die the colour the roll was said in, where others wash it out.
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
    });

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(diceStudio(), 0.02).texture;
    pmrem.dispose();

    this.light.castShadow = true;
    this.light.shadow.mapSize.set(SHADOW_MAP_PX, SHADOW_MAP_PX);
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.02;
    this.scene.add(this.light, this.light.target);

    this.shadowCatcher = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity: TABLE_SHADOW_OPACITY }));
    this.shadowCatcher.receiveShadow = true;
    this.scene.add(this.shadowCatcher);

    this.frameCamera.up.set(0, 0, 1);
    // The table's camera is set by hand each time; left to itself it would put itself back at the origin.
    this.tableCamera.matrixAutoUpdate = false;
    this.tableCamera.matrixWorldAutoUpdate = false;
  }

  /** Starts the renderer and readies its shaders, so the first throw does not stall while they build. */
  static async create(): Promise<Dice3dEngine> {
    const engine = new Dice3dEngine();
    // A critical's flash too, so its shader is built along with the dice's.
    const warm = engine.prepare({
      dice: [{ shape: 'd6', labels: 'standard' }],
      color: '#202024',
      accent: 'critical',
      tray: { halfWidth: 4, halfDepth: 2 },
      result: STILL_D6,
    });
    engine.scene.add(warm.root);
    engine.fit({ width: 64, height: 32, pixelRatio: 1 });
    engine.layOut(warm.tray, { kind: 'frame' }, 2);
    await engine.renderer.compileAsync(engine.scene, engine.frameCamera);
    engine.scene.remove(warm.root);
    engine.engraveAhead();
    return engine;
  }

  /**
   * Builds the shaders of a material ahead of the first die that wears it, in the time the physics
   * takes to work a throw out, so that die does not stall the frame it first appears in. The die
   * it is built with stands in a scene of its own, lit as the engine's is, so the throws drawn
   * while the shaders build never show it.
   */
  async warm(material: DiceMaterial): Promise<void> {
    if (this.warmed.has(material) || this.lost) return;
    this.warmed.add(material);
    const warm = this.prepare({
      dice: [{ shape: 'd6', labels: 'standard' }],
      color: '#202024',
      material,
      tray: { halfWidth: 4, halfDepth: 2 },
      result: STILL_D6,
    });
    const staging = new Scene();
    staging.add(warm.root);
    try {
      await this.renderer.compileAsync(staging, this.frameCamera, this.scene);
    } finally {
      staging.remove(warm.root);
      this.release(warm);
    }
  }

  /** Whether the graphics context was lost, after which nothing more is drawn. */
  get isLost(): boolean {
    return this.lost;
  }

  /** Sets up the meshes of a throw: each die a body moved by the recording, its mesh turned to show the rolled number. */
  prepare(draw: ThrowToDraw): PreparedThrow {
    const root = new Group();
    const owned: MeshPhysicalMaterial[] = [];
    const picture = draw.picture ?? null;
    const look = picture ? this.colorsUnder(picture, draw.color, draw.ink) : lookFor(draw.color, draw.ink);
    const material = picture ? 'resin' : (draw.material ?? 'resin');
    const bodies = draw.dice.map((die, index) => {
      const body = new Group();
      const shared = this.materialOf(die.shape, die.labels, look, material, picture);
      const seed = swirlSeedOf(draw.seedKey ?? '', index);
      const worn =
        material === 'marble'
          ? this.ownMaterial(shared, 'marble', die.shape, die.labels, look, seed)
          : picture?.fit === 'wrap'
            ? this.ownMaterial(shared, 'picture', die.shape, die.labels, look, seed, this.textureOf(picture))
            : shared;
      if (worn !== shared) owned.push(worn);
      const mesh = new Mesh(this.geometryOf(die.shape), worn);
      mesh.castShadow = true;
      mesh.scale.setScalar(dieRadiusOf(die.shape));
      const [x, y, z, w] = draw.result.corrections[index];
      mesh.quaternion.set(x, y, z, w);
      body.add(mesh);
      root.add(body);
      return body;
    });
    const contacts = draw.dice.map(() => {
      const contact = new Mesh(
        this.contactGeometry,
        new MeshBasicMaterial({ color: 0x000000, map: this.contactTexture, transparent: true, depthWrite: false })
      );
      root.add(contact);
      return contact;
    });
    const accent = draw.accent ? ACCENT_COLORS[draw.accent] : null;
    const halos = accent
      ? draw.dice.map(() => {
          const halo = new Mesh(
            this.contactGeometry,
            new MeshBasicMaterial({
              color: accent,
              map: this.haloTexture,
              transparent: true,
              depthWrite: false,
              blending: AdditiveBlending,
              opacity: 0,
            })
          );
          root.add(halo);
          return halo;
        })
      : [];
    const restSeconds = draw.result.restFrame / FRAMES_PER_SECOND;
    const totalSeconds = (draw.result.frameCount - 1) / FRAMES_PER_SECOND;
    return {
      root,
      bodies,
      halos,
      owned,
      endSeconds: accent ? Math.max(totalSeconds, restSeconds + ACCENT_SECONDS) : totalSeconds,
      contacts,
      radii: draw.dice.map((die) => dieRadiusOf(die.shape)),
      restHeights: draw.dice.map((die) => polyhedronOf(die.shape).inradius * dieRadiusOf(die.shape)),
      result: draw.result,
      tray: draw.tray,
      restSeconds,
      totalSeconds,
    };
  }

  /**
   * Draws a throw as it stands some seconds after it was thrown, into a corner of the engine's
   * canvas, and says where.
   *
   * The canvas only ever grows, so a frame and the table drawn in turn do not have it remade each
   * time; each picture takes the corner it needs.
   */
  render(prepared: PreparedThrow, seconds: number, view: ThrowView, size: DrawSize): DrawnRegion {
    const region = this.fit(size);
    if (this.lost) return region;
    pose(prepared, seconds);
    this.scene.add(prepared.root);
    const camera = this.layOut(prepared.tray, view, size.width / size.height);
    this.renderer.render(this.scene, camera);
    this.scene.remove(prepared.root);
    return region;
  }

  /**
   * Lets a throw set up to be drawn go: the patches, rings and materials made for its dice alone.
   * Its dice's shapes and pictures are shared with other throws and stay.
   */
  release(prepared: PreparedThrow): void {
    for (const mesh of [...prepared.contacts, ...prepared.halos]) mesh.material.dispose();
    for (const material of prepared.owned) material.dispose();
  }

  /**
   * Lets a picture dice wore go, once no throw set up to be drawn wears it: its texture, the colour
   * its ink was worked out from, and the materials its faces were painted with.
   */
  forgetPicture(key: string): void {
    this.pictures.get(key)?.dispose();
    this.pictures.delete(key);
    this.pictureTones.delete(key);
    for (const [kept, material] of this.materials) {
      if (!kept.endsWith(`|${key}:wrap`) && !kept.endsWith(`|${key}:faces`)) continue;
      this.materials.delete(kept);
      disposeMaterial(material);
    }
  }

  /** Lets the renderer and everything it holds go. */
  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach(disposeMaterial);
    this.engravings.forEach((engraving) => engraving.dispose());
    this.marks.forEach((marks) => marks.dispose());
    this.metalLight?.dispose();
    this.pictures.forEach((picture) => picture.dispose());
    this.carved.clear();
    this.contactGeometry.dispose();
    this.contactTexture.dispose();
    this.haloTexture.dispose();
    this.renderer.dispose();
  }

  /** Grows the canvas to hold a picture of a size, and points the drawing at its top left corner. */
  private fit(size: DrawSize): DrawnRegion {
    const width = Math.max(1, Math.round(size.width));
    const height = Math.max(1, Math.round(size.height));
    if (this.renderer.getPixelRatio() !== size.pixelRatio) this.renderer.setPixelRatio(size.pixelRatio);
    const current = this.renderer.getSize(new Vector2());
    if (current.x < width || current.y < height) {
      this.renderer.setSize(Math.max(current.x, width), Math.max(current.y, height), false);
    }
    const canvasHeight = this.renderer.getSize(new Vector2()).y;
    // WebGL counts up from the foot of the canvas, so the top left corner is the canvas's height
    // less the picture's above its foot.
    this.renderer.setViewport(0, canvasHeight - height, width, height);
    const ratio = this.renderer.getPixelRatio();
    return { x: 0, y: 0, width: Math.round(width * ratio), height: Math.round(height * ratio) };
  }

  private layOut(tray: Tray, view: ThrowView, aspect: number) {
    const inFrame = view.kind === 'frame';
    (this.shadowCatcher.material as ShadowMaterial).opacity = inFrame ? FRAME_SHADOW_OPACITY : TABLE_SHADOW_OPACITY;
    if (inFrame) {
      this.shadowCatcher.scale.set(FRAME_FLOOR_REACH * 2, FRAME_FLOOR_REACH * 2, 1);
    } else {
      this.shadowCatcher.scale.set(
        (tray.halfWidth + TABLE_SHADOW_REACH) * 2,
        (tray.halfDepth + TABLE_SHADOW_REACH) * 2,
        1
      );
    }

    // A key light high to the left and a little behind, the side the left softbox lights from, so
    // every die throws its shadow off to the right and a little toward the viewer.
    const span = Math.max(tray.halfWidth, tray.halfDepth);
    this.light.position.set(-span * 1.6, span * 0.5, span * 1.9);
    this.light.target.position.set(0, 0, 0);
    const shadow = this.light.shadow.camera;
    const reach = inFrame ? FRAME_SHADOW_REACH : TABLE_SHADOW_REACH;
    shadow.left = -tray.halfWidth - reach;
    shadow.right = tray.halfWidth + reach;
    shadow.top = tray.halfDepth + reach;
    shadow.bottom = -tray.halfDepth - reach;
    shadow.near = 1;
    shadow.far = span * 6;
    shadow.updateProjectionMatrix();
    this.light.shadow.radius = (PENUMBRA * SHADOW_MAP_PX) / (shadow.right - shadow.left);

    if (view.kind === 'table') {
      // The eye stands where the table is seen from, so the light shines off the dice toward it;
      // the projection is the page's own, taken from there.
      const camera = this.tableCamera;
      const [ex, ey, ez] = view.eye ?? [0, 0, 0];
      camera.matrixWorld.makeTranslation(ex, ey, ez);
      camera.matrixWorldInverse.makeTranslation(-ex, -ey, -ez);
      camera.projectionMatrix.fromArray(Array.from(view.projection)).multiply(camera.matrixWorld);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      return camera;
    }
    fitFrameCamera(this.frameCamera, tray, aspect);
    return this.frameCamera;
  }

  private geometryOf(shape: DieShape): BufferGeometry {
    let geometry = this.geometries.get(shape);
    if (!geometry) {
      const mesh = diceMeshOf(shape);
      geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
      geometry.setAttribute('tangent', new BufferAttribute(mesh.tangents, 4));
      geometry.setIndex(new BufferAttribute(mesh.indices, 1));
      this.geometries.set(shape, geometry);
    }
    return geometry;
  }

  private engravingOf(shape: DieShape, labels: DieLabels): CanvasTexture {
    const key = `${shape}|${labels}`;
    let engraving = this.engravings.get(key);
    if (!engraving) {
      engraving = new CanvasTexture(this.carvingOf(shape, labels));
      engraving.colorSpace = NoColorSpace;
      this.engravings.set(key, engraving);
      this.carved.delete(key);
    }
    return engraving;
  }

  private carvingOf(shape: DieShape, labels: DieLabels): HTMLCanvasElement {
    const key = `${shape}|${labels}`;
    let carving = this.carved.get(key);
    if (!carving) {
      carving = drawDiceEngraving(shape, labels);
      this.carved.set(key, carving);
    }
    return carving;
  }

  /**
   * Works out the engraving of every shape, one at a time in quiet moments, so the first roll of a
   * shape does not hold the page while its engraving is cut.
   */
  private engraveAhead(): void {
    const pending = ENGRAVINGS.filter(([shape, labels]) => {
      const key = `${shape}|${labels}`;
      return !this.engravings.has(key) && !this.carved.has(key);
    });
    const next = pending[0];
    if (!next || this.lost) return;
    const idle = globalThis.requestIdleCallback;
    const later = (work: () => void) =>
      typeof idle === 'function' ? idle(work, { timeout: 2000 }) : setTimeout(work, 50);
    later(() => {
      this.carvingOf(next[0], next[1]);
      this.engraveAhead();
    });
  }

  /** Has a material drawn as what it is dressed for, its marks kept as paint. */
  private dress(
    material: MeshPhysicalMaterial,
    kind: DiceDressingKind,
    shape: DieShape,
    labels: DieLabels,
    look: DiceColors,
    seed: number,
    picture: Texture | null = null
  ): void {
    const dressing: DiceDressing = {
      diceMarks: { value: this.marksOf(shape, labels) },
      diceVein: { value: veinOf(look.body) },
      diceSeed: { value: seed },
      ...(picture ? { dicePicture: { value: picture } } : {}),
    };
    material.onBeforeCompile = dressDie(kind, dressing);
    material.customProgramCacheKey = () => `dice-${kind}`;
  }

  /**
   * A die's own material where each die of a throw shows a part of its own: marble swirled its own
   * way, or a picture wrapped round it from its own place. The same pictures and shader as every die
   * of its shape and colours, with a seed of its own.
   */
  private ownMaterial(
    shared: MeshPhysicalMaterial,
    kind: 'marble' | 'picture',
    shape: DieShape,
    labels: DieLabels,
    look: DiceColors,
    seed: number,
    picture: Texture | null = null
  ): MeshPhysicalMaterial {
    const own = new MeshPhysicalMaterial({
      ...FINISHES[kind === 'marble' ? 'marble' : 'resin'],
      map: shared.map,
      normalMap: shared.normalMap,
      normalScale: shared.normalScale,
    });
    this.dress(own, kind, shape, labels, look, seed, picture);
    return own;
  }

  /**
   * The colours of a die wearing a picture: the body where the picture is clear, and ink that stands
   * out from the picture as a whole, which is what shows behind the numbers.
   */
  private colorsUnder(picture: DicePicture, body: string, ink: string | undefined): DiceColors {
    if (!this.pictureTones.has(picture.key)) this.pictureTones.set(picture.key, averageColorOf(picture.source));
    const tone = this.pictureTones.get(picture.key) ?? body;
    const marks = lookFor(tone, ink);
    return { body: lookFor(body).body, ink: marks.ink, accent: marks.accent };
  }

  /** A picture as a texture to wrap round dice, made once for every die that wears it. */
  private textureOf(picture: DicePicture): Texture {
    let texture = this.pictures.get(picture.key);
    if (!texture) {
      texture = new Texture(picture.source as TexImageSource);
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.flipY = false;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      this.pictures.set(picture.key, texture);
    }
    return texture;
  }

  /** The studio as metal mirrors it, with its panel overhead, made the first time a metal die is. */
  private metalStudio(): Texture {
    if (!this.metalLight) {
      const pmrem = new PMREMGenerator(this.renderer);
      this.metalLight = pmrem.fromScene(diceStudio(true), 0.02).texture;
      pmrem.dispose();
    }
    return this.metalLight;
  }

  private marksOf(shape: DieShape, labels: DieLabels): CanvasTexture {
    const key = `${shape}|${labels}`;
    let marks = this.marks.get(key);
    if (!marks) {
      marks = new CanvasTexture(drawDiceMarks(shape, labels));
      marks.colorSpace = NoColorSpace;
      this.marks.set(key, marks);
    }
    return marks;
  }

  private materialOf(
    shape: DieShape,
    labels: DieLabels,
    look: DiceColors,
    made: DiceMaterial = 'resin',
    picture: DicePicture | null = null
  ): MeshPhysicalMaterial {
    const worn = picture ? `${picture.key}:${picture.fit}` : '';
    const key = `${shape}|${labels}|${made}|${look.body}|${look.ink}|${look.accent}|${worn}`;
    let material = this.materials.get(key);
    if (material) {
      // Most recently used last, so the oldest is the one let go.
      this.materials.delete(key);
      this.materials.set(key, material);
      return material;
    }
    const onFaces = picture?.fit === 'faces' ? picture.source : null;
    const map = new CanvasTexture(drawDiceFaces(shape, labels, faceColorsOf(made, look), onFaces));
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    material = new MeshPhysicalMaterial({
      ...FINISHES[made],
      map,
      normalMap: this.engravingOf(shape, labels),
      normalScale: new Vector2(1, 1),
    });
    if (made === 'metal') material.envMap = this.metalStudio();
    if (made === 'glass') material.attenuationColor = new Color(look.body);
    if (made !== 'resin') this.dress(material, made, shape, labels, look, 0);
    this.materials.set(key, material);
    if (this.materials.size > TEXTURE_CACHE_SIZE) {
      const [oldest, dropped] = this.materials.entries().next().value!;
      this.materials.delete(oldest);
      disposeMaterial(dropped);
    }
    return material;
  }
}

/** A d6 lying still in the middle of a tray, which shaders are built ahead with. */
const STILL_D6: DiceThrowResult = {
  frameCount: 1,
  restFrame: 0,
  frames: new Float32Array([0, 0, 1, 0, 0, 0, 1]),
  landed: [0],
  corrections: [[0, 0, 0, 1]],
  attempt: 0,
  fault: null,
};

/** Sets every die where the recording has it some seconds in, between the two frames about that moment. */
function pose(prepared: PreparedThrow, seconds: number): void {
  const { result, bodies } = prepared;
  const count = bodies.length;
  const at = Math.min(Math.max(seconds * FRAMES_PER_SECOND, 0), result.frameCount - 1);
  const before = Math.floor(at);
  const after = Math.min(before + 1, result.frameCount - 1);
  const t = at - before;
  const q0 = new Quaternion();
  const q1 = new Quaternion();
  bodies.forEach((body, index) => {
    const a = (before * count + index) * FRAME_STRIDE;
    const b = (after * count + index) * FRAME_STRIDE;
    const f = result.frames;
    body.position.set(
      f[a] + (f[b] - f[a]) * t,
      f[a + 1] + (f[b + 1] - f[a + 1]) * t,
      f[a + 2] + (f[b + 2] - f[a + 2]) * t
    );
    q0.set(f[a + 3], f[a + 4], f[a + 5], f[a + 6]);
    q1.set(f[b + 3], f[b + 4], f[b + 5], f[b + 6]);
    body.quaternion.slerpQuaternions(q0, q1, t);

    // The patch under the die spreads and fades as the die leaves the floor.
    const lift = Math.max(0, body.position.z - prepared.restHeights[index]);
    const contact = prepared.contacts[index];
    contact.position.set(body.position.x, body.position.y, CONTACT_LIFT);
    contact.scale.setScalar(prepared.radii[index] * CONTACT_SPREAD * (1 + lift * 0.12));
    contact.material.opacity = CONTACT_OPACITY * Math.max(0, 1 - lift / CONTACT_FADE_HEIGHT);

    // A critical or a fumble swells a ring of light under the die as it stops, and lets it go.
    const halo = prepared.halos[index];
    if (halo) {
      const since = (seconds - prepared.restSeconds) / ACCENT_SECONDS;
      const swell = since > 0 && since < 1 ? Math.sin(Math.PI * since) : 0;
      halo.position.set(body.position.x, body.position.y, CONTACT_LIFT * 2);
      halo.scale.setScalar(prepared.radii[index] * HALO_SPREAD * (0.85 + 0.25 * since));
      halo.material.opacity = swell;
    }
  });
}

/**
 * Sets the frame's camera high above the tray and a little in front of it, looking down at it, as
 * far back as it needs to be for the whole floor and the dice resting against its walls to fit the frame.
 * The tray is the frame's own shape, so its walls stand about at the frame's edges.
 */
function fitFrameCamera(camera: PerspectiveCamera, tray: Tray, aspect: number): void {
  camera.aspect = aspect;
  camera.fov = FRAME_FOV;
  const direction = new Vector3(0, -Math.cos(FRAME_ELEVATION), Math.sin(FRAME_ELEVATION));
  const corners = [-1, 1].flatMap((sx) =>
    [-1, 1].flatMap((sy) => [0, TALLEST_DIE].map((z) => new Vector3(sx * tray.halfWidth, sy * tray.halfDepth, z)))
  );
  let near = 1;
  let far = 400;
  for (let i = 0; i < 40; i++) {
    const distance = (near + far) / 2;
    camera.position.copy(direction).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const fits = corners.every((corner) => {
      const p = corner.clone().project(camera);
      return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
    });
    if (fits) far = distance;
    else near = distance;
  }
  camera.position.copy(direction).multiplyScalar(far);
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(0.5, far * 0.2);
  camera.far = far * 3;
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
}

/** A ring, bright a little in from its edge and fading softly to nothing inside and out. */
function haloTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/** A round patch, darkest in the middle and fading out softly to nothing at its edge. */
function contactTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.62)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/** Lets a die's material go with its faces' picture; its engraving is shared, and kept. */
function disposeMaterial(material: MeshPhysicalMaterial): void {
  material.map?.dispose();
  material.dispose();
}
