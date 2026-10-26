import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { MapLayer } from '@axe/domain/map-editor/scene';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { LayerGroup } from '@axe/features/tabletop/white-board/white-board-scene';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';

export type LayerDrawerAction =
  | { kind: 'addSheet' }
  | { kind: 'makeGroup' }
  | { kind: 'toggleGroup'; group: LayerGroup }
  | { kind: 'renameGroup'; group: LayerGroup; name: string }
  | { kind: 'chooseLayer'; layer: MapLayer }
  | { kind: 'toggleLayer'; layer: MapLayer }
  | { kind: 'toggleLock'; layer: MapLayer }
  | { kind: 'renameLayer'; layer: MapLayer; name: string }
  | { kind: 'raiseLayer'; layer: MapLayer }
  | { kind: 'lowerLayer'; layer: MapLayer }
  | { kind: 'setLayerOpacity'; layer: MapLayer; opacity: number }
  | { kind: 'fileLayer'; layer: MapLayer; group: string }
  | { kind: 'clearSheet'; layer: MapLayer }
  | { kind: 'dropLayer'; layer: MapLayer }
  | { kind: 'takeOff'; object: TabletopObject };

@Component({
  selector: 'white-board-layer-drawer',
  templateUrl: './white-board-layer-drawer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TextTooltipDirective, TranslocoModule],
  host: { class: 'contents' },
})
export class WhiteBoardLayerDrawerComponent {
  private readonly t = inject(TRANSLATE_FN);

  readonly groups = input.required<LayerGroup[]>();
  readonly layerCount = input.required<number>();
  readonly groupNames = input.required<string[]>();
  readonly activeLayerId = input.required<string | null>();
  readonly standing = input.required<TabletopObject[]>();
  readonly compact = input(false);
  readonly open = input(true);

  readonly action = output<LayerDrawerAction>();

  protected layerName(layer: MapLayer): string {
    return layer.name?.length ? layer.name : this.t(`feature.whiteBoard.layer.${layer.kind}`);
  }

  protected groupLabel(group: LayerGroup): string {
    return group.name.length > 0 ? group.name : this.layerName(group.layers[0]);
  }

  protected isGroupShown(group: LayerGroup): boolean {
    return group.layers.some((layer) => layer.visible);
  }

  protected nameOf(object: TabletopObject): string {
    return object.name?.length ? object.name : object.aliasName;
  }

  protected rename(layer: MapLayer, name: string): void {
    const given = name.trim();
    const cleared = given === this.t(`feature.whiteBoard.layer.${layer.kind}`) ? '' : given;
    this.action.emit({ kind: 'renameLayer', layer, name: cleared });
  }

  protected emit(action: LayerDrawerAction): void {
    this.action.emit(action);
  }
}
