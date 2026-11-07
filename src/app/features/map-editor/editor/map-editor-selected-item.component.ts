import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The settings of the stamp, picture or freehand line picked with the select tool, and the button that
 * deletes it; while nothing is picked, what the tool does and its keys.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'map-editor-selected-item',
  templateUrl: './map-editor-selected-item.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, TranslocoModule],
})
export class MapEditorSelectedItemComponent {
  protected readonly state = inject(MapEditorState);

  /** What the keys and the pointer do with the select tool, listed while nothing is picked. */
  protected readonly selectKeys = [
    { keys: 'feature.mapEditor.select.keysDoubleClick', what: 'feature.mapEditor.select.doubleClick' },
    { keys: 'feature.mapEditor.select.keysDelete', what: 'feature.mapEditor.select.delete' },
    { keys: 'feature.mapEditor.select.keysUndo', what: 'feature.mapEditor.select.undo' },
    { keys: 'feature.mapEditor.select.keysPan', what: 'feature.mapEditor.select.pan' },
    { keys: 'feature.mapEditor.select.keysZoom', what: 'feature.mapEditor.select.zoom' },
  ] as const;
}
