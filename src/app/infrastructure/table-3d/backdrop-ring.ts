import { backgroundScrollAnimation, backgroundTileSize } from '@axe/domain/tabletop/background-scroll';
import type { TableWorldBackdrop } from '@axe/domain/tabletop/world/table-layers';
import { float, smoothstep, texture, uniform, uv, vec2, vec4 } from 'three/tsl';
import {
  CylinderGeometry,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicNodeMaterial,
  type Texture,
} from 'three/webgpu';

/**
 * How many table pixels away from the eye a picture on the screen is as large as it is drawn, which
 * is how far off the camera stands from what it looks at: a picture's width at that distance is as
 * wide on the screen as the page draws it, which is how wide round the ring it is laid.
 */
const FOCAL_PX = 3000;
/** How far off the board's middle the nearest and the furthest backdrops stand, as shares of the board's width across corners. */
const NEAREST_BOARDS = 1.6;
const FURTHEST_BOARDS = 8;
/** How high above the horizon a backdrop raised all the way stands, in radians: about the height of the screen. */
const HIGHEST_RADIANS = 0.33;
/** How far under the horizon a backdrop's foot reaches, in radians, so it stands behind the ground's edge. */
const FOOT_RADIANS = 0.02;
/** Where the backdrops come in the order things are drawn: just after the sky, furthest first. */
const BACKDROP_ORDER = -90;
/** The largest a backdrop's picture is drawn, either way, as the page holds it. */
const MAX_TILE_PX = { width: 4096, height: 4096 };
/** How much of the top and the foot of a backdrop fade out, as the page fades them. */
const EDGE_FADE = 0.15;

interface StoodBackdrop {
  readonly backdrop: TableWorldBackdrop;
  readonly picture: Texture;
  readonly mesh: Mesh;
  readonly phase: ReturnType<typeof uniform>;
  readonly repeats: ReturnType<typeof uniform>;
  laidOut: boolean;
  seconds: number;
  sign: number;
}

/**
 * The pictures a table lays behind everything, stood round the board as rings of pictures far off,
 * the further the less each follows the camera, so turning and moving the camera shows them move as
 * far-off things do. Each is laid round its ring edge to edge, as wide as the page draws it, drifting
 * round it as the page drifts it, and fading out at its top and its foot. They are stood only round a
 * table that draws a sky, which stands in front of the page's own backdrops.
 */
export class BackdropRing {
  readonly group = new Group();
  private stood: StoodBackdrop[] = [];
  private laidKey = '';
  private changed = false;

  constructor(private readonly pictureOf: (url: string) => Texture) {}

  /** How many backdrops stand round the board. */
  get shown(): number {
    return this.stood.filter((stood) => stood.mesh.visible).length;
  }

  place(
    backdrops: readonly TableWorldBackdrop[],
    board: { x: number; y: number; width: number; height: number } | null
  ): void {
    const key = board ? JSON.stringify([backdrops, board]) : '';
    if (key === this.laidKey) return;
    this.laidKey = key;
    this.clear();
    if (!board) return;
    const across = Math.max(1, Math.hypot(board.width, board.height));
    const middle = { x: board.x + board.width / 2, y: board.y + board.height / 2 };
    [...backdrops]
      .sort((a, b) => a.follow - b.follow)
      .forEach((backdrop, index) => {
        const radius = across * (FURTHEST_BOARDS + (NEAREST_BOARDS - FURTHEST_BOARDS) * clamp01(backdrop.follow));
        const picture = this.pictureOf(backdrop.pictureUrl);
        const phase = uniform(0);
        const repeats = uniform(1);
        const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
        const along = uv();
        const sampled = texture(picture, vec2(float(1).sub(along.x).mul(repeats).add(phase), along.y));
        const fade = smoothstep(0, EDGE_FADE, along.y).mul(float(1).sub(smoothstep(1 - EDGE_FADE, 1, along.y)));
        material.colorNode = vec4(sampled.rgb, sampled.a.mul(fade).mul(backdrop.opacity));
        const mesh = new Mesh(new CylinderGeometry(radius, radius, 1, 96, 1, true), material);
        mesh.position.set(middle.x, 0, middle.y);
        mesh.renderOrder = BACKDROP_ORDER + index;
        mesh.visible = false;
        this.group.add(mesh);
        this.stood.push({ backdrop, picture, mesh, phase, repeats, laidOut: false, seconds: 0, sign: 1 });
      });
    this.layOut();
  }

  /** Drifts each backdrop round its ring to where it is at a moment, in milliseconds; answers whether any drifts. */
  advance(timeMs: number): boolean {
    this.layOut();
    let drifting = false;
    for (const stood of this.stood) {
      if (stood.seconds <= 0) continue;
      drifting = true;
      stood.phase.value = stood.sign * ((timeMs / 1000 / stood.seconds) % 1);
      this.changed = true;
    }
    return drifting;
  }

  /** Whether anything was stood or drifted since this was last asked, which wants drawing. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  dispose(): void {
    this.clear();
  }

  /** Sizes each backdrop whose picture has come to as wide and as tall round its ring as the page draws it, and stands it. */
  private layOut(): void {
    for (const stood of this.stood) {
      if (stood.laidOut) continue;
      const image = stood.picture.image as { width?: number; height?: number } | null;
      const tile = backgroundTileSize(
        image?.width && image.height ? { width: image.width, height: image.height } : null,
        stood.backdrop.scale,
        MAX_TILE_PX
      );
      if (!tile) continue;
      const radius = (stood.mesh.geometry as CylinderGeometry).parameters.radiusTop;
      stood.repeats.value = Math.max(1, Math.round((2 * Math.PI * FOCAL_PX) / tile.width));
      const tall = (tile.height / FOCAL_PX) * radius;
      const foot = Math.tan(stood.backdrop.height * HIGHEST_RADIANS - FOOT_RADIANS) * radius;
      stood.mesh.scale.set(1, tall, 1);
      stood.mesh.position.y = foot + tall / 2;
      const drift = backgroundScrollAnimation(stood.backdrop.speedX, tile.width);
      stood.seconds = drift.durationSeconds;
      stood.sign = drift.reversed ? -1 : 1;
      stood.laidOut = true;
      stood.mesh.visible = true;
      this.changed = true;
    }
  }

  private clear(): void {
    for (const stood of this.stood) {
      this.group.remove(stood.mesh);
      stood.mesh.geometry.dispose();
      (stood.mesh.material as Material).dispose();
    }
    this.stood = [];
    this.changed = true;
  }
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
