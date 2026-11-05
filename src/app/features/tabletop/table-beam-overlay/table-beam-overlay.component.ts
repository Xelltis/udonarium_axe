import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { LightBeam, LightGlow } from '@axe/domain/tabletop/vision-scene';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/** A beam laid on the screen over a canvas, with the transform that lays each of its fins there. */
export interface BeamOnScreen {
  readonly beam: LightBeam;
  readonly fins: readonly string[];
}

/** A glow laid on the screen over a canvas, with the style that lays it there. */
export interface GlowOnScreen {
  readonly glow: LightGlow;
  readonly style: Record<string, string>;
}

@Component({
  selector: 'table-beam-overlay',
  templateUrl: './table-beam-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [NgStyle, SafePipe],
})
export class TableBeamOverlayComponent {
  private readonly visionService = inject(VisionService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly camera = inject(TableCameraService);

  /**
   * Whether the beams and the glows are laid over a table drawn on a canvas: each on the screen
   * where the canvas draws the place it hangs, rather than among the page's own pieces.
   */
  readonly overCanvas = input(false);

  readonly beams = computed<LightBeam[]>(() => this.visionService.lightBeams());
  readonly glows = computed<LightGlow[]>(() => this.visionService.lightGlows());

  /** The fins of each beam, as the transforms that place them on the board. */
  private readonly placedFins = computed(() =>
    this.beams().map((beam) => beam.fins.map((fin) => new Matrix3D().setCSS(fin)))
  );

  /** The beams laid on the screen over a canvas. Follows the camera; none before it is set. */
  protected readonly beamsOnScreen = computed<BeamOnScreen[]>(() => {
    const laid = this.camera.screenMatrixOf();
    if (!this.overCanvas() || !laid) return [];
    const placed = this.placedFins();
    return this.beams().map((beam, index) => ({ beam, fins: placed[index].map(laid) }));
  });

  /**
   * The glows laid on the screen over a canvas: one on a wall flat against it, any other facing the
   * screen where the canvas draws the light. Follows the camera; none before it is set.
   */
  protected readonly glowsOnScreen = computed<GlowOnScreen[]>(() => {
    const laid = this.camera.screenMatrixOf();
    const screen = this.camera.screenOf();
    if (!this.overCanvas() || !laid || !screen) return [];
    return this.glows().map((glow) => {
      const at = glow.transform ? null : screen(glow.x, glow.y, glow.z);
      const transform = at
        ? `translate(${at.x}px, ${at.y}px) scale(${at.scale}) translate(-50%, -50%)`
        : laid(new Matrix3D().setCSS(glow.transform!));
      return { glow, style: { ...this.glowStyle(glow), transform } };
    });
  });

  protected beamBackground(beam: LightBeam): string {
    return 'linear-gradient(to bottom, ' + beam.color + ' 0%, transparent 88%)';
  }

  protected finStyle(beam: LightBeam, fin: string): Record<string, string> {
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: beam.width + 'px',
      height: beam.height + 'px',
      'transform-origin': '0 0',
      transform: fin,
      'clip-path': beam.clip,
      opacity: '0.16',
      'pointer-events': 'none',
    };
  }

  protected glowBackground(glow: LightGlow): string {
    return 'radial-gradient(circle, ' + glow.color + ' 0%, transparent 72%)';
  }

  protected glowStyle(glow: LightGlow): Record<string, string> {
    let transform: string;
    if (glow.transform) {
      transform = glow.transform;
    } else {
      const rot = this.uiSignalService.tableViewRotation();
      const rx = rot?.x ?? 50;
      const ry = rot?.y ?? 0;
      const rz = rot?.z ?? 10;
      transform =
        'translate3d(' +
        glow.x +
        'px, ' +
        glow.y +
        'px, ' +
        glow.z +
        'px) rotateZ(' +
        -rz +
        'deg) rotateX(' +
        -rx +
        'deg) rotateY(' +
        -ry +
        'deg) translate(-50%, -50%)';
    }
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: glow.size + 'px',
      height: glow.size + 'px',
      'border-radius': '50%',
      'transform-origin': '0 0',
      transform,
      opacity: '0.55',
      'pointer-events': 'none',
    };
  }
}
