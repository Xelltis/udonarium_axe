import { readFileSync } from 'node:fs';

import { CHAT_SOUND_TYPES } from '@axe/domain/chat/chat-sound';
import { AMBIENCE_BRIGHTNESS } from '@axe/domain/effect/ambience/ambience-brightness';
import { HOTBAR_SLOT_KINDS } from '@axe/domain/hotbar/hotbar-slot-kind';
import { CUT_IN_EASING_NAMES } from '@axe/domain/media/cubic-bezier';
import { CUT_IN_ENTRANCES, CUT_IN_EXITS } from '@axe/domain/media/cut-in-animation-presets';
import { CUT_IN_CLIPS } from '@axe/domain/media/cut-in-clip';
import { CUT_IN_EFFECTS } from '@axe/domain/media/cut-in-effect';
import { CUT_IN_FILL_SHAPES } from '@axe/domain/media/cut-in-fill';
import { CUT_IN_TEXT_ALIGNS } from '@axe/domain/media/cut-in-layer';
import { CUT_IN_LAYER_PRESETS } from '@axe/domain/media/cut-in-layer-presets';
import { CUT_IN_WIPES } from '@axe/domain/media/cut-in-wipe';
import { LIGHT_SKIN_IDS } from '@axe/domain/media/light-skins';
import { DUNGEON_PROP_IDS, TEXTURE_IDS, WALL_TEXTURE_IDS } from '@axe/domain/media/texture-catalog';
import {
  SWITCH_ACTION_KINDS,
  SWITCH_SECRET_READERS,
  SWITCH_SPAWN_PLACES,
  SWITCH_SPEAKERS,
  SWITCH_TOGGLES,
} from '@axe/domain/tabletop/board-switch/switch-definition';
import { SWITCH_REFUSALS } from '@axe/domain/tabletop/board-switch/switch-press-rules';
import {
  DUNGEON_ATMOSPHERE_IDS,
  DUNGEON_ENTRANCE_STYLES,
  DUNGEON_ROLE_NAMINGS,
} from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import { DUNGEON_ROOM_ROLES, FURNISHING_IDS } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { FIELD_ATMOSPHERE_IDS, FIELD_PROP_IDS } from '@axe/domain/tabletop/field/field-atmosphere';
import { TOWN_PIECE_IDS } from '@axe/domain/tabletop/field/field-blocks';
import { MAP_FUNCTION_ROLES } from '@axe/domain/tabletop/function-paint';
import { HAZARD_KINDS } from '@axe/domain/tabletop/hazard-presets';
import { MOVE_MODES } from '@axe/domain/tabletop/move/move-mode';
import { PIECE_PASSAGE_MODES } from '@axe/domain/tabletop/move/piece-passage';
import { HOSTILITY_BY, ZOC_MODES } from '@axe/domain/tabletop/move/zone-of-control';
import { SHOWN_TO } from '@axe/domain/tabletop/shown-to';
import { TABLE_FACING_MARKS } from '@axe/domain/tabletop/table-facing-mark';
import { TRAP_KINDS } from '@axe/domain/tabletop/trap-presets';
import { TRIGGER_MOMENTS, TRIGGER_REPEATS, TRIGGER_TARGETS } from '@axe/domain/tabletop/trigger-event';
import { FACTION_PHASE_MODES, TURN_ORDER_MODES } from '@axe/domain/tabletop/turn-order-mode';
import { LightPreset } from '@axe/domain/tabletop/vision-types';
import { DEFAULT_MENU_LAYOUTS } from '@axe/domain/ui/builtin-menu-layouts';
import { MENU_COMMANDS } from '@axe/domain/ui/menu-command';
import { isMenuGroup } from '@axe/domain/ui/menu-layout';
import { VIEW_MODES } from '@axe/domain/ui/view-mode';
import { FIRST_PERSON_FACING_NAMES, FIRST_PERSON_PAD_LABELS } from '@axe/features/first-person/first-person-hud';
import { MAP_KINDS } from '@axe/features/tabletop/dungeon-generator/dungeon-generator.component';
const HOTBAR_FAILURES = ['noCharacter', 'notFound', 'noTab', 'offTable', 'empty', 'notAllowed', 'unavailable'] as const;

/**
 * A screen that builds its key out of a value — `'…clip' + shape` — puts that key beyond
 * the reach of the check that reads the templates, because there is nothing to read until
 * it runs. So the values are taken from where they are declared and matched against the
 * dictionaries here. A new shape with no name to show is then a failing test rather than
 * a raw key on someone's screen.
 */
const CHOICES: Record<string, readonly string[]> = {
  'feature.firstPerson.facing.': FIRST_PERSON_FACING_NAMES,
  'feature.firstPerson.hud.': FIRST_PERSON_PAD_LABELS,
  'common.textures.': [...TEXTURE_IDS, ...WALL_TEXTURE_IDS, ...DUNGEON_PROP_IDS],
  'feature.light.skin.': LIGHT_SKIN_IDS,
  'feature.light.preset.': Object.values(LightPreset),
  'feature.tabletop.dungeonGenerator.atmosphere.': DUNGEON_ATMOSPHERE_IDS,
  'feature.tabletop.dungeonGenerator.entrance.': DUNGEON_ENTRANCE_STYLES,
  'feature.tabletop.dungeonGenerator.role.': DUNGEON_ROOM_ROLES,
  'feature.tabletop.dungeonGenerator.field.': FIELD_ATMOSPHERE_IDS,
  'feature.tabletop.dungeonGenerator.prop.': [...FIELD_PROP_IDS, 'building'],
  'feature.tabletop.dungeonGenerator.piece.': [...FIELD_PROP_IDS, ...TOWN_PIECE_IDS, ...FURNISHING_IDS, 'hiddenDoor'],
  ...Object.fromEntries(
    DUNGEON_ROLE_NAMINGS.map((naming) => [`feature.tabletop.dungeonGenerator.roleIn.${naming}.`, DUNGEON_ROOM_ROLES])
  ),
  'feature.tabletop.dungeonGenerator.kind.': MAP_KINDS,
  'feature.tabletop.dungeonGenerator.trap.': TRAP_KINDS,
  'feature.chat.messageSetting.soundType_': CHAT_SOUND_TYPES,
  'feature.roomSettings.facingMark_': TABLE_FACING_MARKS,
  'feature.roomSettings.zocMode_': ZOC_MODES,
  'feature.roomSettings.hostilityBy_': HOSTILITY_BY,
  'feature.roomSettings.piecePassage_': PIECE_PASSAGE_MODES,
  'feature.ambience.brightness_': AMBIENCE_BRIGHTNESS,
  'feature.tabletop.shownTo_': SHOWN_TO,
  'feature.character.moveMode_': MOVE_MODES,
  'feature.mapEditor.function.role_': MAP_FUNCTION_ROLES,
  'feature.mapEditor.function.triggerMoment_': TRIGGER_MOMENTS,
  'feature.mapEditor.function.triggerRepeat_': TRIGGER_REPEATS,
  'feature.mapEditor.function.hazardKind_': HAZARD_KINDS,
  'feature.mapEditor.function.triggerTargets_': TRIGGER_TARGETS,
  'feature.roomSettings.turnOrderMode_': TURN_ORDER_MODES,
  'feature.roomSettings.factionPhaseMode_': FACTION_PHASE_MODES,
  'feature.hotbar.kind.': HOTBAR_SLOT_KINDS,
  'feature.hotbar.kindHint.': HOTBAR_SLOT_KINDS,
  'feature.hotbar.failure.': HOTBAR_FAILURES,
  'feature.hotbar.mode.': ['cast', 'field', 'preview'],
  'feature.hotbar.panelName.': ['chatPalette', 'sheet', 'remoteController'],
  'feature.hotbar.turnAction.': ['next', 'prev', 'reset'],
  'feature.media.cutInEditor.clip': CUT_IN_CLIPS,
  'feature.media.cutInEditor.wipe': CUT_IN_WIPES,
  'feature.media.cutInEditor.effect': CUT_IN_EFFECTS,
  'feature.media.cutInEditor.fillShape': CUT_IN_FILL_SHAPES,
  'feature.media.cutInEditor.align': CUT_IN_TEXT_ALIGNS,
  'feature.media.cutInEditor.easing': CUT_IN_EASING_NAMES,
  'feature.media.cutInEditor.look': CUT_IN_LAYER_PRESETS.map((preset) => preset.id),
  'feature.media.cutInEditor.preset': [...CUT_IN_ENTRANCES, ...CUT_IN_EXITS],
  'feature.tabletop.displaySetting.viewMode_': VIEW_MODES,
  'feature.boardSwitch.kind.': SWITCH_ACTION_KINDS,
  'feature.boardSwitch.speakerOption.': SWITCH_SPEAKERS,
  'feature.boardSwitch.refused.': [...SWITCH_REFUSALS, 'busy'],
  'feature.boardSwitch.repeatOption.': TRIGGER_REPEATS,
  'feature.boardSwitch.reader.': SWITCH_SECRET_READERS,
  'feature.boardSwitch.spawnPlace.': SWITCH_SPAWN_PLACES,
  'feature.boardSwitch.toggle.': SWITCH_TOGGLES,
};

function dictionary(language: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`src/assets/i18n/${language}.json`, 'utf-8'));
}

function lookup(tree: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }, tree);
}

describe('the names shown for a choice', () => {
  for (const language of ['ja', 'en']) {
    it(`are all there in ${language}`, () => {
      const tree = dictionary(language);
      const missing: string[] = [];
      for (const [prefix, values] of Object.entries(CHOICES)) {
        for (const value of values) {
          if (typeof lookup(tree, prefix + value) !== 'string') missing.push(prefix + value);
        }
      }

      expect(missing).toEqual([]);
    });

    it(`name every command a menu can be given in ${language}`, () => {
      const tree = dictionary(language);
      const missing = MENU_COMMANDS.map((command) => command.labelKey).filter(
        (key) => typeof lookup(tree, key) !== 'string'
      );

      expect(missing).toEqual([]);
    });

    it(`name every small menu the menus come with in ${language}`, () => {
      const tree = dictionary(language);
      const keys = Object.values(DEFAULT_MENU_LAYOUTS)
        .flatMap((layout) => layout.nodes)
        .filter(isMenuGroup)
        .map((group) => group.labelKey ?? '');
      const missing = keys.filter((key) => typeof lookup(tree, key) !== 'string');

      expect(missing).toEqual([]);
    });
  }
});
