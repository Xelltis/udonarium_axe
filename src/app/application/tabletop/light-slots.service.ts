import { computed, inject, Injectable } from '@angular/core';
import { Table3dQualityService } from '@axe/application/tabletop/table-3d-quality.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableEyeService } from '@axe/application/tabletop/table-eye.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { tablePointOfPage } from '@axe/domain/tabletop/camera/table-camera';
import type { SceneLight } from '@axe/domain/tabletop/vision-scene';
import { lightSlotsOf } from '@axe/domain/tabletop/world/light-slots';
import { TABLE_3D_QUALITY } from '@axe/infrastructure/table-3d/table-3d-quality';

/** As many lights as throw shadows of their own on a table drawn on a canvas at the most, as many as the scene keeps slots for. */
export const SHADOW_LIGHT_SLOTS = TABLE_3D_QUALITY.high.shadowedLights;

/**
 * The lights of a dark table that the scene a canvas draws lights itself, throwing shadows of their
 * own, rather than taking from the darkness the page draws: the few set to throw shadows that are
 * worth it most from where the camera looks. The page leaves them out of the darkness it draws, and
 * the scene lights them, so both have to read the same answer here.
 */
@Injectable({ providedIn: 'root' })
export class LightSlotsService {
  private readonly vision = inject(VisionService);
  private readonly camera = inject(TableCameraService);
  private readonly quality = inject(Table3dQualityService);
  private readonly eyes = inject(TableEyeService);
  private held: readonly string[] = [];

  /** How many lights throw shadows of their own, as the quality the seat draws the table at allows. */
  readonly count = computed(() => Math.min(SHADOW_LIGHT_SLOTS, this.quality.plan().shadowedLights));

  /** The lights that throw shadows of their own now, best first; none where the table is not dark. */
  readonly lights = computed<readonly SceneLight[]>(
    () => {
      const scene = this.vision.scene();
      this.camera.version();
      if (!scene?.darknessEnabled) {
        this.held = [];
        return [];
      }
      const chosen = lightSlotsOf(scene.lights, this.focus(scene), this.count(), this.held);
      this.held = chosen;
      return chosen.map((id) => scene.lights.find((light) => light.sourceId === id)!);
    },
    { equal: sameLights }
  );

  /** The identifiers of the lights that throw shadows of their own now. */
  readonly ids = computed(() => new Set(this.lights().map((light) => light.sourceId)));

  /**
   * Where the camera looks on the board: where an eye standing among the pieces stands, or else the
   * point under the middle of the table's box, or the board's middle.
   */
  private focus(scene: { widthPx: number; heightPx: number }): { x: number; y: number } {
    const standing = this.eyes.standsAt();
    if (standing) return standing;
    const inverse = this.camera.inverseSceneMatrix();
    const layout = this.camera.layout;
    if (inverse && layout) {
      const point = tablePointOfPage(inverse, layout.left + layout.width / 2, layout.top + layout.height / 2);
      if (Number.isFinite(point.x) && Number.isFinite(point.y)) return point;
    }
    return { x: scene.widthPx / 2, y: scene.heightPx / 2 };
  }
}

function sameLights(a: readonly SceneLight[], b: readonly SceneLight[]): boolean {
  return a.length === b.length && a.every((light, index) => sameLight(light, b[index]));
}

function sameLight(a: SceneLight, b: SceneLight): boolean {
  return (
    a.sourceId === b.sourceId &&
    a.x === b.x &&
    a.y === b.y &&
    a.z === b.z &&
    a.brightPx === b.brightPx &&
    a.dimPx === b.dimPx &&
    a.color === b.color &&
    a.angle === b.angle &&
    a.direction === b.direction &&
    a.pitch === b.pitch
  );
}
