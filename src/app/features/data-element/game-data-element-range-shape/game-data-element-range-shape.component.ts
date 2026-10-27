import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RangeShapeInvokeService } from '@axe/application/tabletop/range-shape-invoke.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import {
  decodeRangeShapeField,
  defaultRangeShapeFieldValue,
  encodeRangeShapeField,
  RangeShapeFieldValue,
} from '@axe/domain/data/range-shape-field';
import { buildRangeShapeThumbnail } from '@axe/domain/tabletop/range-shape-editor-utils';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'game-data-element-range-shape',
  templateUrl: './game-data-element-range-shape.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TextTooltipDirective, TranslocoModule],
  host: { class: 'contents' },
})
export class GameDataElementRangeShapeComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly rangeShapeInvoke = inject(RangeShapeInvokeService);
  private readonly t = inject(TRANSLATE_FN);

  readonly element = input.required<DataElement>();

  readonly rangeShapeValue = computed<RangeShapeFieldValue>(() => {
    const el = this.element();
    this.objectChange.versionOf(el.identifier)();
    return decodeRangeShapeField(el.currentValue) ?? defaultRangeShapeFieldValue();
  });

  readonly rangeShapeSummary = computed<string>(() => {
    const value = this.rangeShapeValue();
    if (!value.cellPattern) return this.t('feature.range.custom.emptyShape');
    const count = value.cellPattern.split(';').filter((s) => s.trim()).length;
    return this.t('feature.range.custom.cellCount', { count });
  });

  readonly rangeShapeThumbnail = computed(() => {
    const value = this.rangeShapeValue();
    return buildRangeShapeThumbnail(value.cellPattern, value.gridType);
  });

  protected async openRangeShapeEditor(): Promise<void> {
    const coordinate = this.pointerDeviceService.pointers[0];
    const initial = this.rangeShapeValue();
    const option: PanelOption = {
      title: this.t('feature.range.custom.editorTitle'),
      ...sheetPanelBox(coordinate, 640, 540),
    };
    const { RangeShapeEditorComponent } = await import('@axe/features/range-shape-editor/range-shape-editor.component');
    const editor = this.panelService.open(RangeShapeEditorComponent, option);
    editor.initialize({
      name: initial.name || this.element().name,
      cellPattern: initial.cellPattern,
      gridType: initial.gridType,
      gridColor: initial.gridColor,
      rangeColor: initial.rangeColor,
      isRotatable: initial.isRotatable,
    });
    editor.saved.subscribe((result) => {
      const el = this.element();
      el.currentValue = encodeRangeShapeField(result);
      if (result.name && result.name !== el.name) el.name = result.name;
      this.objectChange.notifyChanged(el.identifier);
    });
  }

  protected spawnRangeShape(): void {
    const value = this.rangeShapeValue();
    const character = this.owningCharacter();
    if (character) {
      this.rangeShapeInvoke.spawnForCharacter(character, value);
      return;
    }
    const coordinate = this.pointerDeviceService.pointers[0];
    this.rangeShapeInvoke.spawnAt({ x: coordinate?.x ?? 0, y: coordinate?.y ?? 0, z: 0 }, value);
  }

  private owningCharacter(): GameCharacter | null {
    let cursor: unknown = this.element();
    while (cursor) {
      if (cursor instanceof GameCharacter) return cursor;
      cursor = (cursor as { parent?: unknown }).parent;
    }
    return null;
  }
}
