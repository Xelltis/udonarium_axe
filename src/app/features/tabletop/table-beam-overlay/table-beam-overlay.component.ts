import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { LightBeam, LightGlow } from '@axe/domain/tabletop/vision-scene';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/** A beam laid on the screen over the table's canvas: its colour, and the style that lays each of its fins there. */
export interface BeamOnScreen {
  readonly beam: LightBeam;
  readonly background: string;
  readonly fins: readonly Record<string, string>[];
}

/** A glow laid on the screen over the table's canvas: its colour, and the style that lays it there. */
export interface GlowOnScreen {
  readonly glow: LightGlow;
  readonly background: string;
  readonly style: Record<string, string>;
}

/**
 * The beams and the glows of the lights, each laid on the screen where the table's canvas draws the
 * place it hangs.
 */
@Component({
  selector: 'table-beam-overlay',
  templateUrl: './table-beam-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [NgStyle, SafePipe],
})
export class TableBeamOverlayComponent {
  private readonly visionService = inject(VisionService);
  private readonly camera = inject(TableCameraService);

  readonly beams = computed<LightBeam[]>(() => this.visionService.lightBeams());
  readonly glows = computed<LightGlow[]>(() => this.visionService.lightGlows());

  /** The fins of each beam, as the transforms that place them on the board. */
  private readonly placedFins = computed(() =>
    this.beams().map((beam) => beam.fins.map((fin) => new Matrix3D().setCSS(fin)))
  );

  /** The beams laid on the screen. Follows the camera; none before it is set. */
  protected readonly beamsOnScreen = computed<BeamOnScreen[]>(() => {
    const laid = this.camera.screenMatrixOf();
    if (!laid) return [];
    const placed = this.placedFins();
    return this.beams().map((beam, index) => ({
      beam,
      background: beamBackground(beam),
      fins: placed[index].map((fin) => finStyle(beam, laid(fin))),
    }));
  });

  /**
   * The glows laid on the screen: one on a wall flat against it, any other facing the screen where
   * the canvas draws the light. Follows the camera; none before it is set.
   */
  protected readonly glowsOnScreen = computed<GlowOnScreen[]>(() => {
    const laid = this.camera.screenMatrixOf();
    const screen = this.camera.screenOf();
    if (!laid || !screen) return [];
    return this.glows().map((glow) => {
      let transform: string;
      if (glow.transform) {
        transform = laid(new Matrix3D().setCSS(glow.transform));
      } else {
        const at = screen(glow.x, glow.y, glow.z);
        transform = `translate(${at.x}px, ${at.y}px) scale(${at.scale}) translate(-50%, -50%)`;
      }
      return { glow, background: glowBackground(glow), style: glowStyle(glow, transform) };
    });
  });
}

function beamBackground(beam: LightBeam): string {
  return 'linear-gradient(to bottom, ' + beam.color + ' 0%, transparent 88%)';
}

function finStyle(beam: LightBeam, transform: string): Record<string, string> {
  return {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: beam.width + 'px',
    height: beam.height + 'px',
    'transform-origin': '0 0',
    transform,
    'clip-path': beam.clip,
    opacity: '0.16',
    'pointer-events': 'none',
  };
}

function glowBackground(glow: LightGlow): string {
  return 'radial-gradient(circle, ' + glow.color + ' 0%, transparent 72%)';
}

function glowStyle(glow: LightGlow, transform: string): Record<string, string> {
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
