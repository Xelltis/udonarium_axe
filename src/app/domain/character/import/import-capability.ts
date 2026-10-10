import {
  APPSPOT_SYSTEMS,
  CCFOLIA_SOURCE_SERVICES,
  CHARASHEET_SYSTEMS,
  CHARAXIV_SYSTEMS,
  ImportSystem,
} from '@axe/domain/character/import/import-systems';

/**
 * The single source of truth for what can be imported.
 * It gathers which service, which kind of data and how far, along with the systems each
 * supports, as typed data: what the import panel and the manual show, and what the tests check against.
 * It says where things stand, and holds no plans.
 */
export type ImportSourceId = 'ccfolia' | 'charasheet' | 'appspot' | 'ytsheet' | 'charaxiv';

export type ImportDataTypeId =
  | 'name'
  | 'icon'
  | 'resource'
  | 'ability'
  | 'skillTable'
  | 'systemData'
  | 'chatPalette'
  | 'dicebot'
  | 'color'
  | 'memo'
  | 'externalUrl';

export type ImportInputMethod = 'pasteJson' | 'urlAutoFetch';

/** Fully, partly, through the other tool, or not at all. */
export type ImportSupportLevel = 'full' | 'partial' | 'viaCcfolia' | 'none';

export interface ImportSourceDef {
  id: ImportSourceId;
  labelKey: string;
  hosts: string[];
  inputMethods: ImportInputMethod[];
  fetch: 'fetch' | 'jsonp' | 'none';
  /** The translation key of how the system is handled. */
  systemsCoverageKey: string;
  systems: ImportSystem[];
  /** How far each kind of data is supported. */
  levels: Record<ImportDataTypeId, ImportSupportLevel>;
}

export interface ImportDataTypeDef {
  id: ImportDataTypeId;
  labelKey: string;
}

export interface ImportCapability {
  source: ImportSourceId;
  dataType: ImportDataTypeId;
  level: ImportSupportLevel;
}

export const IMPORT_DATA_TYPES: ImportDataTypeDef[] = [
  { id: 'name', labelKey: 'feature.character.import.capability.dataType.name' },
  { id: 'icon', labelKey: 'feature.character.import.capability.dataType.icon' },
  { id: 'resource', labelKey: 'feature.character.import.capability.dataType.resource' },
  { id: 'ability', labelKey: 'feature.character.import.capability.dataType.ability' },
  { id: 'skillTable', labelKey: 'feature.character.import.capability.dataType.skillTable' },
  { id: 'systemData', labelKey: 'feature.character.import.capability.dataType.systemData' },
  { id: 'chatPalette', labelKey: 'feature.character.import.capability.dataType.chatPalette' },
  { id: 'dicebot', labelKey: 'feature.character.import.capability.dataType.dicebot' },
  { id: 'color', labelKey: 'feature.character.import.capability.dataType.color' },
  { id: 'memo', labelKey: 'feature.character.import.capability.dataType.memo' },
  { id: 'externalUrl', labelKey: 'feature.character.import.capability.dataType.externalUrl' },
];

const VIA_CCFOLIA_LEVELS: Record<ImportDataTypeId, ImportSupportLevel> = {
  name: 'viaCcfolia',
  icon: 'viaCcfolia',
  resource: 'viaCcfolia',
  ability: 'viaCcfolia',
  skillTable: 'viaCcfolia',
  systemData: 'viaCcfolia',
  chatPalette: 'viaCcfolia',
  dicebot: 'viaCcfolia',
  color: 'viaCcfolia',
  memo: 'viaCcfolia',
  externalUrl: 'viaCcfolia',
};

export const IMPORT_SOURCES: ImportSourceDef[] = [
  {
    id: 'ccfolia',
    labelKey: 'feature.character.import.capability.source.ccfolia',
    hosts: [],
    inputMethods: ['pasteJson'],
    fetch: 'none',
    systemsCoverageKey: 'feature.character.import.capability.coverage.ccfolia',
    systems: CCFOLIA_SOURCE_SERVICES,
    levels: {
      name: 'full',
      icon: 'full',
      resource: 'full',
      ability: 'full',
      skillTable: 'none',
      systemData: 'none',
      chatPalette: 'full',
      dicebot: 'none',
      color: 'full',
      memo: 'full',
      externalUrl: 'full',
    },
  },
  {
    id: 'charasheet',
    labelKey: 'feature.character.import.capability.source.charasheet',
    hosts: ['charasheet.vampire-blood.net'],
    inputMethods: ['pasteJson', 'urlAutoFetch'],
    fetch: 'fetch',
    systemsCoverageKey: 'feature.character.import.capability.coverage.charasheet',
    systems: CHARASHEET_SYSTEMS,
    levels: {
      name: 'full',
      icon: 'partial',
      resource: 'full',
      ability: 'partial',
      skillTable: 'none',
      systemData: 'full',
      chatPalette: 'none',
      dicebot: 'full',
      color: 'full',
      memo: 'full',
      externalUrl: 'full',
    },
  },
  {
    id: 'appspot',
    labelKey: 'feature.character.import.capability.source.appspot',
    hosts: ['character-sheets.appspot.com'],
    inputMethods: ['pasteJson', 'urlAutoFetch'],
    fetch: 'jsonp',
    systemsCoverageKey: 'feature.character.import.capability.coverage.appspot',
    systems: APPSPOT_SYSTEMS,
    levels: {
      name: 'full',
      icon: 'none',
      resource: 'partial',
      ability: 'full',
      skillTable: 'full',
      systemData: 'full',
      chatPalette: 'none',
      dicebot: 'full',
      color: 'none',
      memo: 'partial',
      externalUrl: 'none',
    },
  },
  {
    id: 'ytsheet',
    labelKey: 'feature.character.import.capability.source.ytsheet',
    hosts: ['yutorize.work', 'yutorize.2-d.jp'],
    inputMethods: ['pasteJson', 'urlAutoFetch'],
    fetch: 'fetch',
    systemsCoverageKey: 'feature.character.import.capability.coverage.ytsheet',
    systems: [{ name: 'ソード・ワールド2.5', verified: true }],
    levels: {
      name: 'full',
      icon: 'none',
      resource: 'full',
      ability: 'full',
      skillTable: 'none',
      systemData: 'full',
      chatPalette: 'full',
      dicebot: 'full',
      color: 'none',
      memo: 'full',
      externalUrl: 'none',
    },
  },
  {
    id: 'charaxiv',
    labelKey: 'feature.character.import.capability.source.charaxiv',
    hosts: ['charaxiv.app', 'charaxiv.com'],
    inputMethods: ['pasteJson'],
    fetch: 'none',
    systemsCoverageKey: 'feature.character.import.capability.coverage.charaxiv',
    systems: CHARAXIV_SYSTEMS,
    levels: VIA_CCFOLIA_LEVELS,
  },
];

export const IMPORT_CAPABILITIES: ImportCapability[] = IMPORT_SOURCES.flatMap((source) =>
  IMPORT_DATA_TYPES.map((dataType) => ({
    source: source.id,
    dataType: dataType.id,
    level: source.levels[dataType.id],
  }))
);

export const SUPPORT_LEVEL_LABEL_KEYS: Record<ImportSupportLevel, string> = {
  full: 'feature.character.import.capability.level.full',
  partial: 'feature.character.import.capability.level.partial',
  viaCcfolia: 'feature.character.import.capability.level.viaCcfolia',
  none: 'feature.character.import.capability.level.none',
};

export const SUPPORT_LEVEL_SYMBOLS: Record<ImportSupportLevel, string> = {
  full: '✅',
  partial: '🔸',
  viaCcfolia: '🔁',
  none: '✖',
};

/**
 * How far a source supports a kind of data, as the import panel's table shows it. `none` for a
 * source or kind it does not list.
 */
export function capabilityOf(source: ImportSourceId, dataType: ImportDataTypeId): ImportSupportLevel {
  return IMPORT_SOURCES.find((entry) => entry.id === source)?.levels[dataType] ?? 'none';
}
