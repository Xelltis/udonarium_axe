import { TranslateFn } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuSeparator,
} from '@axe/application/ui/context-menu.service';
import {
  buildAltitudeAction,
  buildCopyAction,
  buildLockToggleAction,
  buildToggleAction,
} from '@axe/application/ui/tabletop-context-menu-actions';
import { Network } from '@axe/core/index';
import { BUFF_VIEW_MODES } from '@axe/domain/character/buff-view-mode';
import { heldDiceOf } from '@axe/domain/character/character-dice';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import { decodeRangeShapeField, RangeShapeFieldValue } from '@axe/domain/data/range-shape-field';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { buildDisclosureContextMenu } from '@axe/features/disclosure/disclosure-context-menu';

export interface RegisteredRangeShape {
  label: string;
  value: RangeShapeFieldValue;
}

export interface GameCharacterContextMenuCallbacks {
  onShowDetail: () => void;
  onShowChatPalette: () => void;
  onShowRemoteController: () => void;
  onShowBuffEdit: () => void;
  onSelectBuffView?: (mode: string) => void;
  onShowLightSettings: () => void;
  onInvokeRangeShape?: (value: RangeShapeFieldValue) => void;
  onInvokeEffect?: (name: string) => void;
  onDeployDice?: () => void;
  /** Opens a move to be worked out. Left out for a piece with no reach to work one out in. */
  onPlanMove?: () => void;
  /** Aims at the piece, or stops aiming at it. The keys do the same on a board with a keyboard. */
  onToggleTarget?: () => void;
  /** Stops aiming at everything. Left out where nothing is aimed at. */
  onClearTargets?: () => void;
}

export interface GameCharacterContextMenuModel {
  actions: ContextMenuAction[];
  radialGroups: ContextMenuRadialGroup[];
}

export function collectRegisteredRangeShapes(char: GameCharacter): RegisteredRangeShape[] {
  const result: RegisteredRangeShape[] = [];
  const walk = (element: DataElement): void => {
    if (element.fieldType === DataElementFieldType.RANGE_SHAPE) {
      const value = decodeRangeShapeField(element.currentValue);
      if (value) {
        const label = value.name?.trim() || element.name?.trim() || '';
        result.push({ label, value });
      }
    }
    for (const child of element.children) walk(child);
  };
  for (const child of char.children) {
    if (child instanceof DataElement) walk(child);
  }
  return result;
}

/** The effects on a character sheet, so a skill or a buff can fire one straight off its row. */
export function collectRegisteredEffects(char: GameCharacter): string[] {
  const names: string[] = [];
  const walk = (element: DataElement): void => {
    if (element.fieldType === DataElementFieldType.EFFECT) {
      const name = String(element.currentValue ?? '').trim();
      if (name.length > 0 && !names.includes(name)) names.push(name);
    }
    for (const child of element.children) walk(child);
  };
  for (const child of char.children) {
    if (child instanceof DataElement) walk(child);
  }
  return names;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function buildGameCharacterContextMenu(
  char: GameCharacter,
  gridSize: number,
  inventoryService: GameObjectInventoryService,
  callbacks: GameCharacterContextMenuCallbacks,
  t: TranslateFn,
  overlapEntries: ContextMenuAction[] = [],
  buffViewMode = 'icon',
  surfaceEntries: ContextMenuAction[] = []
): ContextMenuAction[] {
  return buildGameCharacterContextMenuModel(
    char,
    gridSize,
    inventoryService,
    callbacks,
    t,
    overlapEntries,
    buffViewMode,
    surfaceEntries
  ).actions;
}

export function buildGameCharacterContextMenuModel(
  char: GameCharacter,
  gridSize: number,
  inventoryService: GameObjectInventoryService,
  callbacks: GameCharacterContextMenuCallbacks,
  t: TranslateFn,
  overlapEntries: ContextMenuAction[] = [],
  buffViewMode = 'icon',
  surfaceEntries: ContextMenuAction[] = []
): GameCharacterContextMenuModel {
  const registeredShapes = callbacks.onInvokeRangeShape ? collectRegisteredRangeShapes(char) : [];
  const registeredEffects = callbacks.onInvokeEffect ? collectRegisteredEffects(char) : [];
  const heldDice = callbacks.onDeployDice ? heldDiceOf(char) : [];
  const heldDiceCount = heldDice.reduce((total, die) => total + die.count, 0);

  const basicActions: ContextMenuAction[] = [
    {
      name: t('feature.character.contextMenu.showDetail'),
      action: () => callbacks.onShowDetail(),
    },
  ];
  const chatActions: ContextMenuAction[] = [
    {
      name: t('feature.character.contextMenu.showChatPalette'),
      action: () => callbacks.onShowChatPalette(),
    },
    {
      name: t('feature.character.contextMenu.showRemoteController'),
      action: () => callbacks.onShowRemoteController(),
    },
  ];
  const buffEffectActions: ContextMenuAction[] = [
    {
      name: t('feature.character.contextMenu.editBuff'),
      action: () => callbacks.onShowBuffEdit(),
    },
    ...(callbacks.onSelectBuffView
      ? [
          {
            name: t('feature.character.contextMenu.buffView'),
            action: undefined,
            subActions: BUFF_VIEW_MODES.map((mode) => ({
              name: (buffViewMode === mode ? '✔ ' : '') + t(`feature.character.buff.view${capitalize(mode)}`),
              action: () => callbacks.onSelectBuffView?.(mode),
            })),
          },
        ]
      : []),
    ...(registeredShapes.length > 0 && callbacks.onInvokeRangeShape
      ? [
          {
            name: t('feature.character.contextMenu.invokeRangeShape'),
            action: undefined,
            subActions: registeredShapes.map((shape, index) => ({
              name: shape.label || t('feature.range.custom.unnamedShape', { index: index + 1 }),
              action: () => {
                callbacks.onInvokeRangeShape?.(shape.value);
              },
            })),
          } as ContextMenuAction,
        ]
      : []),
    ...(heldDiceCount > 0 && callbacks.onDeployDice
      ? [
          {
            name: t('feature.character.contextMenu.deployDice', { count: heldDiceCount }),
            action: () => callbacks.onDeployDice?.(),
          } as ContextMenuAction,
        ]
      : []),
    ...(registeredEffects.length > 0 && callbacks.onInvokeEffect
      ? [
          {
            name: t('feature.character.contextMenu.invokeEffect'),
            action: undefined,
            subActions: registeredEffects.map((name) => ({
              name,
              action: () => {
                callbacks.onInvokeEffect?.(name);
              },
            })),
          } as ContextMenuAction,
        ]
      : []),
  ];
  const lightActions: ContextMenuAction[] = [
    ...(callbacks.onPlanMove
      ? [
          {
            name: t('feature.character.contextMenu.planMove'),
            action: () => callbacks.onPlanMove?.(),
          } as ContextMenuAction,
        ]
      : []),
    {
      name: t('feature.character.contextMenu.lightSettings'),
      action: () => callbacks.onShowLightSettings(),
    },
    {
      name: (char.showVisionRange ? '✔ ' : '') + t('feature.character.contextMenu.showVisionRange'),
      action: () => (char.showVisionRange = !char.showVisionRange),
    },
    ...(callbacks.onToggleTarget
      ? [
          {
            name: (char.targeted ? '✔ ' : '') + t('feature.character.contextMenu.target'),
            action: () => callbacks.onToggleTarget?.(),
          } as ContextMenuAction,
        ]
      : []),
    ...(callbacks.onClearTargets
      ? [
          {
            name: t('feature.character.contextMenu.clearTargets'),
            action: () => callbacks.onClearTargets?.(),
          } as ContextMenuAction,
        ]
      : []),
  ];
  const openActions = [...basicActions, ...chatActions, ...buffEffectActions, ...lightActions];

  // display settings
  const displayActions: ContextMenuAction[] = [
    buildAltitudeAction(char, t, {
      onChanged: () => inventoryService.notifyInventoryUpdate(),
      extraActions: [
        buildToggleAction(
          char.isDropShadow,
          (next) => (char.isDropShadow = next),
          {
            on: t('feature.tabletop.contextMenu.shadowShowOn'),
            off: t('feature.tabletop.contextMenu.shadowShowOff'),
          },
          () => inventoryService.notifyInventoryUpdate()
        ),
      ],
    }),
    {
      name: t('feature.character.contextMenu.displaySettings'),
      action: undefined,
      subActions: [
        char.hideName
          ? {
              name: t('feature.character.contextMenu.hideNameOn'),
              action: () => {
                char.hideName = false;
                SoundEffect.play(PresetSound.sweep);
              },
            }
          : {
              name: t('feature.character.contextMenu.hideNameOff'),
              action: () => {
                char.hideName = true;
                SoundEffect.play(PresetSound.sweep);
              },
            },
        char.hideBuff
          ? {
              name: t('feature.character.contextMenu.hideBuffOn'),
              action: () => {
                char.hideBuff = false;
                SoundEffect.play(PresetSound.sweep);
              },
            }
          : {
              name: t('feature.character.contextMenu.hideBuffOff'),
              action: () => {
                char.hideBuff = true;
                SoundEffect.play(PresetSound.sweep);
              },
            },
        ...(PeerCursor.isMyselfGameMaster
          ? [
              char.isNpc
                ? {
                    name: t('feature.character.contextMenu.npcOn'),
                    action: () => {
                      char.isNpc = false;
                      SoundEffect.play(PresetSound.sweep);
                    },
                  }
                : {
                    name: t('feature.character.contextMenu.npcOff'),
                    action: () => {
                      char.isNpc = true;
                      SoundEffect.play(PresetSound.sweep);
                    },
                  },
            ]
          : []),
      ],
    },
    char.hideInventory
      ? {
          name: t('feature.character.contextMenu.hideInventoryOn'),
          action: () => {
            char.hideInventory = false;
            inventoryService.notifyInventoryUpdate();
            SoundEffect.play(PresetSound.sweep);
          },
        }
      : {
          name: t('feature.character.contextMenu.hideInventoryOff'),
          action: () => {
            char.hideInventory = true;
            inventoryService.notifyInventoryUpdate();
            SoundEffect.play(PresetSound.sweep);
          },
        },
    char.noTurn
      ? {
          name: t('feature.character.contextMenu.noTurnOn'),
          action: () => {
            char.noTurn = false;
            inventoryService.notifyInventoryUpdate();
            SoundEffect.play(PresetSound.sweep);
          },
        }
      : {
          name: t('feature.character.contextMenu.noTurnOff'),
          action: () => {
            char.noTurn = true;
            inventoryService.notifyInventoryUpdate();
            SoundEffect.play(PresetSound.sweep);
          },
        },
    char.nonTalkFlag
      ? {
          name: t('feature.character.contextMenu.nonTalkOn'),
          action: () => {
            char.nonTalkFlag = false;
            inventoryService.notifyInventoryUpdate();
            SoundEffect.play(PresetSound.sweep);
          },
        }
      : {
          name: t('feature.character.contextMenu.nonTalkOff'),
          action: () => {
            char.nonTalkFlag = true;
            inventoryService.notifyInventoryUpdate();
            SoundEffect.play(PresetSound.sweep);
          },
        },
  ];

  // moving it
  const moveActions: ContextMenuAction[] = [
    {
      name: t('feature.character.contextMenu.moveCommon'),
      action: () => {
        char.setLocation('common');
        SoundEffect.play(PresetSound.piecePut);
      },
    },
    {
      name: t('feature.character.contextMenu.movePersonal'),
      action: () => {
        char.setLocation(Network.peerId);
        SoundEffect.play(PresetSound.piecePut);
      },
    },
    {
      name: t('feature.character.contextMenu.moveGraveyard'),
      action: () => {
        char.setLocation('graveyard');
        SoundEffect.play(PresetSound.sweep);
      },
    },
  ];

  const disclosureActions = buildDisclosureContextMenu(char, t);
  const objectActions: ContextMenuAction[] = [
    ...overlapEntries,
    buildLockToggleAction(char.isLock, (next) => (char.isLock = next), t),
    buildCopyAction(char, gridSize, t),
  ];

  const actions: ContextMenuAction[] = [
    ...(overlapEntries.length > 0 ? [...overlapEntries, ContextMenuSeparator] : []),
    ...openActions,
    ContextMenuSeparator,
    ...displayActions,
    // who may see it and who owns it, with permission, after a separator
    ...disclosureActions,
    ContextMenuSeparator,
    ...moveActions,
    ContextMenuSeparator,
    ...objectActions.slice(overlapEntries.length),
    ...(surfaceEntries.length > 0 ? [ContextMenuSeparator, ...surfaceEntries] : []),
  ];
  const radialGroups: ContextMenuRadialGroup[] = [
    {
      name: t('feature.character.contextMenu.radialBasic'),
      icon: 'badge',
      actions: basicActions,
    },
    {
      name: t('feature.character.contextMenu.radialChat'),
      icon: 'chat',
      actions: chatActions,
    },
    {
      name: t('feature.character.contextMenu.radialBuffEffect'),
      icon: 'auto_awesome',
      actions: buffEffectActions,
    },
    {
      name: t('feature.character.contextMenu.radialDisplay'),
      icon: 'visibility',
      actions: [...lightActions, ...displayActions],
    },
    {
      name: t('feature.character.contextMenu.radialMove'),
      icon: 'open_with',
      actions: [...moveActions, ...surfaceEntries],
    },
    {
      name: t('feature.character.contextMenu.radialDisclosure'),
      icon: 'group',
      actions: disclosureActions,
    },
    {
      name: t('feature.character.contextMenu.radialObject'),
      icon: 'settings',
      actions: objectActions,
    },
  ];

  return { actions, radialGroups };
}
