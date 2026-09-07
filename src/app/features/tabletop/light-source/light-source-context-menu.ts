import { TranslateFn } from '@axe/application/i18n/translate.token';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuSeparator,
} from '@axe/application/ui/context-menu.service';
import { buildAltitudeAction, buildLockToggleAction } from '@axe/application/ui/tabletop-context-menu-actions';
import { LIGHT_SKIN_IDS, LightSkinId } from '@axe/domain/media/light-skins';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { applyLightPreset, LightPreset } from '@axe/domain/tabletop/vision-types';

const PRESET_LABEL_KEYS: Record<LightPreset, string> = {
  [LightPreset.CUSTOM]: 'feature.light.preset.custom',
  [LightPreset.TORCH]: 'feature.light.preset.torch',
  [LightPreset.LANTERN]: 'feature.light.preset.lantern',
  [LightPreset.CANDLE]: 'feature.light.preset.candle',
  [LightPreset.DAYLIGHT]: 'feature.light.preset.daylight',
  [LightPreset.FLASHLIGHT]: 'feature.light.preset.flashlight',
  [LightPreset.NEON]: 'feature.light.preset.neon',
  [LightPreset.SPOTLIGHT]: 'feature.light.preset.spotlight',
  [LightPreset.CAMPFIRE]: 'feature.light.preset.campfire',
  [LightPreset.SCONCE]: 'feature.light.preset.sconce',
  [LightPreset.BRAZIER]: 'feature.light.preset.brazier',
  [LightPreset.CHANDELIER]: 'feature.light.preset.chandelier',
};

export interface LightSourceContextMenuModel {
  actions: ContextMenuAction[];
  radialGroups: ContextMenuRadialGroup[];
}

export function buildLightSourceContextMenu(
  light: LightSource,
  gridSize: number,
  characters: readonly { identifier: string; name: string }[],
  onEdit: (light: LightSource) => void,
  t: TranslateFn,
  onSkin?: (skin: LightSkinId | 'library' | 'none') => void
): ContextMenuAction[] {
  return buildLightSourceContextMenuModel(light, gridSize, characters, onEdit, t, onSkin).actions;
}

export function buildLightSourceContextMenuModel(
  light: LightSource,
  gridSize: number,
  characters: readonly { identifier: string; name: string }[],
  onEdit: (light: LightSource) => void,
  t: TranslateFn,
  onSkin?: (skin: LightSkinId | 'library' | 'none') => void
): LightSourceContextMenuModel {
  const settingsAction: ContextMenuAction = {
    name: t('feature.light.contextMenu.settings'),
    action: () => onEdit(light),
  };
  const skinAction: ContextMenuAction | null = onSkin
    ? {
        name: t('feature.light.contextMenu.skin'),
        action: undefined,
        subActions: [
          ...LIGHT_SKIN_IDS.map((id) => ({
            name: t('feature.light.skin.' + id),
            action: () => onSkin(id),
          })),
          ContextMenuSeparator,
          { name: t('feature.light.contextMenu.skinFromLibrary'), action: () => onSkin('library') },
          { name: t('feature.light.contextMenu.skinNone'), action: () => onSkin('none') },
        ],
      }
    : null;
  const followAction: ContextMenuAction = {
    name: t('feature.light.contextMenu.follow'),
    action: undefined,
    subActions: [
      {
        name: (light.followingCharacterIdentifier === '' ? '✔ ' : '') + t('feature.light.contextMenu.unfollow'),
        action: () => {
          light.followingCharacterIdentifier = '';
          SoundEffect.play(PresetSound.unlock);
        },
      },
      ...characters.map((character) => ({
        name: (light.followingCharacterIdentifier === character.identifier ? '✔ ' : '') + character.name,
        action: () => {
          light.followingCharacterIdentifier = character.identifier;
          light.following();
          SoundEffect.play(PresetSound.sweep);
        },
      })),
    ],
  };
  const toggleAction: ContextMenuAction = {
    name: light.lightEnabled ? t('feature.light.contextMenu.turnOff') : t('feature.light.contextMenu.turnOn'),
    action: () => {
      light.lightEnabled = !light.lightEnabled;
      SoundEffect.play(PresetSound.sweep);
    },
  };
  const presetAction: ContextMenuAction = {
    name: t('feature.light.contextMenu.preset'),
    action: undefined,
    subActions: Object.values(LightPreset).map((preset) => ({
      name: (light.lightPreset === preset ? '✔ ' : '') + t(PRESET_LABEL_KEYS[preset]),
      action: () => {
        applyLightPreset(light, preset);
        light.lightEnabled = true;
        SoundEffect.play(PresetSound.sweep);
      },
    })),
  };
  const altitudeAction = buildAltitudeAction(light, t);
  const lockAction = buildLockToggleAction(light.isLock, (next) => (light.isLock = next), t);
  const copyAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.copy'),
    action: () => {
      const clone = light.clone();
      clone.location.x += gridSize;
      clone.location.y += gridSize;
      clone.isLock = false;
      SoundEffect.play(PresetSound.cardPut);
    },
  };
  const deleteAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.delete'),
    action: () => {
      light.destroy();
      SoundEffect.play(PresetSound.sweep);
    },
  };

  const appearanceActions = [settingsAction, ...(skinAction ? [skinAction] : []), toggleAction, presetAction];
  const positionActions = [followAction, altitudeAction];
  const objectActions = [lockAction, copyAction, deleteAction];
  return {
    actions: [
      settingsAction,
      ...(skinAction ? [skinAction] : []),
      followAction,
      toggleAction,
      presetAction,
      altitudeAction,
      lockAction,
      ContextMenuSeparator,
      copyAction,
      deleteAction,
    ],
    radialGroups: [
      {
        name: t('feature.light.contextMenu.radialAppearance'),
        icon: 'lightbulb',
        actions: appearanceActions,
      },
      {
        name: t('feature.light.contextMenu.radialPosition'),
        icon: 'my_location',
        actions: positionActions,
      },
      {
        name: t('feature.light.contextMenu.radialObject'),
        icon: 'settings',
        actions: objectActions,
      },
    ],
  };
}
