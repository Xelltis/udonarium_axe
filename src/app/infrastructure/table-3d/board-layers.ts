import { backgroundScrollAnimation, backgroundTileSize } from '@axe/domain/tabletop/background-scroll';
import type { TableWorldLayer } from '@axe/domain/tabletop/world/table-layers';
import { LAYERS_OVER_BOARD } from '@axe/infrastructure/table-3d/floor-order';
import { float, positionWorld, texture, uniform, vec2, vec4 } from 'three/tsl';
import {
  type BufferGeometry,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshLambertNodeMaterial,
  type Texture,
  Vector2,
} from 'three/webgpu';

/**
 * Where the layers come in the order things are drawn: those under the board just before it, so the
 * board is laid over them and they show through its clear parts, and those over it after the grid and
 * before what the page paints on the floor. Within a run, one after another from the back.
 */
const UNDER_ORDER = -3;
const OVER_ORDER = 1.5;
const ORDER_STEP = 0.01;

/** How wide and deep the board is that a layer's pictures are laid over, in table pixels. */
export interface LayerBoard {
  readonly widthPx: number;
  readonly depthPx: number;
}

interface LaidLayer {
  readonly layer: TableWorldLayer;
  readonly mesh: Mesh;
  readonly material: MeshLambertNodeMaterial;
  readonly picture: Texture;
  readonly tile: ReturnType<typeof tileUniform>;
  readonly phase: ReturnType<typeof tileUniform>;
  drift: { readonly x: Drift; readonly y: Drift } | null;
}

interface Drift {
  readonly seconds: number;
  readonly sign: number;
}

/**
 * The pictures a table lays under and over its board, each laid edge to edge over the board's shape
 * from its corner at the north-west, at the size its picture is drawn at, and drifting one tile past
 * at a time as the page drifts them. A layer is not drawn until its picture has come, since its tile
 * is the size of its picture.
 */
export class BoardLayers {
  readonly group = new Group();
  private laid: LaidLayer[] = [];
  private laidKey = '';
  private board: LayerBoard | null = null;
  private changed = false;

  constructor(
    private readonly pictureOf: (url: string) => Texture,
    private readonly dress: (material: Material) => void
  ) {}

  /** How many layers are drawn, which is those whose pictures have come. */
  get shown(): number {
    return this.laid.filter((laid) => laid.mesh.visible).length;
  }

  /**
   * Lays the layers over the board's shape, the shape given anew for each, and builds them again only
   * when any of them or the board changed.
   */
  place(layers: readonly TableWorldLayer[], board: LayerBoard | null, shape: () => BufferGeometry, key: string): void {
    const laidKey = board ? JSON.stringify([layers, key]) : '';
    if (laidKey === this.laidKey) return;
    this.laidKey = laidKey;
    this.clear();
    if (!board) return;
    let under = 0;
    let over = 0;
    for (const layer of layers) {
      const picture = this.pictureOf(layer.pictureUrl);
      const tile = tileUniform();
      const phase = tileUniform();
      const material = new MeshLambertNodeMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        ...(layer.over ? LAYERS_OVER_BOARD : {}),
      });
      const across = positionWorld.x.div(tile.x).add(phase.x);
      const down = positionWorld.z.div(tile.y).add(phase.y);
      const sampled = texture(picture, vec2(across, float(1).sub(down)));
      material.colorNode = vec4(sampled.rgb, sampled.a.mul(layer.opacity));
      this.dress(material);
      const mesh = new Mesh(shape(), material);
      mesh.receiveShadow = layer.over;
      mesh.renderOrder = layer.over ? OVER_ORDER + ORDER_STEP * over++ : UNDER_ORDER + ORDER_STEP * under++;
      mesh.visible = false;
      this.group.add(mesh);
      this.laid.push({ layer, mesh, material, picture, tile, phase, drift: null });
    }
    this.board = board;
    this.measure(board);
  }

  /**
   * Moves each drifting layer to where it has drifted at a moment, in milliseconds, and lays out any
   * whose picture has come since; answers whether any layer drifts, so the next frame is to be drawn too.
   */
  advance(timeMs: number): boolean {
    if (this.board) this.measure(this.board);
    let drifting = false;
    for (const laid of this.laid) {
      if (!laid.drift) continue;
      const x = phaseAt(laid.drift.x, timeMs);
      const y = phaseAt(laid.drift.y, timeMs);
      if (laid.drift.x.seconds > 0 || laid.drift.y.seconds > 0) drifting = true;
      if (x !== laid.phase.value.x || y !== laid.phase.value.y) {
        laid.phase.value.set(x, y);
        this.changed = true;
      }
    }
    return drifting;
  }

  /** Whether anything was laid out or moved since this was last asked, which wants drawing. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  dispose(): void {
    this.clear();
  }

  /** Sizes the tile of each layer whose picture has come and not been measured yet, and shows it. */
  private measure(board: LayerBoard): void {
    for (const laid of this.laid) {
      if (laid.drift) continue;
      const image = laid.picture.image as { width?: number; height?: number } | null;
      const tile = backgroundTileSize(
        image?.width && image.height ? { width: image.width, height: image.height } : null,
        laid.layer.scale,
        { width: board.widthPx, height: board.depthPx }
      );
      if (!tile) continue;
      laid.tile.value.set(tile.width, tile.height);
      laid.drift = { x: driftOf(laid.layer.speedX, tile.width), y: driftOf(laid.layer.speedY, tile.height) };
      laid.mesh.visible = true;
      this.changed = true;
    }
  }

  private clear(): void {
    for (const laid of this.laid) {
      this.group.remove(laid.mesh);
      laid.mesh.geometry.dispose();
      laid.material.dispose();
    }
    this.laid = [];
    this.board = null;
    this.changed = true;
  }
}

function tileUniform() {
  return uniform(new Vector2(1, 1));
}

/** How a layer drifts along one way: how long one tile takes to pass, and which way it goes. */
function driftOf(speedPx: number, tilePx: number): Drift {
  const animation = backgroundScrollAnimation(speedPx, tilePx);
  return { seconds: animation.durationSeconds, sign: animation.reversed ? -1 : 1 };
}

/** How far through a tile a layer has drifted at a moment, as a share of the tile. */
function phaseAt(drift: Drift, timeMs: number): number {
  if (drift.seconds <= 0) return 0;
  const through = (timeMs / 1000 / drift.seconds) % 1;
  return drift.sign * through;
}
