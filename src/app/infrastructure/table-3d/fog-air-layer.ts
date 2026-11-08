import type { Table3dFogAirSheet } from '@axe/infrastructure/table-3d/table-3d-port';
import {
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three/webgpu';

/** Where the sheets come in the order things are drawn: after everything else but the water, lowest first. */
const FOG_AIR_ORDER = 900;

/** How far a sheet drifts either way, as a share of its width and of its depth, as the page drifts it. */
const DRIFT_ACROSS = 0.025;
const DRIFT_DOWN = 0.015;

/** How far a sheet has to have drifted, in table pixels, before it is drawn again where it has come to. */
const DRAWN_AGAIN_PX = 0.5;

interface HungSheet {
  sheet: Table3dFogAirSheet;
  readonly mesh: Mesh;
  readonly picture: CanvasTexture;
  readonly material: MeshBasicNodeMaterial;
  drawnAt: { x: number; y: number };
}

/**
 * The sheets of fog hanging in the air over ground nobody has walked to, each a canvas the page
 * paints laid flat at its height and drifting slowly to and fro, as the page drifts it. They are fog
 * themselves, so nothing darkens or veils them, and they are drawn over all but the water.
 */
export class FogAirLayer {
  readonly group = new Group();
  private hung: HungSheet[] = [];
  private moving = false;
  private changed = false;

  /** How many sheets hang. */
  get shown(): number {
    return this.hung.length;
  }

  set(sheets: readonly Table3dFogAirSheet[], moving: boolean): void {
    const same =
      sheets.length === this.hung.length &&
      sheets.every((sheet, index) => this.hung[index].sheet.canvas === sheet.canvas);
    const unchanged = same && sheets.every((sheet, index) => this.hung[index].sheet.revision === sheet.revision);
    if (unchanged && moving === this.moving) return;
    this.moving = moving;
    if (!same) {
      this.clear();
      sheets.forEach((sheet, index) => this.hang(sheet, index));
    } else {
      sheets.forEach((sheet, index) => this.repaint(this.hung[index], sheet));
    }
    if (!moving) for (const hung of this.hung) this.place(hung, { x: 0, y: 0 });
    this.changed = true;
  }

  /** Drifts the sheets to where they have come to at a moment, in milliseconds; answers whether they drift. */
  advance(timeMs: number): boolean {
    if (!this.moving || this.hung.length === 0) return false;
    for (const hung of this.hung) {
      const shift = driftAt(hung.sheet, timeMs / 1000);
      if (
        Math.abs(shift.x - hung.drawnAt.x) >= DRAWN_AGAIN_PX ||
        Math.abs(shift.y - hung.drawnAt.y) >= DRAWN_AGAIN_PX
      ) {
        this.place(hung, shift);
        this.changed = true;
      }
    }
    return true;
  }

  /** Whether anything was hung or drifted since this was last asked, which wants drawing. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  dispose(): void {
    this.clear();
  }

  private hang(sheet: Table3dFogAirSheet, index: number): void {
    const picture = new CanvasTexture(sheet.canvas);
    picture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicNodeMaterial({
      map: picture,
      transparent: true,
      opacity: sheet.alpha,
      depthWrite: false,
      side: DoubleSide,
    });
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = FOG_AIR_ORDER + index;
    mesh.scale.set(sheet.box.width, 1, sheet.box.height);
    const hung: HungSheet = { sheet, mesh, picture, material, drawnAt: { x: 0, y: 0 } };
    this.place(hung, { x: 0, y: 0 });
    this.group.add(mesh);
    this.hung.push(hung);
  }

  /** Takes up what the page has painted on a sheet since, letting the picture go first where its size changed. */
  private repaint(hung: HungSheet, sheet: Table3dFogAirSheet): void {
    if (sheet.revision === hung.sheet.revision) return;
    const size = `${sheet.canvas.width}x${sheet.canvas.height}`;
    const image = hung.picture.image as HTMLCanvasElement;
    if (size !== `${image.width}x${image.height}`) hung.picture.dispose();
    hung.picture.needsUpdate = true;
    hung.material.opacity = sheet.alpha;
    hung.mesh.scale.set(sheet.box.width, 1, sheet.box.height);
    hung.sheet = sheet;
    this.place(hung, hung.drawnAt);
  }

  private place(hung: HungSheet, shift: { x: number; y: number }): void {
    const box = hung.sheet.box;
    hung.mesh.position.set(box.x + box.width / 2 + shift.x, hung.sheet.heightPx, box.y + box.height / 2 + shift.y);
    hung.drawnAt = shift;
  }

  private clear(): void {
    for (const hung of this.hung) {
      this.group.remove(hung.mesh);
      hung.mesh.geometry.dispose();
      hung.material.dispose();
      hung.picture.dispose();
    }
    this.hung = [];
  }
}

/**
 * How far a sheet has drifted at a moment, in seconds, in table pixels: to and fro between a little
 * to the north-west and as far to the south-east, easing in and out at either end, as the page's
 * drift does.
 */
function driftAt(sheet: Table3dFogAirSheet, seconds: number): { x: number; y: number } {
  const duration = Math.max(sheet.durationSec, 1);
  const along = (seconds - sheet.delaySec) / duration;
  const lap = Math.floor(along);
  const through = along - lap;
  const way = lap % 2 === 0 ? through : 1 - through;
  const eased = way * way * (3 - 2 * way);
  const share = eased * 2 - 1;
  return { x: share * DRIFT_ACROSS * sheet.box.width, y: share * DRIFT_DOWN * sheet.box.height };
}
