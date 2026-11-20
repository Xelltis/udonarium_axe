import { inject, Injectable } from '@angular/core';
import type { AgentHandler } from '@axe/application/agent/agent-tool-runner.service';
import { PartyService } from '@axe/application/party/party.service';
import {
  type GeneratedMap,
  MapGenerationService,
} from '@axe/application/tabletop/map-generation/map-generation.service';
import {
  DEFAULT_MAP_SETTINGS,
  MAP_SEED_LIMIT,
  type MapSettings,
} from '@axe/application/tabletop/map-generation/map-settings';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { emitSelectGameTable } from '@axe/core/event/domain-events';
import { DUNGEON_ATMOSPHERE_IDS, type DungeonAtmosphereId } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import { clampRoomCount } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import {
  clampFieldDensity,
  clampFieldRelief,
  clampFieldSize,
  FIELD_ATMOSPHERE_IDS,
  type FieldAtmosphereId,
} from '@axe/domain/tabletop/field/field-atmosphere';
import { FIELD_SEASONS, type FieldSeason } from '@axe/domain/tabletop/field/field-models';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { findOne, textArg } from '@axe/features/agent-tools/agent-lookup';

/** The shapes of cell the AI names, by the grid types the table knows them by. */
export const AGENT_MAP_GRIDS: Readonly<Record<string, GridType>> = {
  square: GridType.SQUARE,
  hex_vertical: GridType.HEX_VERTICAL,
  hex_horizontal: GridType.HEX_HORIZONTAL,
};

/**
 * The AI link's tool for making a map, as the generator panel makes one and through the same service:
 * a dungeon or open country from its atmosphere, size and seed, built as a table of its own, the party
 * stood at the way in where one is named. The map this seat's AI made last can be thrown away as a new
 * one is made, as the panel throws its own away when it rolls again; one the panel made is never taken.
 * One map is made at a time: a call while one is being made is refused, and which map was made last
 * changes only as a map is made, so a map that fails to be made, however it fails, leaves it as it was.
 */
@Injectable({ providedIn: 'root' })
export class AgentMapTools {
  private readonly mapGeneration = inject(MapGenerationService);
  private readonly parties = inject(PartyService);
  private last: GeneratedMap | null = null;
  private making = false;

  readonly handlers: Readonly<Record<string, AgentHandler>> = {
    generate_map: (args) => this.generate(args),
  };

  private async generate(args: Readonly<Record<string, unknown>>): Promise<unknown> {
    const settings = this.settingsOf(args);
    const party = textArg(args, 'party').trim();
    const musterParty = party
      ? findOne(
          this.parties.parties(),
          party,
          (each) => each.identifier,
          (each) => each.name,
          'party'
        ).identifier
      : '';
    if (this.making) {
      throw new AgentToolError(
        'failed',
        'A map is still being made for this seat. Wait for it to be made, then ask for the next one.'
      );
    }
    this.making = true;
    let built: GeneratedMap | null;
    try {
      built = await this.mapGeneration.build(settings, {
        name: this.mapGeneration.nameOf(settings, textArg(args, 'name')),
        fogEnabled: args['fog'] === true,
        musterParty,
        lightMotion: '',
      });
    } finally {
      this.making = false;
    }
    if (!built) {
      throw new AgentToolError(
        'failed',
        'That map has more terrain than a table may hold. Ask for fewer rooms, a smaller or sparser field, or squares rather than hexes.'
      );
    }
    const shownInstead = args['replace_previous'] === true && this.mapGeneration.replace(this.last, built);
    this.last = built;
    const switched = shownInstead || args['switch_to'] !== false;
    if (switched && !shownInstead) emitSelectGameTable({ identifier: built.table.identifier });
    return {
      table: { id: built.table.identifier, name: built.table.name },
      seed: settings.seed,
      switched,
      summary: built.summary,
    };
  }

  /** The settings the AI's arguments make, each left out taken as the panel starts on it and the seed rolled afresh. */
  private settingsOf(args: Readonly<Record<string, unknown>>): MapSettings {
    const kind = args['kind'] === 'field' ? 'field' : 'dungeon';
    const atmosphere = textArg(args, 'atmosphere');
    const ids: readonly string[] = kind === 'field' ? FIELD_ATMOSPHERE_IDS : DUNGEON_ATMOSPHERE_IDS;
    if (atmosphere && !ids.includes(atmosphere)) {
      throw new AgentToolError(
        'invalid_input',
        `A ${kind} has no atmosphere called ${atmosphere} (it has ${ids.join(', ')}).`
      );
    }
    const season = textArg(args, 'season');
    if (season && !(FIELD_SEASONS as readonly string[]).includes(season)) {
      throw new AgentToolError(
        'invalid_input',
        `There is no season called ${season} (there are ${FIELD_SEASONS.filter(Boolean).join(', ')}).`
      );
    }
    const number = (name: string, fallback: number) =>
      typeof args[name] === 'number' ? (args[name] as number) : fallback;
    const defaults = DEFAULT_MAP_SETTINGS;
    return {
      ...defaults,
      kind,
      ...(kind === 'dungeon' && atmosphere ? { atmosphere: atmosphere as DungeonAtmosphereId } : {}),
      ...(kind === 'field' && atmosphere ? { fieldAtmosphere: atmosphere as FieldAtmosphereId } : {}),
      roomCount: clampRoomCount(number('rooms', defaults.roomCount)),
      trapCount: number('traps', defaults.trapCount),
      fieldSize: clampFieldSize(number('size', defaults.fieldSize)),
      fieldDensity: clampFieldDensity(number('density', defaults.fieldDensity)),
      fieldRelief: clampFieldRelief(number('relief', defaults.fieldRelief)),
      fieldSeason: (season as FieldSeason) || defaults.fieldSeason,
      gridType: AGENT_MAP_GRIDS[textArg(args, 'grid')] ?? defaults.gridType,
      seed: number('seed', Math.floor(Math.random() * MAP_SEED_LIMIT)),
    };
  }
}
