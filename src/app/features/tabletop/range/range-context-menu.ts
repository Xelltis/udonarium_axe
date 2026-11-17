import { TranslateFn } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuSeparator,
} from '@axe/application/ui/context-menu.service';
import {
  buildAltitudeAction,
  buildCopyAction,
  buildDeleteAction,
  buildLockToggleAction,
} from '@axe/application/ui/tabletop-context-menu-actions';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { RangeArea } from '@axe/domain/tabletop/range';
import { COVERED_RANGE_TYPES, FOLLOWABLE_RANGE_TYPES } from '@axe/domain/tabletop/range-coverage';
import { isAimedSolid, SolidKind, solidKindsFor } from '@axe/domain/tabletop/solid/solid-kind';
import { CreateObjectMenu } from '@axe/features/tabletop/create-menu/create-object-context-menu';

export interface RangeContextMenuModel {
  actions: ContextMenuAction[];
  radialGroups: ContextMenuRadialGroup[];
}

/**
 * A range's right-click menu, as a flat list and as groups for the radial menu.
 *
 * It offers altitude, lock and (for circles and polygons, and for any shape standing up) following a
 * character; the shape and what it stands up as, plus cell editing and rotation for a custom shape;
 * edit, copy and delete; and creating a new object at the pointer. A copy is offset by one grid cell
 * and unlocked.
 */
export function buildRangeContextMenuModel(
  range: RangeArea,
  gridSize: number,
  objectPosition: PointerCoordinate,
  objectStore: ObjectStore,
  inventoryService: GameObjectInventoryService,
  createMenu: CreateObjectMenu,
  onDockingWindowOpen: () => void,
  onEdit: (r: RangeArea) => void,
  t: TranslateFn,
  onEditCells?: (r: RangeArea) => void,
  onTargetInside?: (r: RangeArea) => void
): RangeContextMenuModel {
  const altitudeAction = buildAltitudeAction(range, t, {
    keepPosZ: true,
    onChanged: () => inventoryService.notifyInventoryUpdate(),
  });
  const lockAction = buildLockToggleAction(range.isLock, (next) => (range.isLock = next), t);
  const freeActions: ContextMenuAction[] =
    range.type === 'CUSTOM'
      ? []
      : [
          {
            name: (range.placesFreely ? '✔ ' : '') + t('feature.tabletop.contextMenu.freePlacement'),
            action: () => {
              range.placesFreely = !range.placesFreely;
              SoundEffect.play(range.placesFreely ? PresetSound.unlock : PresetSound.lock);
            },
          },
        ];
  const followAction = buildFollowAction(range, objectStore, onDockingWindowOpen, t);
  const shapeAction = buildShapeAction(range, t);
  const solidAction = buildSolidAction(range, gridSize, objectStore, t);
  const customActions = buildCustomActions(range, onEditCells, t);
  const editAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.rangeEdit'),
    action: () => onEdit(range),
  };
  const targetActions: ContextMenuAction[] =
    onTargetInside && (range.isSolid || COVERED_RANGE_TYPES.includes(range.type))
      ? [{ name: t('feature.tabletop.contextMenu.rangeTargetInside'), action: () => onTargetInside(range) }]
      : [];
  const copyAction = buildCopyAction(range, gridSize, t, {
    sound: PresetSound.cardPut,
    afterClone: (clone) => (clone.isLock = false),
  });
  const deleteAction = buildDeleteAction(range, t);
  const createAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.createObject'),
    action: undefined,
    subActions: createMenu.menuAt(objectPosition),
  };

  const positionActions = [altitudeAction, lockAction, ...freeActions, ...(followAction ? [followAction] : [])];
  const shapeActions = [shapeAction, solidAction, ...customActions, ...targetActions];
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
  const following = objectStore.get(range.followingCharacterIdentifier) != null;
  if (!following && !range.isSolid && !FOLLOWABLE_RANGE_TYPES.includes(range.type)) return null;
  return following
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

/**
 * The shapes a range can be switched to, the current one ticked. The square opens onto drawing its
 * four corners on the diagonals, as a diamond, or square to the grid.
 */
function buildShapeAction(range: RangeArea, t: TranslateFn): ContextMenuAction {
  const pick = (type: string, label: string): ContextMenuAction => ({
    name: (range.type === type ? '✔ ' : '') + t(`feature.tabletop.contextMenu.${label}`),
    action: () => {
      range.type = type;
      SoundEffect.play(PresetSound.sweep);
    },
  });
  const quadrilateral: ContextMenuAction = {
    name:
      (range.type === 'SQUARE' || range.type === 'RHOMBUS' ? '✔ ' : '') +
      t('feature.tabletop.contextMenu.shapeSquareFamily'),
    action: undefined,
    subActions: [pick('RHOMBUS', 'shapeAsDiamond'), pick('SQUARE', 'shapeAsSquare')],
  };
  return {
    name: t('feature.tabletop.contextMenu.shape'),
    action: undefined,
    subActions: [
      pick('LINE', 'shapeLine'),
      pick('CORN', 'shapeCorn'),
      pick('TRIANGLE', 'shapeTriangle'),
      quadrilateral,
      pick('PENTAGON', 'shapePentagon'),
      pick('HEXAGON', 'shapeHexagon'),
      pick('CIRCLE', 'shapeCircle'),
      pick('CUSTOM', 'shapeCustom'),
    ],
  };
}

/** The labels the kinds a range can stand up as go by in its menu. */
const SOLID_LABELS: Record<SolidKind, string> = {
  '': 'solidFlat',
  column: 'solidColumn',
  sphere: 'solidSphere',
  cone: 'solidCone',
  beam: 'solidBeam',
};

/**
 * The kinds a range can stand up as, the current one ticked, and the ways to put it back: a sphere or
 * a column following a piece onto the piece again, and a cone or a beam level again.
 */
function buildSolidAction(
  range: RangeArea,
  gridSize: number,
  objectStore: ObjectStore,
  t: TranslateFn
): ContextMenuAction {
  const pick = (kind: SolidKind): ContextMenuAction => ({
    name: (range.solidKind === kind ? '✔ ' : '') + t(`feature.tabletop.contextMenu.${SOLID_LABELS[kind]}`),
    action: () => {
      range.solidKind = kind;
      SoundEffect.play(PresetSound.sweep);
    },
  });
  const subActions: ContextMenuAction[] = solidKindsFor(range.type).map(pick);
  const following = objectStore.get(range.followingCharacterIdentifier) != null;
  if (range.keepsCasterOffset && following) {
    subActions.push({
      name: t('feature.tabletop.contextMenu.solidBackToCaster'),
      action: () => {
        range.casterOffset = { x: 0, y: 0 };
        range.altitude = 0;
        range.following(gridSize);
        SoundEffect.play(PresetSound.sweep);
      },
    });
  }
  if (isAimedSolid(range.solidKind)) {
    subActions.push({
      name: t('feature.tabletop.contextMenu.solidLevel'),
      action: () => {
        range.aimPitch = 0;
        SoundEffect.play(PresetSound.sweep);
      },
    });
  }
  return { name: t('feature.tabletop.contextMenu.solid'), action: undefined, subActions };
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
