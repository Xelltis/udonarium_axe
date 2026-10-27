import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TranslocoModule } from '@jsverse/transloco';

/** The settings of the stamp, picture or freehand line picked with the select tool, and the button that deletes it. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'map-editor-selected-item',
  templateUrl: './map-editor-selected-item.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, TranslocoModule],
})
export class MapEditorSelectedItemComponent {
  protected readonly state = inject(MapEditorState);
}
