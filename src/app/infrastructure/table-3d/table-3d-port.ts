import type { DiceMaterial } from '@axe/domain/dice/dice-3d/dice-look';
import type { SceneLight } from '@axe/domain/tabletop/vision-scene';
import type { SkyDome } from '@axe/domain/tabletop/world/sky-dome';
import type { SkyLight } from '@axe/domain/tabletop/world/sky-light';
import type { EyeAxes } from '@axe/domain/tabletop/world/table-sprites';
import type { TableWorld } from '@axe/domain/tabletop/world/table-world';
import type { WeatherFall } from '@axe/domain/tabletop/world/weather-fall';
import type { ThrowToDraw } from '@axe/infrastructure/dice-3d/dice-3d-engine';
import type { Table3dQualityPlan } from '@axe/infrastructure/table-3d/table-3d-quality';

/**
 * The longest side of a picture sent to the graphics card, in pixels: the largest WebGPU promises on
 * any card. A picture sent any larger is refused there, and the frame it is in is drawn with nothing.
 */
export const LONGEST_PICTURE_PX = 8192;

/** Which of the browser's graphics interfaces the table is drawn through. */
export type Table3dBackend = 'webgpu' | 'webgl2';

/** How the camera looks at the board, as the engine is told it. */
export interface Table3dCamera {
  /**
   * The board's points carried into the space the eye looks through, a column at a time
   * (`tableEyeMatrix`): pixels from the middle of the box, x to the right, y down and z out towards
   * the eye.
   */
  readonly eye: readonly number[];
  /** Which way the eye's right and up run on the board, which a sprite turned to the eye lies along. */
  readonly axes: EyeAxes;
  readonly orthographic: boolean;
  /** The box the camera looks through, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /**
   * How far out along z the eye stands, in pixels: the table's own 3000 where none is given, and
   * less for an eye standing among the pieces, which sees wider.
   */
  readonly focalPx?: number;
  /** How near the eye anything is still drawn, in table pixels, for an eye standing among the pieces. */
  readonly nearPx?: number;
  /**
   * How far off, in table pixels, things have faded wholly into the dark, for an eye that sees into
   * the distance under no sky; none for the table's own camera.
   */
  readonly fadePx?: number;
}

/**
 * The grid, drawn by the page on a canvas of its own and laid over the board: where that canvas
 * lies on the board, in table pixels, how opaque it is shown, and a count that goes up each time
 * the page draws on it again.
 */
export interface Table3dGrid {
  readonly canvas: HTMLCanvasElement;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly opacity: number;
  readonly revision: number;
}

/**
 * A canvas the page paints on and lays on the board, as where a piece may move: where it lies, in
 * table pixels, how high over the board, and a count that goes up each time the page paints it anew.
 */
export interface Table3dFloorCanvas {
  readonly id: string;
  readonly canvas: HTMLCanvasElement;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly heightPx: number;
  readonly revision: number;
}

/**
 * The veil the page draws over what this seat cannot see well, the darkness and the fog and what is
 * only remembered, on a canvas of its own: where that canvas lies on the board, in table pixels, and a
 * count that goes up each time the page draws on it again. It is laid over everything standing in the
 * scene as the page lays it over its own drawing, in sRGB.
 */
export interface Table3dVeil {
  readonly canvas: HTMLCanvasElement;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly revision: number;
}

/**
 * How dark the table is where no light reaches, and how much each point of the board is lifted out of
 * it, drawn by the page on a canvas of its own as a black veil with the light carved out of it: where
 * that canvas lies on the board, in table pixels, a count that goes up each time it is drawn again,
 * and how dark the board is with no light at all, from 0 to 1.
 */
export interface Table3dLightMap {
  readonly canvas: HTMLCanvasElement;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly revision: number;
  readonly darkness: number;
}

/** A light the scene lights itself with, throwing shadows of its own: where it stands, how far it reaches and in what colour. */
export type Table3dShadowLight = Pick<
  SceneLight,
  'x' | 'y' | 'z' | 'brightPx' | 'dimPx' | 'color' | 'animation' | 'angle' | 'direction' | 'pitch'
>;

/**
 * A sheet of the fog hanging in the air over ground nobody has walked to, as the page paints it on a
 * canvas: where the canvas lies over the board, in table pixels, how high it hangs and how thick it
 * is, and how it drifts to and fro, as the page drifts it.
 */
export interface Table3dFogAirSheet {
  readonly canvas: HTMLCanvasElement;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly heightPx: number;
  readonly alpha: number;
  /** Seconds one drift takes, one way. */
  readonly durationSec: number;
  /** Where in its drift the sheet starts, as a negative delay, in seconds. */
  readonly delaySec: number;
  /** Goes up each time the page paints the sheets again. */
  readonly revision: number;
}

/** What the scene lets fall through the air, laid over a board of a size, up to a height over its floor, in table pixels. */
export interface Table3dWeatherFall {
  readonly fall: WeatherFall;
  readonly board: { readonly width: number; readonly depth: number };
  readonly ceilingPx: number;
}

/** What the engine holds, counted. */
export interface Table3dStats {
  readonly chunks: number;
  /** The triangles of the grid over the board and over the tops that wear it, 0 where it is not shown. */
  readonly boardGridTriangles: number;
  readonly topsGridTriangles: number;
  /** The pictures and frames of the pieces drawn. */
  readonly sprites: number;
  /** The coins drawn. */
  readonly coins: number;
  /** The canvases the page paints on laid over the board. */
  readonly floorCanvases: number;
  /** The pictures drawn drifting under and over the board, which is those whose pictures have come. */
  readonly layers: number;
  /** The parts of the water drawn: its surfaces, floors, sides and shore, each where there is any. */
  readonly waterParts: number;
  /** The sheets of fog hanging in the air. */
  readonly fogAirSheets: number;
  /** The drops or flakes of the weather falling through the air now. */
  readonly weatherDrops: number;
  /** Whether a sky is drawn past the board. */
  readonly sky: boolean;
  /** The pictures stood round the board behind everything, under a sky. */
  readonly backdrops: number;
  /** The pieces and blocks drawn as 3D models, read and stood. */
  readonly models: number;
  /** The rolls whose dice are on the table now. */
  readonly dice: number;
  /** How many meshes the models are drawn with, the copies of a model that plays no motion sharing theirs. */
  readonly modelMeshes: number;
  /** How many times the veil has been laid anew, 0 while there is none. */
  readonly veilRevision: number;
  /** How many times the light of a dark table has been laid anew, 0 while the table is not dark. */
  readonly lightMapRevision: number;
  /** How many lights the scene lights itself with now, throwing shadows of their own. */
  readonly shadowLights: number;
  /** How many times the glow of the lamps has been laid anew, 0 while there is none. */
  readonly glowRevision: number;
  /** How many standing pictures throw a shadow with boards of their own. */
  readonly shadowCasters: number;
  /** How many times the scene has been drawn, which a table nothing changes on leaves where it is. */
  readonly draws: number;
  /** How many draw calls the last drawing took, its shadows and finishing among them. */
  readonly drawCalls: number;
}

/**
 * A roll's dice thrown on the table: the dice and their throw, where the tray lies on the board,
 * how far into the throw they are, and how far they have faded as they leave.
 */
export interface Table3dDiceThrow {
  readonly key: string;
  readonly draw: ThrowToDraw;
  /** From the tray's world to the board's, z up, as sixteen numbers in column order. */
  readonly model: readonly number[];
  readonly seconds: number;
  readonly opacity: number;
}

/** What draws the table on a canvas. It draws only when something it was told has changed. */
export interface Table3dEngine {
  readonly backend: Table3dBackend;
  setWorld(world: TableWorld): void;
  setCamera(camera: Table3dCamera): void;
  /** Lays the grid over the board, or takes it away with null. */
  setGrid(grid: Table3dGrid | null): void;
  /** Lays the canvases the page paints on over the board, as they are now. */
  setFloorCanvases(canvases: readonly Table3dFloorCanvas[]): void;
  /** Lays the veil over the scene, or takes it away with null. */
  setVeil(veil: Table3dVeil | null): void;
  /** Hangs the sheets of fog in the air, drifting where things may move, or takes them away with none. */
  setFogAir(sheets: readonly Table3dFogAirSheet[], moving: boolean): void;
  /**
   * Lets rain, a storm or snow fall through the air round where the camera looks, lightning lighting
   * the scene in a storm, or stops it with null.
   */
  setWeather(weather: Table3dWeatherFall | null): void;
  /** Puts the dice of the rolls thrown on the table where their trays lie, each as far into its throw as given. */
  setDice(throws: readonly Table3dDiceThrow[]): void;
  /** Builds the shaders of the dice of these materials ahead, so the first throw that wears one does not wait for them. */
  warmDice(materials: readonly DiceMaterial[]): void;
  /** Lights the scene as the sky does at the story's hour. */
  setSkyLight(light: SkyLight): void;
  /**
   * Draws a sky past the board as it is at the story's hour, with the ground running out to the
   * horizon and a haze over what is far off, or none with null.
   */
  setSky(sky: SkyDome | null): void;
  /** Darkens the scene as the table is dark, lit where the page's lights reach, or lights it whole with null. */
  setLightMap(map: Table3dLightMap | null): void;
  /**
   * Draws the scene at a quality: as many lamps throwing shadows of their own as it allows, and the
   * sun's and the moon's shadows or none. Changing it has the scene built again once.
   */
  setQuality(plan: Table3dQualityPlan): void;
  /** Lights the scene with these lights itself, each throwing shadows of its own, as many as it has slots for. */
  setShadowLights(lights: readonly Table3dShadowLight[]): void;
  /** Brightens and dims the lights the scene lights itself with as they flicker at a moment, in milliseconds. */
  flicker(timeMs: number): void;
  /**
   * Adds the glow of a dark table's lamps, in their colours, as the page draws it on a canvas of its
   * own, or takes it away with null.
   */
  setGlow(glow: Table3dVeil | null): void;
  /** Sizes the canvas's drawing to the box it covers, in CSS pixels, at the screen's pixel ratio. */
  resize(width: number, height: number, pixelRatio: number): void;
  /**
   * Moves what moves by itself, as a layer drifting past the board, to where it is at a moment, in
   * milliseconds; answers whether anything moves by itself, so the next frame is to be drawn too:
   * true for what moves fast, as a figure walking or rain falling, `'slowly'` where all that moves
   * drifts slowly, as water and fog do, which a frame now and then shows as well as every frame.
   */
  advance(timeMs: number): boolean | 'slowly';
  /** Draws the scene when anything changed since it was last drawn, and answers whether it drew. */
  renderIfChanged(): boolean;
  /** Calls back when something the engine was loading, such as a picture, has come and wants drawing. */
  onNeedsFrame(listener: () => void): void;
  /** Whether the engine is still loading something it was told to draw, or holds something back to draw a moment later. */
  isLoading(): boolean;
  /** Draws at once on the next frame what it holds back to draw a moment later, as the shadows of pieces that moved. */
  stopHoldingBack(): void;
  /**
   * Settles once the graphics card has done everything it was handed to draw. Through WebGPU the page
   * hands a frame over and goes on, and the card builds what is new to it and draws the frame after:
   * what a frame drawn at once does not wait for, which a picture of the page has to.
   */
  whenDrawn(): Promise<void>;
  /**
   * Whether the graphics card is readied for a new kind of thing before the frame that first draws it,
   * the scene being drawn once that is done, rather than built on that frame. On unless asked otherwise,
   * as the end-to-end pictures ask, whose clock is held and would hold the readying up with it.
   */
  readyBeforeDrawing(on: boolean): void;
  /** What the engine holds, counted, for the end-to-end specs to read. */
  stats(): Table3dStats;
  /**
   * Calls back once the graphics card lets the drawing go, as when the driver restarts; the engine
   * draws nothing from then on, and the canvas it drew on can be drawn on no more.
   */
  onLost(listener: () => void): void;
  dispose(): void;
}

export interface Table3dEngineOptions {
  /** Draws through WebGL2 even where WebGPU could be had, as a test does to hold the two side by side. */
  readonly forceWebGL: boolean;
}

/** The module the engine is made in, which the page loads only once the table is to be drawn on a canvas. */
export interface Table3dEngineModule {
  createTable3dEngine(canvas: HTMLCanvasElement, options: Table3dEngineOptions): Promise<Table3dEngine>;
}
