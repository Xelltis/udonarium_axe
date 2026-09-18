import { TranslateFn } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuSeparator,
} from '@axe/application/ui/context-menu.service';
import {
  buildAltitudeAction,
  buildLockToggleAction,
  buildToggleAction,
} from '@axe/application/ui/tabletop-context-menu-actions';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { DOOR_STYLES, DoorStyle, Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import { drawnSlopeSides, SlopeSide, SQUARE_SLOPE_SIDES } from '@axe/domain/tabletop/terrain-slope';
import { applyLightPreset, LightPreset } from '@axe/domain/tabletop/vision-types';

export interface TerrainContextMenuModel {
  actions: ContextMenuAction[];
  radialGroups: ContextMenuRadialGroup[];
}

/** The terrain's right-click menu as a flat list, without the groups a radial menu needs. */
export function buildTerrainContextMenu(
  terrain: Terrain,
  gridSize: number,
  objectPosition: PointerCoordinate,
  inventoryService: GameObjectInventoryService,
  tabletopActionService: TabletopActionService,
  onEdit: (t: Terrain) => void,
  t: TranslateFn,
  overlapEntries: ContextMenuAction[] = []
): ContextMenuAction[] {
  return buildTerrainContextMenuModel(
    terrain,
    gridSize,
    objectPosition,
    inventoryService,
    tabletopActionService,
    onEdit,
    t,
    overlapEntries
  ).actions;
}

/**
 * The terrain's right-click menu, both as a flat list and grouped for the radial menu.
 *
 * It covers altitude and shadow, lock, slope, walls, climbing, doors, texture tiling, shading,
 * sight and light, edit, copy, delete and creating an object. Entries for other pieces under the
 * pointer lead the list, and entries that move the terrain to another surface close it. A copy is
 * placed one cell down and to the right, unlocked.
 */
export function buildTerrainContextMenuModel(
  terrain: Terrain,
  gridSize: number,
  objectPosition: PointerCoordinate,
  inventoryService: GameObjectInventoryService,
  tabletopActionService: TabletopActionService,
  onEdit: (t: Terrain) => void,
  t: TranslateFn,
  overlapEntries: ContextMenuAction[] = [],
  surfaceEntries: ContextMenuAction[] = [],
  slopeSides: readonly SlopeSide[] = SQUARE_SLOPE_SIDES
): TerrainContextMenuModel {
  const adjustedWidth = Math.max(0, terrain.width);
  const adjustedDepth = Math.max(0, terrain.depth);
  const slopesTo = drawnSlopeSides(terrain, slopeSides);

  const altitudeAction = buildAltitudeAction(terrain, t, {
    onChanged: () => inventoryService.notifyInventoryUpdate(),
    extraActions: [
      buildToggleAction(
        terrain.isDropShadow,
        (next) => (terrain.isDropShadow = next),
        {
          on: t('feature.tabletop.contextMenu.shadowShowOn'),
          off: t('feature.tabletop.contextMenu.shadowShowOff'),
        },
        () => inventoryService.notifyInventoryUpdate()
      ),
    ],
  });
  const lockAction = buildLockToggleAction(terrain.isLocked, (next) => (terrain.isLocked = next), t);
  const slopeAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.slope'),
    action: undefined,
    subActions: [
      {
        name: `${slopesTo.length < 1 ? '◉' : '○'}  ${t('feature.tabletop.contextMenu.slopeNone')}`,
        action: () => (terrain.slopeSides = []),
      },
      ContextMenuSeparator,
      ...slopeSides.map((side) => ({
        name: `${slopesTo.includes(side) ? '☑' : '☐'} ${t(`feature.tabletop.contextMenu.slopeSide_${side}`)}`,
        action: () => {
          terrain.slopeSides = slopesTo.includes(side) ? slopesTo.filter((held) => held !== side) : [...slopesTo, side];
        },
      })),
      ContextMenuSeparator,
      {
        name: `${slopesTo.length === slopeSides.length ? '☑' : '☐'} ${t('feature.tabletop.contextMenu.slopeEverySide')}`,
        action: () => {
          terrain.slopeSides = slopesTo.length === slopeSides.length ? [] : [...slopeSides];
        },
      },
    ],
  };
  const wallAction: ContextMenuAction = terrain.hasWall
    ? {
        name: t('feature.tabletop.contextMenu.wallHide'),
        action: () => {
          terrain.mode = TerrainViewState.FLOOR;
          if (adjustedDepth * adjustedWidth === 0) {
            terrain.width = adjustedWidth <= 0 ? 1 : adjustedWidth;
            terrain.depth = adjustedDepth <= 0 ? 1 : adjustedDepth;
          }
        },
      }
    : {
        name: t('feature.tabletop.contextMenu.wallShow'),
        action: () => {
          terrain.mode = TerrainViewState.ALL;
        },
      };
  const climbAction: ContextMenuAction = {
    name: (terrain.blocksClimb ? '☑ ' : '☐ ') + t('feature.tabletop.contextMenu.blocksClimb'),
    action: () => {
      terrain.blocksClimb = !terrain.blocksClimb;
      SoundEffect.play(PresetSound.sweep);
    },
  };
  const doorToggleActions: ContextMenuAction[] = terrain.isDoor
    ? [
        {
          name: terrain.isDoorOpen
            ? t('feature.tabletop.contextMenu.doorClose')
            : t('feature.tabletop.contextMenu.doorOpen'),
          action: () => {
            terrain.isDoorOpen = !terrain.isDoorOpen;
            SoundEffect.play(terrain.isDoorOpen ? PresetSound.unlock : PresetSound.lock);
          },
        },
      ]
    : [];
  const doorStyleAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.doorStyle'),
    action: undefined,
    subActions: [
      {
        name: `${terrain.doorStyle === DoorStyle.NONE ? '◉' : '○'} ${t('feature.tabletop.contextMenu.doorStyleNone')}`,
        action: () => {
          terrain.doorStyle = DoorStyle.NONE;
          terrain.isDoorOpen = false;
        },
      },
      ...DOOR_STYLES.map((style) => ({
        name: `${terrain.doorStyle === style ? '◉' : '○'} ${t('feature.tabletop.contextMenu.doorStyle' + style[0].toUpperCase() + style.slice(1))}`,
        action: () => {
          terrain.doorStyle = style;
        },
      })),
      ...(terrain.isDoor
        ? [
            ContextMenuSeparator,
            {
              name: t('feature.tabletop.contextMenu.doorFlip'),
              action: () => {
                terrain.doorMirrored = !terrain.doorMirrored;
              },
            },
          ]
        : []),
    ],
  };
  const tiledTextureAction = buildToggleAction(terrain.isTiledTexture, (next) => (terrain.isTiledTexture = next), {
    on: t('feature.tabletop.contextMenu.tiledTextureOff'),
    off: t('feature.tabletop.contextMenu.tiledTextureOn'),
  });
  const shadingAction: ContextMenuAction = terrain.isSurfaceShading
    ? {
        name: t('feature.tabletop.contextMenu.surfaceShadingOff'),
        action: () => {
          terrain.isSurfaceShading = false;
          SoundEffect.play(PresetSound.sweep);
        },
      }
    : {
        name: t('feature.tabletop.contextMenu.surfaceShadingOn'),
        action: () => {
          terrain.isSurfaceShading = true;
          SoundEffect.play(PresetSound.sweep);
        },
      };
  const shadowAction: ContextMenuAction = terrain.isDropShadow
    ? {
        name: t('feature.tabletop.contextMenu.shadowHide'),
        action: () => {
          terrain.isDropShadow = false;
          SoundEffect.play(PresetSound.sweep);
        },
      }
    : {
        name: t('feature.tabletop.contextMenu.shadowShow'),
        action: () => {
          terrain.isDropShadow = true;
          SoundEffect.play(PresetSound.sweep);
        },
      };
  const lightAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.lightSection'),
    action: undefined,
    subActions: [
      {
        name: (terrain.blocksSight ? '☑ ' : '☐ ') + t('feature.tabletop.contextMenu.blocksSight'),
        action: () => {
          terrain.blocksSight = !terrain.blocksSight;
          SoundEffect.play(PresetSound.sweep);
        },
      },
      {
        name: (terrain.blocksLight ? '☑ ' : '☐ ') + t('feature.tabletop.contextMenu.blocksLight'),
        action: () => {
          terrain.blocksLight = !terrain.blocksLight;
          SoundEffect.play(PresetSound.sweep);
        },
      },
      ContextMenuSeparator,
      {
        name: (terrain.lightEnabled ? '☑ ' : '☐ ') + t('feature.tabletop.contextMenu.terrainGlow'),
        action: () => {
          terrain.lightEnabled = !terrain.lightEnabled;
          if (terrain.lightEnabled && terrain.lightDimRadius <= 0) applyLightPreset(terrain, LightPreset.TORCH);
          SoundEffect.play(PresetSound.sweep);
        },
      },
      {
        name: t('feature.light.contextMenu.preset'),
        action: undefined,
        subActions: Object.values(LightPreset).map((preset) => ({
          name: (terrain.lightPreset === preset ? '✔ ' : '') + t('feature.light.preset.' + preset),
          action: () => {
            applyLightPreset(terrain, preset);
            terrain.lightEnabled = true;
            SoundEffect.play(PresetSound.sweep);
          },
        })),
      },
    ],
  };
  const editAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.terrainEdit'),
    action: () => {
      onEdit(terrain);
    },
  };
  const copyAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.copy'),
    action: () => {
      const cloneObject = terrain.clone();
      cloneObject.location.x += gridSize;
      cloneObject.location.y += gridSize;
      cloneObject.isLocked = false;
      if (terrain.parent) terrain.parent.appendChild(cloneObject);
      SoundEffect.play(PresetSound.blockPut);
    },
  };
  const deleteAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.delete'),
    action: () => {
      terrain.destroy();
      SoundEffect.play(PresetSound.sweep);
    },
  };
  const createAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.createObject'),
    action: undefined,
    subActions: tabletopActionService.makeDefaultContextMenuActions(objectPosition),
  };

  const shapeActions = [altitudeAction, slopeAction, wallAction, climbAction, ...doorToggleActions, doorStyleAction];
  const appearanceActions = [tiledTextureAction, shadingAction, shadowAction, lightAction];
  const moveCreateActions = [...surfaceEntries, createAction];
  const objectActions = [...overlapEntries, lockAction, editAction, copyAction, deleteAction];
  const actions: ContextMenuAction[] = [
    ...(overlapEntries.length > 0 ? [...overlapEntries, ContextMenuSeparator] : []),
    altitudeAction,
    ContextMenuSeparator,
    lockAction,
    ContextMenuSeparator,
    slopeAction,
    wallAction,
    climbAction,
    ...doorToggleActions,
    doorStyleAction,
    tiledTextureAction,
    shadingAction,
    shadowAction,
    ContextMenuSeparator,
    lightAction,
    ContextMenuSeparator,
    editAction,
    copyAction,
    deleteAction,
    ContextMenuSeparator,
    createAction,
    ...(surfaceEntries.length > 0 ? [ContextMenuSeparator, ...surfaceEntries] : []),
  ];

  return {
    actions,
    radialGroups: [
      {
        name: t('feature.tabletop.contextMenu.radialShape'),
        icon: 'landscape',
        actions: shapeActions,
      },
      {
        name: t('feature.tabletop.contextMenu.radialAppearance'),
        icon: 'visibility',
        actions: appearanceActions,
      },
      {
        name: t('feature.tabletop.contextMenu.radialMoveCreate'),
        icon: 'open_with',
        actions: moveCreateActions,
      },
      {
        name: t('feature.tabletop.contextMenu.radialObject'),
        icon: 'settings',
        actions: objectActions,
      },
    ],
  };
}
