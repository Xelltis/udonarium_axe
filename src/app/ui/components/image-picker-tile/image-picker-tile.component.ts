import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/**
 * A tile that picks a picture: the picture as a thumbnail once there is one, and a dashed button
 * asking for one until then. Pressing either asks whoever uses the tile to pick.
 */
@Component({
  selector: 'ui-image-picker-tile',
  templateUrl: './image-picker-tile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SafePipe],
  host: { class: 'contents' },
})
export class UiImagePickerTileComponent {
  /** The address of the picture; empty while there is none. */
  readonly url = input.required<string>();
  /** What the thumbnail reads as for whoever cannot see it. */
  readonly alt = input('');
  /** What the dashed button says while there is no picture. */
  readonly addLabel = input.required<string>();
  /** A test id for the dashed button, for a spec to find it by. */
  readonly addTestId = input<string | null>(null);

  /** Raised when the thumbnail or the dashed button is pressed. */
  readonly pick = output<void>();
}
