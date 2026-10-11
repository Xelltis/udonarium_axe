import { NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { FogAirLayer } from '@axe/features/tabletop/fog-of-war/fog-air-layers';
import { fogAirDriftStyle, paintFogAirSheet } from '@axe/features/tabletop/fog-of-war/fog-air-sheet';

/**
 * One sheet of the fog that hangs over ground nobody has walked to, painted as the table paints
 * it and drifting as it drifts, for the first-person view to hang over the room.
 */
@Component({
  selector: 'first-person-fog-air',
  templateUrl: './first-person-fog-air.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle],
})
export class FirstPersonFogAirComponent {
  private readonly vision = inject(VisionService);

  readonly layer = input.required<FogAirLayer>();
  /** Which sheet of the stack it is, which picks the corner its mottle is taken from. */
  readonly index = input.required<number>();
  readonly gridSize = input.required<number>();

  private readonly sheet = viewChild.required<ElementRef<HTMLCanvasElement>>('sheet');

  protected readonly drift = computed(() => fogAirDriftStyle(this.layer()));

  constructor() {
    effect(() => {
      const vision = this.vision.overlayVision();
      const canvas = this.sheet().nativeElement;
      const gridSize = this.gridSize();
      const index = this.index();
      if (!vision || gridSize <= 0) return;
      untracked(() => paintFogAirSheet(canvas, vision, gridSize, index));
    });
  }
}
