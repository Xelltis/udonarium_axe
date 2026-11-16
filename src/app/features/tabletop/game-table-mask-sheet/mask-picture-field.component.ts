import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * One picture of a mask in its sheet: a thumbnail, or a placeholder while its file has not come or
 * none is set, over a button to set it and, once one is set, a button to take it off.
 */
@Component({
  selector: 'mask-picture-field',
  templateUrl: './mask-picture-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SafePipe, TranslocoModule],
  host: {
    class:
      'border-ui-border-panel rounded-ui-sm bg-ui-panel flex w-36 flex-col items-center gap-1 border-2 px-1.5 py-2',
  },
})
export class MaskPictureFieldComponent {
  /** The picture: whether one is set, even while its file has not arrived, and where it is read from. */
  readonly picture = input.required<{ isSet: boolean; url: string }>();
  /** What the thumbnail reads as for whoever cannot see it. */
  readonly alt = input('');
  /** The `data-action` the set button carries. */
  readonly setAction = input.required<string>();
  /** The `data-action` the clear button carries. */
  readonly clearAction = input.required<string>();

  /** Raised when the set button is pressed. */
  readonly pick = output<void>();
  /** Raised when the clear button is pressed. */
  readonly clear = output<void>();
}
