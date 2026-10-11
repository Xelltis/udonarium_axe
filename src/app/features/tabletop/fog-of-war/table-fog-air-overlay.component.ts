import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChildren } from '@angular/core';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { FogAirLayer, fogAirLayers } from '@axe/features/tabletop/fog-of-war/fog-air-layers';
import {
  FOG_AIR_SHEET_MARGIN,
  fogAirDriftStyle,
  paintFogAirSheet,
} from '@axe/features/tabletop/fog-of-war/fog-air-sheet';

interface Sheet {
  layer: FogAirLayer;
  style: Record<string, string>;
}

/**
 * The fog that hangs in the air over ground nobody has walked to.
 *
 * The sheet is drawn small and let up to the size of the board, which is what keeps this
 * affordable: fog in the air has no edges to hold, so a board a hundred cells across is
 * still a picture a few hundred pixels wide. The drifting is a transform, so it costs the
 * browser a composite and this code nothing at all.
 */
@Component({
  selector: 'table-fog-air-overlay',
  templateUrl: './table-fog-air-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [NgStyle],
})
export class TableFogAirOverlayComponent {
  private readonly visionService = inject(VisionService);
  private readonly tabletopService = inject(TabletopService);
  private readonly canvasRefs = viewChildren<ElementRef<HTMLCanvasElement>>('sheet');

  readonly sheets = computed<Sheet[]>(() => {
    const vision = this.visionService.overlayVision();
    const table = this.tabletopService.currentTableVersion();
    if (!vision?.fogEnabled || table.gridSize <= 0) return [];
    const widthPx = table.width * table.gridSize;
    const heightPx = table.height * table.gridSize;
    if (widthPx <= 0 || heightPx <= 0) return [];

    const marginX = widthPx * FOG_AIR_SHEET_MARGIN;
    const marginY = heightPx * FOG_AIR_SHEET_MARGIN;
    return fogAirLayers(table.gridSize).map((layer) => ({
      layer,
      style: {
        position: 'absolute',
        left: -marginX + 'px',
        top: -marginY + 'px',
        width: widthPx + marginX * 2 + 'px',
        height: heightPx + marginY * 2 + 'px',
        'pointer-events': 'none',
        ...fogAirDriftStyle(layer),
      },
    }));
  });

  constructor() {
    effect(() => {
      const sheets = this.sheets();
      const vision = this.visionService.overlayVision();
      const canvases = this.canvasRefs();
      if (sheets.length === 0 || !vision) return;
      const table = this.tabletopService.currentTableVersion();
      for (let i = 0; i < canvases.length && i < sheets.length; i++) {
        paintFogAirSheet(canvases[i].nativeElement, vision, table.gridSize, i);
      }
    });
  }

  protected wrapperStyle(layer: FogAirLayer): Record<string, string> {
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: '0px',
      height: '0px',
      'transform-style': 'preserve-3d',
      transform: `translateZ(${layer.heightPx}px)`,
      'pointer-events': 'none',
    };
  }
}
