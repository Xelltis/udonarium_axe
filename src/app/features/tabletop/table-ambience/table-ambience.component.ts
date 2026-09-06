import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AmbienceService } from '@axe/application/tabletop/ambience.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import {
  groundSurfaceLayer,
  groundSurfaceWash,
  groundVaporLayer,
  vaporCellsOf,
  vaporSliceCount,
} from '@axe/domain/effect/ambience/ambience-ground';
import { EffectParticleLayer } from '@axe/domain/effect/effect-particles';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { EffectCanvasComponent } from '@axe/features/effect/effect-canvas/effect-canvas.component';
import { buildTableAmbienceContextMenuModel } from '@axe/features/tabletop/table-ambience/table-ambience-context-menu';
import { TableAmbienceSettingsComponent } from '@axe/features/tabletop/table-ambience/table-ambience-settings.component';
import { MovableDirective, MovableOption } from '@axe/ui/directives/movable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { setupMovableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { translateZCss, Z_OFFSET_AMBIENCE_PX } from '@axe/ui/tabletop/z-offset';

/**
 * How far towards the camera the effect sits, in pixels.
 * Left at the depth of the board it slips under the feet of the pieces and breaks up.
 */
const CAMERA_LIFT_PX = 8;

/** One upright sheet. Several are spaced through the depth to give it body. */
export interface VaporSlice {
  key: string;
  layer: EffectParticleLayer;
  /** Where this sheet stands within the area, in pixels, growing towards the front. */
  groundY: number;
}

@Component({
  selector: 'table-ambience',
  templateUrl: './table-ambience.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle, MovableDirective, SelectableDirective, TooltipDirective, EffectCanvasComponent],
  host: {
    class: 'block',
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class TableAmbienceComponent {
  private readonly ambienceService = inject(AmbienceService);
  private readonly tabletopService = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);

  readonly ambience = input.required<TableAmbience>();
  readonly movableOption = signal<MovableOption>({});

  /** At the depth of the board picture the fill is eaten by the floor, so it sits one layer above the mask. */
  protected readonly surfaceTransform = translateZCss(Z_OFFSET_AMBIENCE_PX);

  constructor() {
    setupMovableForPiece(this, { target: this.ambience, transformCssOffset: this.surfaceTransform });
  }

  /**
   * The version of the object.
   *
   * A computed that reads the version and returns the object hands back the same reference,
   * so nothing downstream hears it. The version itself is handed round and each value reads it.
   */
  private readonly version = computed<number>(() => this.objectChange.versionOf(this.ambience().identifier)());

  private area(): TableAmbience {
    this.version();
    return this.ambience();
  }

  readonly gridSize = computed<number>(() => this.tabletopService.gridSize());
  readonly isLock = computed<boolean>(() => this.area().isLock);
  readonly pixelWidth = computed<number>(() => Math.max(this.area().width, 1) * this.gridSize());
  readonly pixelHeight = computed<number>(() => Math.max(this.area().height, 1) * this.gridSize());

  readonly surfaceWash = computed<string>(() => {
    const area = this.area();
    return groundSurfaceWash(area.kind, area.ambienceColor, area.density);
  });

  readonly surfaceLayer = computed<EffectParticleLayer | null>(() => {
    if (!this.ambienceService.motionEnabled()) return null;
    return nonEmpty(groundSurfaceLayer(this.specOf(this.pixelWidth(), this.pixelHeight())));
  });

  /**
   * The upright part is split into several sheets through the depth.
   * One sheet over a wide area puts the far and the near at the same depth and reads as a band.
   */
  readonly vaporSlices = computed<VaporSlice[]>(() => {
    if (!this.ambienceService.motionEnabled()) return [];

    const depth = this.pixelHeight();
    const unit = this.gridSize();
    const count = vaporSliceCount(depth, unit);
    const height = unit * vaporCellsOf(this.area().kind);
    const slices: VaporSlice[] = [];

    for (let index = 0; index < count; index++) {
      const layer = groundVaporLayer({
        ...this.specOf(this.pixelWidth(), height),
        sliceIndex: index,
        sliceCount: count,
      });
      if (layer.particles.length < 1) continue;
      slices.push({ key: `vapor-${index}`, layer, groundY: ((index + 0.5) / count) * depth });
    }
    return slices;
  });

  private specOf(width: number, height: number) {
    const area = this.area();
    return {
      kind: area.kind,
      color: area.ambienceColor,
      density: area.density,
      elapsed: this.ambienceService.now(),
      phase: area.phaseOffset,
      width,
      height,
      unit: this.gridSize(),
    };
  }

  /** The canvas is larger than the area, and is offset by that margin so the particles are not cut by its edge. */
  protected canvasStyle(layer: EffectParticleLayer): Record<string, string> {
    return {
      position: 'absolute',
      left: -layer.originX + 'px',
      top: -layer.originY + 'px',
      width: layer.width + 'px',
      height: layer.height + 'px',
      'pointer-events': 'none',
    };
  }

  /** What rises faces the camera; left flat it would spread sideways. */
  protected vaporStyle(slice: VaporSlice): Record<string, string> {
    const rotation = this.uiSignalService.tableViewRotation();
    const layer = slice.layer;
    const transform =
      `translate3d(${this.pixelWidth() / 2}px, ${slice.groundY}px, 0px)` +
      ` rotateZ(${-(rotation?.z ?? 10)}deg) rotateX(${-(rotation?.x ?? 50)}deg) rotateY(${-(rotation?.y ?? 0)}deg)` +
      ` translateZ(${CAMERA_LIFT_PX}px) translate(${-layer.originX}px, ${-layer.originY}px)`;

    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: layer.width + 'px',
      height: layer.height + 'px',
      'transform-origin': '0 0',
      transform,
      'pointer-events': 'none',
    };
  }

  protected onMove(): void {
    SoundEffect.play(PresetSound.cardPick);
  }

  protected onMoved(): void {
    SoundEffect.play(PresetSound.cardPut);
  }

  protected onDragstart(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
  }

  protected onContextMenu(e: Event): void {
    e.stopPropagation();
    e.preventDefault();
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const area = this.area();
    const menuPosition = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(area, this.gridSize(), menuPosition)) return;

    const menu = buildTableAmbienceContextMenuModel(area, this.gridSize(), () => this.openSettings(area), this.t);
    const display = this.tabletopService.tabletopDisplaySettings;
    if (display.enabled()) {
      this.contextMenuService.openRadial(
        menuPosition,
        menu.actions,
        menu.radialGroups,
        area.name,
        display.radialMenuEnabled(),
        display.radialMenuRotationSpeed(),
        multiAngleFontScaleFactor(display.multiAngleFontScale())
      );
      return;
    }
    this.contextMenuService.open(menuPosition, menu.actions, area.name);
  }

  private openSettings(area: TableAmbience): void {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.t('feature.ambience.settingsTitle'),
      left: coordinate.x - 180,
      top: coordinate.y - 120,
      width: 340,
      height: 380,
    };
    const component = this.panelService.open(TableAmbienceSettingsComponent, option);
    component.target = area;
  }
}

function nonEmpty(layer: EffectParticleLayer): EffectParticleLayer | null {
  return layer.particles.length > 0 ? layer : null;
}
