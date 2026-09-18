import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { buildOverlapContextMenu } from '@axe/application/ui/overlap-context-menu';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { gridSlopeSides } from '@axe/domain/tabletop/terrain-slope';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { buildTerrainContextMenuModel } from '@axe/features/tabletop/terrain/terrain-context-menu';

/**
 * Where a right-click on a terrain arrives, whatever it was drawn in.
 *
 * A terrain is drawn by a component of its own, or together with others that do not move. Either
 * way the press lands on something that knows which terrain it is, and the menu is the same.
 */
@Injectable({ providedIn: 'root' })
export class TerrainMenuService {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly tabletopService = inject(TabletopService);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly tabletopActionService = inject(TabletopActionService);
  private readonly tabletopOverlap = inject(TabletopOverlapService);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * Opens the terrain's right-click menu at the pointer, or the menu for the whole selection when
   * the terrain is part of one.
   *
   * In the flat view with a radial menu style chosen, it opens as a radial menu.
   */
  open(terrain: Terrain): void {
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const gridSize = this.tabletopService.gridSize();
    const menuPosition = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(terrain, gridSize, menuPosition)) return;
    const objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    const overlapEntries = buildOverlapContextMenu(
      this.tabletopOverlap,
      terrain,
      menuPosition.x,
      menuPosition.y,
      this.t
    );
    const surfaceEntries = buildSurfaceSwitchContextMenu(terrain, this.tabletopService.currentTable, this.t);
    const menu = buildTerrainContextMenuModel(
      terrain,
      gridSize,
      objectPosition,
      this.inventoryService,
      this.tabletopActionService,
      (target) => this.showDetail(target),
      this.t,
      overlapEntries,
      surfaceEntries,
      gridSlopeSides(this.tabletopService.currentTable.gridType)
    );
    const display = this.tabletopService.display();
    if (this.tabletopService.mode2d() && display.tabletopMenuStyle !== 'standard') {
      this.contextMenuService.openRadial(
        menuPosition,
        menu.actions,
        menu.radialGroups,
        terrain.name,
        display.tabletopMenuStyle === 'radial',
        display.radialMenuRotationSpeed,
        multiAngleFontScaleFactor(display.multiAngleFontScale)
      );
      return;
    }
    this.contextMenuService.open(menuPosition, menu.actions, terrain.name);
  }

  private showDetail(terrain: Terrain): void {
    const title = sheetPanelTitle(this.t('feature.tabletop.panel.terrain'), terrain.name);
    this.objectPanels.openSheet(terrain, title, { width: 600, height: 300 });
  }
}
