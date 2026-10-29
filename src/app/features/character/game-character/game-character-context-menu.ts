import { TranslateFn } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuSeparator,
  ContextMenuType,
} from '@axe/application/ui/context-menu.service';
import {
  buildAltitudeAction,
  buildCopyAction,
  buildLockToggleAction,
  buildToggleAction,
} from '@axe/application/ui/tabletop-context-menu-actions';
import { Network } from '@axe/core/index';
import type { BattleSide } from '@axe/domain/battle/battle-lineup';
import { BUFF_VIEW_MODES } from '@axe/domain/character/buff-view-mode';
import { heldDiceOf } from '@axe/domain/character/character-dice';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import { sheetElementsOf } from '@axe/domain/data/data-element-templates';
import { decodeRangeShapeField, RangeShapeFieldValue } from '@axe/domain/data/range-shape-field';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { asMoveMode, MOVE_MODES } from '@axe/domain/tabletop/move/move-mode';
import { buildDisclosureContextMenu } from '@axe/features/disclosure/disclosure-context-menu';

export interface RegisteredRangeShape {
  label: string;
  value: RangeShapeFieldValue;
}

export interface GameCharacterContextMenuCallbacks {
  onShowDetail: () => void;
  /** Opens the memo kept with the piece. */
  onShowMemo: () => void;
  onShowChatPalette: () => void;
  onShowRemoteController: () => void;
  onShowBuffEdit: () => void;
  onSelectBuffView?: (mode: string) => void;
  onShowLightSettings: () => void;
  onInvokeRangeShape?: (value: RangeShapeFieldValue) => void;
  onInvokeEffect?: (name: string) => void;
  onDeployDice?: () => void;
  /** Opens the battle stage's panel on the piece, to choose what it strikes with. */
  onShowBattle?: () => void;
  /** Plays the battle stage with the piece striking. Left out for a seat that may not play it. */
  onPlayBattle?: () => void;
  /** Puts the piece on a side of the battle stage's lineup, or takes it off. Left out but for the master. */
  onSetBattleSide?: (side: BattleSide | null) => void;
  /** The side the piece stands on in a battle now, its own or its party's, marked among the sides offered. */
  battleSide?: BattleSide | null;
  /**
   * Gives every resource of the piece a slider, or takes them all away. Left out for a seat that may
   * not, or a piece with no resource.
   */
  onSetResourceSliders?: (shown: boolean) => void;
  /** Opens a move to be worked out. Left out for a piece with no reach to work one out in. */
  onPlanMove?: () => void;
  /** Aims at the piece, or stops aiming at it. The keys do the same on a board with a keyboard. */
  onToggleTarget?: () => void;
  /** Stops aiming at everything. Left out where nothing is aimed at. */
  onClearTargets?: () => void;
  onViewFirstPerson?: () => void;
  onShareFirstPerson?: () => void;
  onStopSharingFirstPerson?: () => void;
}

/**
 * The entries of a piece's menu that fights and mounts bring, built where the zones and mounts are
 * known, each set into the part of the menu it goes with.
 */
export interface FightMenuEntries {
  /** Getting on or off a mount, offered with working a move out. */
  readonly onAndOff: ContextMenuAction[];
  /** The fight the piece is in or may start, offered with what else the piece is used for. */
  readonly fight: ContextMenuAction[];
  /** The piece's state and its being a mount, offered with how it is shown and handled. */
  readonly handling: ContextMenuAction[];
  /** Managing the zones, for whoever keeps the table, closing the menu. */
  readonly manage: ContextMenuAction[];
}

const NO_FIGHT_ENTRIES: FightMenuEntries = { onAndOff: [], fight: [], handling: [], manage: [] };

export interface GameCharacterContextMenuModel {
  actions: ContextMenuAction[];
  radialGroups: ContextMenuRadialGroup[];
}

/**
 * Collects the range shapes registered on a character sheet, in sheet order, for the menu's
 * invoke-range entry.
 *
 * Each is labelled with the shape's own name, else the field's name, else left empty. Fields whose
 * value does not decode as a shape are skipped.
 */
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
  for (const child of sheetElementsOf(char)) walk(child);
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
  for (const child of sheetElementsOf(char)) walk(child);
  return names;
}

/**
 * The battle stage, from the piece: play it with the piece striking, choose what it strikes with,
 * and, for the master, the side of the lineup it stands on.
 */
function buildBattleAction(
  char: GameCharacter,
  callbacks: GameCharacterContextMenuCallbacks,
  t: TranslateFn
): ContextMenuAction {
  const sides: (BattleSide | null)[] = ['left', 'right', null];
  return {
    name: t('feature.character.contextMenu.battle'),
    action: undefined,
    subActions: [
      ...(callbacks.onPlayBattle
        ? [{ name: t('feature.character.contextMenu.battlePlay'), action: () => callbacks.onPlayBattle?.() }]
        : []),
      { name: t('feature.character.contextMenu.battleEffect'), action: () => callbacks.onShowBattle?.() },
      ...(callbacks.onSetBattleSide
        ? sides.map((side) => ({
            name:
              ((callbacks.battleSide ?? null) === side ? '✔ ' : '') +
              t(`feature.character.contextMenu.battleSide_${side ?? 'none'}`),
            action: () => callbacks.onSetBattleSide?.(side),
          }))
        : []),
    ],
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The flat list of entries for a character's context menu, as `buildGameCharacterContextMenuModel`
 * builds them, without the radial grouping.
 */
export function buildGameCharacterContextMenu(
  char: GameCharacter,
  gridSize: number,
  inventoryService: GameObjectInventoryService,
  callbacks: GameCharacterContextMenuCallbacks,
  t: TranslateFn,
  overlapEntries: ContextMenuAction[] = [],
  buffViewMode = 'icon',
  surfaceEntries: ContextMenuAction[] = [],
  fightEntries: FightMenuEntries = NO_FIGHT_ENTRIES
): ContextMenuAction[] {
  return buildGameCharacterContextMenuModel(
    char,
    gridSize,
    inventoryService,
    callbacks,
    t,
    overlapEntries,
    buffViewMode,
    surfaceEntries,
    fightEntries
  ).actions;
}

/**
 * Builds a character's context menu, both as a flat list and grouped for the radial menu.
 *
 * An entry whose callback is left out is left out of the menu, as are range shapes, effects and
 * held dice the character does not have. Overlap entries lead the flat list and surface entries
 * close it. What fights and mounts bring is set among the rest by what it goes with: getting on or
 * off with working a move out, the fight with what else the piece is used for, its state and its
 * being a mount with how it is shown and handled, and managing the zones last. The display toggles
 * write the character directly and tell the inventory to refresh, and the NPC toggle is offered only
 * to the game master.
 */
export function buildGameCharacterContextMenuModel(
  char: GameCharacter,
  gridSize: number,
  inventoryService: GameObjectInventoryService,
  callbacks: GameCharacterContextMenuCallbacks,
  t: TranslateFn,
  overlapEntries: ContextMenuAction[] = [],
  buffViewMode = 'icon',
  surfaceEntries: ContextMenuAction[] = [],
  fightEntries: FightMenuEntries = NO_FIGHT_ENTRIES
): GameCharacterContextMenuModel {
  const registeredShapes = callbacks.onInvokeRangeShape ? collectRegisteredRangeShapes(char) : [];
  const registeredEffects = callbacks.onInvokeEffect ? collectRegisteredEffects(char) : [];
  const heldDice = callbacks.onDeployDice ? heldDiceOf(char) : [];
  const heldDiceCount = heldDice.reduce((total, die) => total + die.count, 0);

  // Working a move out comes before anything else a piece is asked, since it is what a piece
  // is picked up for; the rest of the move entries are about which pile it belongs in.
  // How a piece is getting about goes with working its move out and is offered with it: a
  // piece with no reach to show has nothing to get about by either.
  const planActions: ContextMenuAction[] = callbacks.onPlanMove
    ? [
        {
          name: t('feature.character.contextMenu.planMove'),
          action: () => callbacks.onPlanMove?.(),
        } as ContextMenuAction,
        {
          name: t('feature.character.contextMenu.moveMode'),
          action: undefined,
          subActions: MOVE_MODES.map((mode) => ({
            name: (asMoveMode(char.moveMode) === mode ? '✔ ' : '') + t(`feature.character.moveMode_${mode}`),
            action: () => (char.moveMode = mode),
          })),
        } as ContextMenuAction,
      ]
    : [];

  const basicActions: ContextMenuAction[] = [
    {
      name: t('feature.character.contextMenu.showDetail'),
      action: () => callbacks.onShowDetail(),
    },
    {
      name: t('feature.character.contextMenu.memo'),
      action: () => callbacks.onShowMemo(),
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
    ...(callbacks.onShowBattle ? [buildBattleAction(char, callbacks, t)] : []),
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
    {
      name: t('feature.character.contextMenu.lightSettings'),
      action: () => callbacks.onShowLightSettings(),
    },
    {
      name: (char.showVisionRange ? '✔ ' : '') + t('feature.character.contextMenu.showVisionRange'),
      action: () => (char.showVisionRange = !char.showVisionRange),
    },
    ...(callbacks.onViewFirstPerson
      ? [{ name: t('feature.character.contextMenu.viewFirstPerson'), action: () => callbacks.onViewFirstPerson?.() }]
      : []),
    ...(callbacks.onShareFirstPerson
      ? [{ name: t('feature.character.contextMenu.shareFirstPerson'), action: () => callbacks.onShareFirstPerson?.() }]
      : []),
    ...(callbacks.onStopSharingFirstPerson
      ? [
          {
            name: t('feature.character.contextMenu.stopSharingFirstPerson'),
            action: () => callbacks.onStopSharingFirstPerson?.(),
          },
        ]
      : []),
  ];

  // display settings
  const altitudeAction = buildAltitudeAction(char, t, {
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
  });
  const lookToggles: ContextMenuAction[] = [
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
  ];
  const handlingToggles: ContextMenuAction[] = [
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
    ...(callbacks.onSetResourceSliders
      ? [
          {
            name: t('feature.character.contextMenu.resourceSliders'),
            action: undefined,
            subActions: [true, false].map((shown) => ({
              name: t(`feature.character.contextMenu.resourceSliders${shown ? 'ShowAll' : 'HideAll'}`),
              action: () => {
                callbacks.onSetResourceSliders?.(shown);
                SoundEffect.play(PresetSound.sweep);
              },
            })),
          },
        ]
      : []),
  ];
  const displayActions: ContextMenuAction[] = [
    altitudeAction,
    { name: t('feature.character.contextMenu.displaySettings'), action: undefined, subActions: lookToggles },
    ...handlingToggles,
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

  const disclosureActions = buildDisclosureContextMenu(char, t).filter(
    (entry) => entry.type !== ContextMenuType.SEPARATOR
  );
  const objectActions: ContextMenuAction[] = [
    ...overlapEntries,
    buildLockToggleAction(char.isLock, (next) => (char.isLock = next), t),
    buildCopyAction(char, gridSize, t),
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

  // What is opened most is left a click away; what is set now and then is gathered in a few
  // named groups, so the list stays short enough to read at a glance.
  const group = (key: string, subActions: ContextMenuAction[]): ContextMenuAction[] =>
    subActions.length > 0 ? [{ name: t(`feature.character.contextMenu.${key}`), action: undefined, subActions }] : [];
  const movingActions = [...planActions, ...fightEntries.onAndOff];
  const closingActions = [...surfaceEntries, ...fightEntries.manage];
  const actions: ContextMenuAction[] = [
    ...(overlapEntries.length > 0 ? [...overlapEntries, ContextMenuSeparator] : []),
    ...(movingActions.length > 0 ? [...movingActions, ContextMenuSeparator] : []),
    ...basicActions,
    ...chatActions,
    ...group('buffGroup', buffEffectActions),
    ...group('sightGroup', lightActions),
    ...fightEntries.fight,
    ContextMenuSeparator,
    ...group('handlingGroup', [...lookToggles, ...handlingToggles, altitudeAction]),
    ...fightEntries.handling,
    ...group('disclosureGroup', disclosureActions),
    ContextMenuSeparator,
    ...group('putAwayGroup', moveActions),
    ContextMenuSeparator,
    ...objectActions.slice(overlapEntries.length),
    ...(closingActions.length > 0 ? [ContextMenuSeparator, ...closingActions] : []),
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
      actions: [...lightActions, ...displayActions, ...fightEntries.handling],
    },
    {
      name: t('feature.character.contextMenu.radialZone'),
      icon: 'sports_kabaddi',
      actions: [...fightEntries.fight, ...fightEntries.manage],
    },
    {
      name: t('feature.character.contextMenu.radialMove'),
      icon: 'open_with',
      actions: [...planActions, ...fightEntries.onAndOff, ...moveActions, ...surfaceEntries],
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
