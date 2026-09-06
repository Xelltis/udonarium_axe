import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ImageTag } from '@axe/domain/media/image-tag';
import { LIGHT_IMAGE_TAG, LIGHT_SKIN_ASSET_URLS, LightSkinId } from '@axe/domain/media/light-skins';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import { LightSettingsComponent } from '@axe/features/tabletop/light-settings/light-settings.component';
import { buildLightSourceContextMenuModel } from '@axe/features/tabletop/light-source/light-source-context-menu';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { MovableDirective, MovableOption } from '@axe/ui/directives/movable.directive';
import { RotableDirective, RotableOption } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { makeBillboardTransform } from '@axe/ui/tabletop/billboard-transform';
import { setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { translateZCss, Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

@Component({
  selector: 'light-source',
  templateUrl: './light-source.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MovableDirective, RotableDirective, SelectableDirective, TooltipDirective, SafePipe],
  host: {
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    class: 'block',
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class LightSourceComponent {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly imageStorage = inject(ImageStorage);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly tabletopService = inject(TabletopService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visionService = inject(VisionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);

  readonly isHiddenByFog = computed(() => {
    const piece = this.lightSource();
    if (!piece) return false;
    this.objectChange.versionOf(piece.identifier)();
    return this.visionService.isPieceHiddenByFog(piece, 1);
  });

  readonly lightSource = input.required<LightSource>();
  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  constructor() {
    setupMovableRotableForPiece(this, {
      target: this.lightSource,
      transformCssOffset: translateZCss(Z_OFFSET_RANGE_PX),
    });
    this.objectChange.onObjectChangedFor(
      () => {
        const id = this.lightSource().followingCharacterIdentifier;
        return id ? [id] : [];
      },
      () => this.lightSource().following(),
      this.destroyRef
    );
  }

  get gridSize(): number {
    return this.tabletopService.gridSize();
  }

  readonly isLock = computed(() => {
    const light = this.lightSource();
    this.objectChange.versionOf(light.identifier)();
    return light.isLock;
  });

  readonly enabled = computed(() => {
    const light = this.lightSource();
    this.objectChange.versionOf(light.identifier)();
    return light.lightEnabled;
  });

  readonly iconColor = computed(() => {
    const light = this.lightSource();
    this.objectChange.versionOf(light.identifier)();
    return light.lightColor;
  });

  /** The picture standing in for the light, if it has been given one. */
  readonly skinUrl = computed(() => {
    const light = this.lightSource();
    this.objectChange.versionOf(light.identifier)();
    return light.imageFile.url;
  });

  private applySkin(light: LightSource, skin: LightSkinId | 'library' | 'none'): void {
    if (skin === 'library') {
      this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((identifier) => {
        if (identifier) this.setSkin(light, identifier);
      });
      return;
    }
    if (skin === 'none') {
      this.setSkin(light, '');
      return;
    }
    const url = LIGHT_SKIN_ASSET_URLS[skin];
    const existing = this.imageStorage.get(url);
    const image = existing ?? this.imageStorage.add(url);
    if (!existing) ImageTag.create(image.identifier).tag = LIGHT_IMAGE_TAG;
    this.setSkin(light, image.identifier);
  }

  private setSkin(light: LightSource, identifier: string): void {
    const element = light.imageDataElement?.getFirstElementByName('imageIdentifier');
    if (!element) return;
    element.value = identifier;
    light.update();
  }

  readonly isCone = computed(() => {
    const light = this.lightSource();
    this.objectChange.versionOf(light.identifier)();
    return light.lightAngle < 360;
  });

  readonly skinTransform = computed(() => {
    const light = this.lightSource();
    this.objectChange.versionOf(light.identifier)();
    const lift = light.altitude * this.gridSize + light.posZ + this.gridSize / 2;
    const facing = makeBillboardTransform({
      rotation: this.uiSignalService.tableViewRotation(),
      pieceRotate: 0,
      parentInverseRotation: '',
      verticalOffset3D: 0,
      mode2d: this.tabletopService.mode2d(),
    });
    return `translateZ(${lift}px) ${facing}`.replace(/\s{2,}/g, ' ');
  });

  onMove() {
    SoundEffect.play(PresetSound.cardPick);
  }

  onMoved() {
    SoundEffect.play(PresetSound.cardPut);
  }

  onRotated(degree: number) {
    this.lightSource().rotate = degree;
  }

  onDragstart(e: Event) {
    e.preventDefault();
    e.stopPropagation();
  }

  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const light = this.lightSource();
    const menuPosition = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(light, this.gridSize, menuPosition)) return;

    const characters = this.objectStore
      .getObjects(GameCharacter)
      .filter((character) => character.isVisibleOnTable)
      .map((character) => ({ identifier: character.identifier, name: character.name }));
    const menu = buildLightSourceContextMenuModel(
      light,
      this.gridSize,
      characters,
      (target) => this.openSettings(target),
      this.translateFn,
      (skin) => this.applySkin(light, skin)
    );
    const display = this.tabletopService.tabletopDisplaySettings;
    if (display.enabled()) {
      this.contextMenuService.openRadial(
        menuPosition,
        menu.actions,
        menu.radialGroups,
        light.name,
        display.radialMenuEnabled(),
        display.radialMenuRotationSpeed(),
        multiAngleFontScaleFactor(display.multiAngleFontScale())
      );
      return;
    }
    this.contextMenuService.open(menuPosition, menu.actions, light.name);
  }

  private openSettings(light: LightSource) {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.translateFn('feature.light.settings.title'),
      left: coordinate.x - 200,
      top: coordinate.y - 150,
      width: 360,
      height: 420,
    };
    const component = this.panelService.open(LightSettingsComponent, option);
    component.target = light;
    component.advanced = true;
  }
}
