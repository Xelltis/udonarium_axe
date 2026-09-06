import { TranslateFn } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuSeparator,
} from '@axe/application/ui/context-menu.service';
import { buildAltitudeAction, buildLockToggleAction } from '@axe/application/ui/tabletop-context-menu-actions';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { RangeArea } from '@axe/domain/tabletop/range';

export interface RangeContextMenuModel {
  actions: ContextMenuAction[];
  radialGroups: ContextMenuRadialGroup[];
}

export function buildRangeContextMenu(
  range: RangeArea,
  gridSize: number,
  objectPosition: PointerCoordinate,
  objectStore: ObjectStore,
  inventoryService: GameObjectInventoryService,
  tabletopActionService: TabletopActionService,
  onDockingWindowOpen: () => void,
  onEdit: (r: RangeArea) => void,
  t: TranslateFn,
  onEditCells?: (r: RangeArea) => void
): ContextMenuAction[] {
  return buildRangeContextMenuModel(
    range,
    gridSize,
    objectPosition,
    objectStore,
    inventoryService,
    tabletopActionService,
    onDockingWindowOpen,
    onEdit,
    t,
    onEditCells
  ).actions;
}

export function buildRangeContextMenuModel(
  range: RangeArea,
  gridSize: number,
  objectPosition: PointerCoordinate,
  objectStore: ObjectStore,
  inventoryService: GameObjectInventoryService,
  tabletopActionService: TabletopActionService,
  onDockingWindowOpen: () => void,
  onEdit: (r: RangeArea) => void,
  t: TranslateFn,
  onEditCells?: (r: RangeArea) => void
): RangeContextMenuModel {
  const altitudeAction = buildAltitudeAction(range, t, {
    keepPosZ: true,
    onChanged: () => inventoryService.notifyInventoryUpdate(),
  });
  const lockAction = buildLockToggleAction(range.isLock, (next) => (range.isLock = next), t);
  const followAction = buildFollowAction(range, objectStore, onDockingWindowOpen, t);
  const shapeAction = buildShapeAction(range, t);
  const customActions = buildCustomActions(range, onEditCells, t);
  const editAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.rangeEdit'),
    action: () => onEdit(range),
  };
  const copyAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.copy'),
    action: () => {
      const cloneObject = range.clone();
      cloneObject.location.x += gridSize;
      cloneObject.location.y += gridSize;
      cloneObject.isLock = false;
      if (range.parent) range.parent.appendChild(cloneObject);
      SoundEffect.play(PresetSound.cardPut);
    },
  };
  const deleteAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.delete'),
    action: () => {
      range.destroy();
      SoundEffect.play(PresetSound.sweep);
    },
  };
  const createAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.createObject'),
    action: undefined,
    subActions: tabletopActionService.makeDefaultContextMenuActions(objectPosition),
  };

  const positionActions = [altitudeAction, lockAction, ...(followAction ? [followAction] : [])];
  const shapeActions = [shapeAction, ...customActions];
  const actions: ContextMenuAction[] = [
    ...positionActions,
    ContextMenuSeparator,
    ...shapeActions,
    ContextMenuSeparator,
    editAction,
    copyAction,
    deleteAction,
    ContextMenuSeparator,
    createAction,
  ];

  return {
    actions,
    radialGroups: [
      {
        name: t('feature.tabletop.contextMenu.radialRangePosition'),
        icon: 'my_location',
        actions: positionActions,
      },
      {
        name: t('feature.tabletop.contextMenu.radialRangeShape'),
        icon: 'category',
        actions: shapeActions,
      },
      {
        name: t('feature.tabletop.contextMenu.radialRangeEditCreate'),
        icon: 'edit',
        actions: [editAction, createAction],
      },
      {
        name: t('feature.tabletop.contextMenu.radialObject'),
        icon: 'settings',
        actions: [copyAction, deleteAction],
      },
    ],
  };
}

function buildFollowAction(
  range: RangeArea,
  objectStore: ObjectStore,
  onDockingWindowOpen: () => void,
  t: TranslateFn
): ContextMenuAction | null {
  if (!['CIRCLE', 'SQUARE', 'TRIANGLE', 'PENTAGON', 'HEXAGON'].includes(range.type)) return null;
  return objectStore.get(range.followingCharacterIdentifier) != null
    ? {
        name: t('feature.tabletop.contextMenu.unfollow'),
        action: () => {
          SoundEffect.play(PresetSound.unlock);
          range.followingCharacterIdentifier = '';
        },
      }
    : {
        name: t('feature.tabletop.contextMenu.followCharacter'),
        action: () => onDockingWindowOpen(),
      };
}

function buildShapeAction(range: RangeArea, t: TranslateFn): ContextMenuAction {
  const shapes = [
    ['LINE', 'shapeLine'],
    ['CORN', 'shapeCorn'],
    ['TRIANGLE', 'shapeTriangle'],
    ['SQUARE', 'shapeSquare'],
    ['PENTAGON', 'shapePentagon'],
    ['HEXAGON', 'shapeHexagon'],
    ['CIRCLE', 'shapeCircle'],
    ['CUSTOM', 'shapeCustom'],
  ] as const;
  return {
    name: t('feature.tabletop.contextMenu.shape'),
    action: undefined,
    subActions: shapes.map(([type, label]) => ({
      name: (range.type === type ? '✔ ' : '') + t(`feature.tabletop.contextMenu.${label}`),
      action: () => {
        range.type = type;
        SoundEffect.play(PresetSound.sweep);
      },
    })),
  };
}

function buildCustomActions(
  range: RangeArea,
  onEditCells: ((r: RangeArea) => void) | undefined,
  t: TranslateFn
): ContextMenuAction[] {
  if (range.type !== 'CUSTOM') return [];
  return [
    {
      name: t('feature.range.custom.editCells'),
      action: () => onEditCells?.(range),
    },
    {
      name: (range.isRotatable ? '☑ ' : '☐ ') + t('feature.range.custom.rotatable'),
      action: () => {
        range.isRotatable = !range.isRotatable;
        SoundEffect.play(PresetSound.sweep);
      },
    },
  ];
}
