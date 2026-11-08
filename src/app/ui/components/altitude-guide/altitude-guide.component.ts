import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';

/** A point of a face of the table, in the face's own pixels, lifted some way off it. */
export interface FacePoint {
  readonly surface: string;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

/**
 * The guide from the height a piece floats at to the face it stands on: the point it floats at, the
 * point of the face under it, and how many cells lie between them.
 */
export interface AltitudeGuide {
  readonly lifted: FacePoint;
  readonly ground: FacePoint;
  readonly altitude: number;
}

/**
 * The guide up from a point of a face to a piece raised some cells off it, or down to one sunk under
 * it. Nothing within half a cell of the face, nor without a point to stand it on.
 */
export function altitudeGuideOf(ground: FacePoint | null, altitude: number, gridSize: number): AltitudeGuide | null {
  if (!ground || Math.abs(altitude) < 0.5) return null;
  return { lifted: { ...ground, height: ground.height + altitude * gridSize }, ground, altitude: Math.abs(altitude) };
}

/**
 * The guide to how high a piece floats, on the screen over the table's canvas: a dashed line from
 * the height the piece floats at to the face under it, with the height written at its upper end.
 * It is laid in the box of the piece it goes with.
 */
@Component({
  selector: 'altitude-guide',
  templateUrl: './altitude-guide.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HudPlaceDirective],
})
export class AltitudeGuideComponent {
  /** The piece the guide goes with. */
  readonly owner = input.required<string>();
  readonly guide = input.required<AltitudeGuide>();
  /** The colour the line and the height are drawn in. */
  readonly colour = input('blanchedalmond');
}
