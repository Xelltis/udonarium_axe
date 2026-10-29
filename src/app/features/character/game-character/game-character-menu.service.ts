import { inject, Injectable } from '@angular/core';
import { BattleLaunchLoaderService } from '@axe/application/battle/battle-launch-loader.service';
import { ResourceSliderService } from '@axe/application/character/resource-slider.service';
import { StealthService } from '@axe/application/character/stealth.service';
import { CharacterDiceService } from '@axe/application/dice/character-dice.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerCoordinate, PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { BoardSwitchService } from '@axe/application/tabletop/board-switch.service';
import { ConcealmentService } from '@axe/application/tabletop/concealment.service';
import { EngagementZoneService, ZoneMenuModel } from '@axe/application/tabletop/engagement-zone.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { RangeShapeInvokeService } from '@axe/application/tabletop/range-shape-invoke.service';
import { RideMenuModel, RideService } from '@axe/application/tabletop/ride.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { buildOverlapContextMenu } from '@axe/application/ui/overlap-context-menu';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { sheetPanelBox, sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { isInStore, ObjectStore } from '@axe/core/sync/object-store';
import { putOnBattleSide } from '@axe/domain/battle/battle-side';
import { type BuffViewMode } from '@axe/domain/character/buff-view-mode';
import { GameCharacter } from '@axe/domain/character/game-character';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import { buildConditionContextMenu } from '@axe/features/character/game-character/condition-context-menu';
import {
  buildGameCharacterContextMenuModel,
  FightMenuEntries,
} from '@axe/features/character/game-character/game-character-context-menu';
import { buildRideContextMenu, RideMenuEntries } from '@axe/features/character/game-character/ride-context-menu';
import {
  buildZoneContextMenu,
  buildZoneManageContextMenu,
} from '@axe/features/character/game-character/zone-context-menu';
import { GameCharacterBuffViewComponent } from '@axe/features/character/game-character-buff-view/game-character-buff-view.component';
import { buildConcealMenu } from '@axe/features/disclosure/concealment-context-menu';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';

/** What the battle stage's panel is asked, once it is open, without loading it to know its type. */
interface BattleCutInPanelHandle {
  focusOn(identifier: string): void;
}

/** What a character's menu reads of the piece as it is drawn on the table. */
export interface GameCharacterMenuHost {
  /** The name the piece is shown under, which heads its menu. */
  name(): string;
  /** How the buffs over the piece are drawn, which its menu switches. */
  buffViewMode(): BuffViewMode;
  setBuffViewMode(mode: BuffViewMode): void;
  /** The piece's box on screen, or undefined where it is not drawn. */
  bounds(): DOMRect | undefined;
  /** How far from the piece's middle, on screen, a radial menu keeps clear of what is drawn round it. */
  clearanceRadius(bounds: DOMRect): number;
}

/** The middle of a box on screen, or the fallback where there is no box. */
export function screenCentreOf(
  bounds: DOMRect | undefined,
  fallback: { x: number; y: number }
): { x: number; y: number } {
  return bounds
    ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    : { x: fallback.x, y: fallback.y };
}

/**
 * Where a right-click on a character arrives: the menu it opens, and the panels about the piece
 * that the menu opens in turn.
 */
@Injectable({ providedIn: 'root' })
export class GameCharacterMenuService {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly boardSwitches = inject(BoardSwitchService);
  private readonly concealment = inject(ConcealmentService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly characterDice = inject(CharacterDiceService);
  private readonly panelService = inject(PanelService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly pieceTarget = inject(PieceTargetService);
  private readonly tabletopService = inject(TabletopService);
  private readonly tabletopOverlap = inject(TabletopOverlapService);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly rangeShapeInvoke = inject(RangeShapeInvokeService);
  private readonly moveRangeService = inject(MoveRangeService);
  private readonly movePlan = inject(MovePlannerService);
  private readonly firstPerson = inject(FirstPersonService);
  private readonly effectLibrary = inject(EffectLibraryService);
  private readonly effectCast = inject(EffectCastService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly engagementZones = inject(EngagementZoneService);
  private readonly ride = inject(RideService);
  private readonly stealth = inject(StealthService);
  private readonly resourceSliders = inject(ResourceSliderService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly battle = inject(BattleLaunchLoaderService);
  private readonly roomPanels = inject(RoomPanelService);

  /**
   * Opens a character's menu at a position, if the reader may view the piece.
   *
   * When several pieces are selected the shared selection menu opens instead. Seen from above with
   * a radial menu style chosen, the menu opens as a radial menu around the piece, or around
   * `radialCenter` with its line drawn from `radialAnchor` where a right-drag let go of it.
   */
  open(
    char: GameCharacter,
    host: GameCharacterMenuHost,
    position: PointerCoordinate,
    radialCenter?: { x: number; y: number },
    radialAnchor?: { x: number; y: number }
  ): void {
    if (!this.disclosureService.canView(char)) return;

    const gridSize = this.tabletopService.gridSize();
    if (this.pieceContextMenu.openForSelection(char, gridSize, position)) return;
    const overlapEntries = buildOverlapContextMenu(
      this.tabletopOverlap,
      char,
      position.x,
      position.y,
      this.translateFn
    );
    const table = this.tabletopService.currentTable;
    const display = this.tabletopService.display();
    const surfaceEntries = [
      ...buildSurfaceSwitchContextMenu(char, table, this.translateFn),
      ...buildConcealMenu(this.boardSwitches.canEdit(), () => this.concealment.conceal(char), this.translateFn),
    ];
    const menu = buildGameCharacterContextMenuModel(
      char,
      gridSize,
      this.inventoryService,
      {
        onShowDetail: () => this.showDetail(char),
        onShowMemo: () => this.showMemo(char),
        onShowChatPalette: () => this.showChatPalette(char),
        onShowRemoteController: () => this.showRemoteController(char),
        onShowBuffEdit: () => this.showBuffEdit(char),
        onSelectBuffView: (mode: string) => host.setBuffViewMode(mode as BuffViewMode),
        onShowLightSettings: () => this.showLightSettings(char),
        onInvokeRangeShape: (value) => this.rangeShapeInvoke.spawnForCharacter(char, value),
        onInvokeEffect: (name) => this.invokeEffect(char, name),
        onDeployDice: () => this.characterDice.deploy(char),
        onShowBattle: () =>
          this.roomPanels.open<BattleCutInPanelHandle>('battleCutIn', {}, (panel) => panel.focusOn(char.identifier)),
        onPlayBattle: this.rolePermission.canEditTabletop() ? () => void this.playBattle(char) : undefined,
        onSetBattleSide: this.rolePermission.isGameMaster() ? (side) => putOnBattleSide(char, side) : undefined,
        onSetResourceSliders: this.resourceSliders.maySetAll(char)
          ? (shown) => this.resourceSliders.setAll(char, shown)
          : undefined,
        onPlanMove: this.mayPlanMove(char) ? () => void this.movePlan.begin(char) : undefined,
        onToggleTarget: () => this.pieceTarget.toggle(char),
        onClearTargets: this.pieceTarget.anything() ? () => this.pieceTarget.clear() : undefined,
        onViewFirstPerson: this.firstPerson.canLookOutOf(char)
          ? () => this.firstPerson.enterSeat(char.identifier)
          : undefined,
        onShareFirstPerson:
          this.firstPerson.isGameMaster() &&
          this.firstPerson.canLookOutOf(char) &&
          this.firstPerson.sharedPiece() !== char.identifier
            ? () => this.firstPerson.share(char.identifier)
            : undefined,
        onStopSharingFirstPerson:
          this.firstPerson.isGameMaster() && this.firstPerson.sharedPiece() === char.identifier
            ? () => this.firstPerson.share(null)
            : undefined,
      },
      this.translateFn,
      overlapEntries,
      host.buffViewMode(),
      surfaceEntries,
      this.fightMenuOf(char)
    );
    if (!this.tabletopService.mode2d() || display.tabletopMenuStyle === 'standard') {
      this.contextMenuService.open(position, menu.actions, host.name());
      return;
    }

    const rootBounds = host.bounds();
    const menuCenter = radialCenter ?? screenCentreOf(rootBounds, position);
    const menuClearanceRadius = rootBounds ? host.clearanceRadius(rootBounds) : 0;
    const menuOcclusionHalfExtent = rootBounds ? Math.max(rootBounds.width, rootBounds.height) / 2 : 0;
    const args = [
      menuCenter,
      menu.actions,
      menu.radialGroups,
      host.name(),
      display.tabletopMenuStyle === 'radial',
      display.radialMenuRotationSpeed,
      multiAngleFontScaleFactor(display.multiAngleFontScale),
      menuClearanceRadius,
      menuOcclusionHalfExtent,
    ] as const;
    if (radialAnchor) {
      this.contextMenuService.openRadial(...args, radialAnchor);
    } else {
      this.contextMenuService.openRadial(...args);
    }
  }

  /**
   * The entries of a piece's menu that fights and mounts bring: getting on or off, its fight, its
   * state and its being a mount, and managing the zones.
   */
  private fightMenuOf(char: GameCharacter): FightMenuEntries {
    const zoneModel = this.engagementZones.menuOf(char);
    const rideModel = this.ride.menuOf(char);
    const ride = this.rideMenuOf(char, rideModel);
    return {
      onAndOff: ride.onAndOff,
      fight: this.zoneMenuOf(char, zoneModel),
      handling: [...this.conditionMenuOf(char, zoneModel, rideModel), ...ride.group],
      manage: this.zoneManageMenuOf(char, zoneModel),
    };
  }

  private zoneMenuOf(char: GameCharacter, model: ZoneMenuModel): ContextMenuAction[] {
    const zones = this.engagementZones;
    return buildZoneContextMenu(
      model,
      this.rolePermission.canEditTabletop(),
      {
        declare: (foeId) => {
          const foe = this.objectStore.get<GameCharacter>(foeId);
          if (foe instanceof GameCharacter) zones.declare(char, foe);
        },
        join: (zoneId) => zones.join(char, zoneId),
        leave: () => zones.leave(char),
        prepareLeave: () => zones.prepareLeave(char),
        cancelLeave: () => zones.cancelLeave(char),
        toggleOffField: () => zones.toggleOffField(char),
        grab: (captiveId) => {
          const captive = this.objectStore.get<GameCharacter>(captiveId);
          if (captive instanceof GameCharacter) zones.grab(char, captive);
        },
        release: (captiveId) => {
          const captive = this.objectStore.get<GameCharacter>(captiveId);
          if (captive instanceof GameCharacter) zones.release(captive);
        },
        breakFree: () => zones.release(char),
        checkFire: () => this.showLineOfFire(char),
      },
      this.translateFn
    );
  }

  private zoneManageMenuOf(char: GameCharacter, model: ZoneMenuModel): ContextMenuAction[] {
    const zones = this.engagementZones;
    return buildZoneManageContextMenu(
      model,
      this.rolePermission.canEditTabletop(),
      this.rolePermission.isGameMaster(),
      {
        placeSides: () => this.showBattlePlacement(char),
        setSquare: (zoneId, square) => zones.setSquare(zoneId, square),
        setLimit: (zoneId, limit) => zones.setLimit(zoneId, limit),
        remove: (zoneId) => zones.remove(zoneId),
      },
      this.translateFn
    );
  }

  private conditionMenuOf(
    char: GameCharacter,
    zoneModel: ZoneMenuModel,
    rideModel: RideMenuModel
  ): ContextMenuAction[] {
    const zones = this.engagementZones;
    return buildConditionContextMenu(
      zoneModel,
      rideModel,
      this.stealth.mayToggle(char) ? { on: char.stealth === '1' } : null,
      this.rolePermission.canEditTabletop(),
      {
        setUnseen: (unseen) => zones.setUnseen(char, unseen),
        setDown: (down) => this.ride.setDown(char, down),
        setProne: (prone) => this.ride.setProne(char, prone),
        setHeld: (held) => zones.setHeld(char, held),
        setStealth: (stealth) => this.stealth.set(char, stealth),
      },
      this.translateFn
    );
  }

  /**
   * Whether a move can be worked out for a piece: by its mount where it rides in front, by none where
   * it rides otherwise, and none the rules on riding stop while turns are taken.
   */
  private mayPlanMove(char: GameCharacter): boolean {
    const mover = this.ride.moverFor(char);
    return mover !== null && this.ride.moveRefusal(char) === null && this.moveRangeService.canPlan(mover);
  }

  private rideMenuOf(char: GameCharacter, model: RideMenuModel): RideMenuEntries {
    const ride = this.ride;
    return buildRideContextMenu(
      model,
      this.rolePermission.canEditTabletop(),
      {
        getOn: (mountId, seat) => {
          const mount = this.objectStore.get<GameCharacter>(mountId);
          if (mount instanceof GameCharacter) ride.mount(char, mount, seat);
        },
        getOff: () => ride.dismount(char),
        setMountable: (mountable) => ride.setMountable(char, mountable),
        setPassenger: (passenger) => ride.setPassenger(char, passenger),
        setCargo: (cargo) => ride.setCargo(char, cargo),
        setAnyone: (anyone) => ride.setAnyone(char, anyone),
        setSeatHeight: (written) => ride.setSeatHeight(char, written),
        editSeatHeight: () => this.showSettings(char),
      },
      this.translateFn
    );
  }

  /** Fires an effect from a character sheet. It is looked up by name, so the same row works in any room. */
  /**
   * Plays the battle stage with the piece striking: at the pieces aimed at, or, with none, at the
   * other side of the master's lineup.
   */
  private async playBattle(char: GameCharacter): Promise<void> {
    const targets = this.effectCast.candidateTargets().filter((target) => target !== char);
    const battle = await this.battle.load();
    if (targets.length > 0) battle?.play({ attacker: char, defenders: targets }, 'everywhere');
    else battle?.playLineupAs(char, 'everywhere');
  }

  private invokeEffect(char: GameCharacter, name: string): void {
    const preset = this.effectLibrary.findByName(name);
    if (preset) this.effectCast.fireFromCharacter(preset, char);
  }

  private showDetail(gameObject: GameCharacter) {
    if (!this.disclosureService.canView(gameObject)) return;
    const title = sheetPanelTitle(this.translateFn('feature.character.panel.sheet'), gameObject.name);
    this.objectPanels.openSheet(gameObject, title, { width: 800, height: 600 });
  }

  /** Opens the memo kept with a piece, fetched the first time it is asked for. */
  private showMemo(gameObject: GameCharacter) {
    if (!this.disclosureService.canView(gameObject)) return;
    const at = this.pointerDeviceService.pointers[0];
    this.panelService.openLazy(
      () =>
        import('@axe/features/character/character-memo/character-memo.component').then(
          (loaded) => loaded.CharacterMemoComponent
        ),
      {
        title: this.translateFn('feature.character.memo.title', { name: gameObject.name }),
        left: at.x - 160,
        top: at.y - 120,
        width: 320,
        height: 260,
        single: `character-memo:${gameObject.identifier}`,
        stillWanted: () => isInStore(gameObject),
      },
      (memo) => memo.target.set(gameObject)
    );
  }

  /** Opens a piece's sheet on its settings, where how high a mount's riders stand is typed in. */
  private showSettings(gameObject: GameCharacter) {
    if (!this.disclosureService.canView(gameObject)) return;
    const title = sheetPanelTitle(this.translateFn('feature.character.panel.sheet'), gameObject.name);
    this.objectPanels.openSheetSettings(gameObject, title, { width: 800, height: 600 });
  }

  private showChatPalette(gameObject: GameCharacter) {
    if (!this.disclosureService.canView(gameObject)) return;
    this.objectPanels.openChatPalette(gameObject);
  }

  private showRemoteController(gameObject: GameCharacter) {
    if (!this.disclosureService.canView(gameObject)) return;
    this.objectPanels.openRemoteController(gameObject);
  }

  private showBuffEdit(gameObject: GameCharacter) {
    if (!this.disclosureService.canView(gameObject)) return;
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      left: coordinate.x,
      top: coordinate.y,
      width: 420,
      height: 300,
    };
    option.title = this.translateFn('feature.character.panel.buffEditWithName', { name: gameObject.name });
    const component = this.panelService.open<GameCharacterBuffViewComponent>(GameCharacterBuffViewComponent, option);
    component.character.set(gameObject);
  }

  /** Opens the panel that sets the sides out at the start of a fight, with this piece leading its side. */
  private showBattlePlacement(gameObject: GameCharacter) {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      left: coordinate.x,
      top: coordinate.y,
      width: 380,
      height: 420,
    };
    option.title = this.translateFn('feature.zone.placement.title');
    this.panelService.openLazy(
      () =>
        import('@axe/features/character/battle-placement-panel/battle-placement-panel.component').then(
          (m) => m.BattlePlacementPanelComponent
        ),
      { ...option, stillWanted: () => isInStore(gameObject) },
      (component) => component.leaderIdentifier.set(gameObject.identifier)
    );
  }

  /** Opens the line of fire from this piece to every piece it aims at. */
  private showLineOfFire(gameObject: GameCharacter) {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      left: coordinate.x,
      top: coordinate.y,
      width: 360,
      height: 280,
    };
    option.title = this.translateFn('feature.zone.fire.title', { name: gameObject.name });
    this.panelService.openLazy(
      () =>
        import('@axe/features/character/line-of-fire-panel/line-of-fire-panel.component').then(
          (m) => m.LineOfFirePanelComponent
        ),
      { ...option, stillWanted: () => isInStore(gameObject) },
      (component) => component.shooterIdentifier.set(gameObject.identifier)
    );
  }

  private showLightSettings(gameObject: GameCharacter) {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.translateFn('feature.character.contextMenu.lightSettings'),
      ...sheetPanelBox(coordinate, 360, 460),
    };
    this.panelService.openLazy(
      () => import('@axe/features/light-settings/light-settings.component').then((m) => m.LightSettingsComponent),
      { ...option, stillWanted: () => isInStore(gameObject) },
      (component) => {
        component.target = gameObject;
        component.showVision = true;
      }
    );
  }
}
