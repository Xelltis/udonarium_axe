import { type TranslateFn } from '@axe/application/i18n/translate.token';
import { layTutorialBoard } from '@axe/application/tabletop/tutorial-board';
import { BUNDLED_PIECE_MODELS, type BundledPieceModel } from '@axe/core/storage/bundled-models';
import { ImageContext, ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { GameObject } from '@axe/core/sync/game-object';
import { DEFAULT_STATUS_AILMENT_NAMES } from '@axe/domain/character/builtin-status-ailments';
import { CharacterTemplateFactory } from '@axe/domain/character/character-template-factory';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
} from '@axe/domain/data/data-element';
import { DataSummarySetting, SortOrder } from '@axe/domain/data/data-summary-setting';
import { ImageTag } from '@axe/domain/media/image-tag';
import { Party, PARTY_COLORS } from '@axe/domain/party/party';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { ensureGroundFieldOn } from '@axe/domain/tabletop/ground/ground-field';
import { groundChunksOfRaster } from '@axe/domain/tabletop/ground/ground-raster';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

function addBuffRound(character: GameCharacter, name: string, subcom: string, round: number): void {
  if (character.buffDataElement?.children) {
    for (const dataElm of character.buffDataElement.children) {
      dataElm.appendChild(
        DataElement.create(
          name,
          round,
          { type: DataElementType.NUMBER_RESOURCE, currentValue: subcom },
          name + '_' + character.identifier
        )
      );
      return;
    }
  }
}

/**
 * What the samples are meant to look like at a glance.
 *
 * They all started with the same numbers, which made the table a wall of 24s and told a
 * newcomer nothing about what the columns are for. Each one is now built to its picture: the
 * knight can take a hit, the wizard cannot, the scout goes first, and the golem goes last.
 */
interface SampleStats {
  hp: number;
  mp: number;
  器用度: number;
  敏捷度: number;
  筋力: number;
  生命力: number;
  知力: number;
  精神力: number;
  /** How far it walks in a turn, in cells: armour and wounds tell as much as legs do. */
  移動: number;
}

const SAMPLE_STATS: Record<string, SampleStats> = {
  騎士: { hp: 260, mp: 40, 器用度: 18, 敏捷度: 14, 筋力: 30, 生命力: 28, 知力: 12, 精神力: 16, 移動: 4 },
  魔法使い: { hp: 140, mp: 220, 器用度: 16, 敏捷度: 15, 筋力: 10, 生命力: 14, 知力: 32, 精神力: 28, 移動: 5 },
  斥候: { hp: 180, mp: 80, 器用度: 30, 敏捷度: 32, 筋力: 16, 生命力: 18, 知力: 20, 精神力: 18, 移動: 8 },
  // Two of a kind, told apart by how much they can take. The same 敏捷度 leaves the order to
  // the second sort, which is what a table sees when two of a species roll the same. The
  // hurt one walks shorter, which is the difference a fight sees before the numbers do.
  ゴブリン: { hp: 90, mp: 20, 器用度: 14, 敏捷度: 22, 筋力: 12, 生命力: 12, 知力: 8, 精神力: 6, 移動: 6 },
  手負いのゴブリン: { hp: 76, mp: 20, 器用度: 14, 敏捷度: 22, 筋力: 10, 生命力: 10, 知力: 8, 精神力: 6, 移動: 4 },
  ゴーレム: { hp: 400, mp: 20, 器用度: 8, 敏捷度: 6, 筋力: 40, 生命力: 45, 知力: 4, 精神力: 30, 移動: 3 },
  弓使い: { hp: 170, mp: 60, 器用度: 32, 敏捷度: 26, 筋力: 18, 生命力: 16, 知力: 16, 精神力: 16, 移動: 6 },
  盗賊: { hp: 160, mp: 50, 器用度: 34, 敏捷度: 30, 筋力: 14, 生命力: 15, 知力: 18, 精神力: 14, 移動: 7 },
  戦士: { hp: 240, mp: 30, 器用度: 20, 敏捷度: 18, 筋力: 32, 生命力: 26, 知力: 10, 精神力: 14, 移動: 5 },
  オーク: { hp: 150, mp: 10, 器用度: 12, 敏捷度: 16, 筋力: 28, 生命力: 22, 知力: 6, 精神力: 8, 移動: 5 },
  ドラゴン: { hp: 600, mp: 120, 器用度: 14, 敏捷度: 18, 筋力: 45, 生命力: 42, 知力: 20, 精神力: 26, 移動: 6 },
};

/** Writes a sample's numbers over the ones every new piece is made with. */
function applySampleStats(character: GameCharacter, profile: keyof typeof SAMPLE_STATS): void {
  const root = character.rootDataElement;
  if (!root) return;

  const stats = SAMPLE_STATS[profile];
  for (const [name, amount] of [
    ['HP', stats.hp],
    ['MP', stats.mp],
  ] as const) {
    const pool = DataElement.findElementByReference(root, name);
    if (!pool) continue;
    pool.value = amount;
    pool.currentValue = amount;
  }

  for (const name of ['器用度', '敏捷度', '筋力', '生命力', '知力', '精神力', '移動'] as const) {
    const ability = DataElement.findElementByReference(root, name);
    if (ability) ability.value = stats[name];
  }
}

/** The name the first table a new room opens on is made under. */
export const FIRST_TABLE = 'gameTable';

/** Makes the table selector and the first table a new room opens on, and puts it in view. */
export function makeDefaultTable(imageStorage: ImageStorage): void {
  const tableSelecter = new TableSelecter('tableSelecter');
  tableSelecter.initialize();

  const gameTable = new GameTable(FIRST_TABLE);
  const bgFileContext = ImageFile.createEmpty('testTableBackgroundImage_image').toContext();
  bgFileContext.url = './assets/images/table_forest_clearing.webp';
  const testBgFile = imageStorage.add(bgFileContext);
  ImageTag.create(testBgFile.identifier).tag = '背景';
  gameTable.name = '最初のテーブル';
  gameTable.imageIdentifier = testBgFile.identifier;
  gameTable.width = 32;
  gameTable.height = 20;
  gameTable.initialize();

  tableSelecter.viewTableIdentifier = gameTable.identifier;
}

/** How far a sample piece sees, which is far enough for the fog to open as it walks. */
const SAMPLE_VISION_RANGE = 2;

/**
 * The party the sample player characters belong to.
 *
 * A room opened for the first time has the fog and the dark to try, and both are read
 * through a party: what one member has walked to, the others are shown. Left unassigned,
 * every sample piece would have its own private map and the feature would look broken.
 *
 * The monsters are left out of it. A party shares its sight, so a monster in it would show
 * the players everything it can see.
 *
 * Made as one change, as every seat makes it under the same name as it starts, and a party a room
 * brought back from its file under that name has to outweigh the one a newcomer makes.
 */
function makeSampleParty(): Party {
  return GameObject.batch(() => {
    const party = new Party('testParty_1');
    party.name = 'パーティ1';
    party.color = PARTY_COLORS[0];
    party.initialize();
    return party;
  });
}

/**
 * The party the sample monsters belong to, apart from the players'.
 *
 * Fights told apart by party need every piece in one, or a monster in none is nobody's enemy:
 * it holds no ground and takes no part in an engagement zone. Its sight is shared with nobody
 * at the table, since nobody owns a monster. Made as one change, as the players' party is.
 */
function makeSampleMonsterParty(): Party {
  return GameObject.batch(() => {
    const party = new Party('testParty_2');
    party.name = 'モンスター';
    party.color = PARTY_COLORS[1];
    party.initialize();
    return party;
  });
}

/**
 * How many bodies a large sample piece counts as in an engagement zone, where the room counts by
 * this field: a piece three cells across is a crowd on its own.
 */
function addSampleBodyCount(character: GameCharacter, bodies: number): void {
  const root = character.rootDataElement;
  const walk = root ? DataElement.findElementByReference(root, '移動') : null;
  if (!walk?.parent) return;
  walk.parent.appendChild(
    DataElement.create(
      '人数',
      bodies,
      {
        [DataElementAttribute.ROLE]: DataElementRole.FIELD,
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
        [DataElementAttribute.UNIT]: '体',
        [DataElementAttribute.MIN]: '1',
      },
      `人数${character.identifier}`
    )
  );
}

/** A sample player character: it sees a little, and it sees for the rest of the party. */
function joinSampleParty(character: GameCharacter, party: Party): void {
  character.visionRange = SAMPLE_VISION_RANGE;
  character.partyIdentifier = party.identifier;
}

/** The items the sample pieces are worth reading by, which belong to the sample and not to every room. */
const SAMPLE_DISPLAY_ITEMS = ['HP', 'MP', '敏捷度', '器用度', '筋力', '生命力', '知力', '精神力'] as const;

/**
 * Sets the room's display items and its order to the sample's own vocabulary.
 *
 * A room that keeps its own says so itself, and one built out of imported sheets works its
 * items out from the pieces; these names mean something only because the samples carry them.
 */
function makeSampleSummaryItems(): void {
  const setting = DataSummarySetting.instance;
  setting.dataTag = SAMPLE_DISPLAY_ITEMS.join(' ');
  setting.tableDataTag = [...SAMPLE_DISPLAY_ITEMS, ...DEFAULT_STATUS_AILMENT_NAMES].join(' ');
  setting.sortTag = '敏捷度';
  setting.sortOrder = SortOrder.DESC;
}

/**
 * A sample piece the room opens with that the app bundles a 3D model for, drawn as the model on a
 * table drawn on a canvas: its picture is the model drawn, and it is named for what it is.
 */
interface ModelledSample {
  readonly identifier: string;
  readonly name: string;
  readonly model: BundledPieceModel;
  readonly cell: { readonly x: number; readonly y: number };
  /** How many cells across it stands, and how many bodies it counts as in an engagement zone. */
  readonly size: number;
  /** Whether it is one of the monsters rather than one of the players' party. */
  readonly monster: boolean;
}

/**
 * The sample pieces drawn as the bundled models, lined up west of the pieces drawn as pictures in
 * the same rows, gathered in the middle of the table with open ground left on either side to try
 * things on: the big monsters behind, the small ones before them, and the party in front.
 */
const MODELLED_SAMPLES: readonly ModelledSample[] = [
  { identifier: 'testCharacter_7', name: 'オーク', model: 'orc', cell: { x: 12, y: 10 }, size: 2, monster: true },
  { identifier: 'testCharacter_8', name: '弓使い', model: 'archer', cell: { x: 14, y: 14 }, size: 1, monster: false },
  { identifier: 'testCharacter_9', name: '盗賊', model: 'thief', cell: { x: 12, y: 14 }, size: 1, monster: false },
  { identifier: 'testCharacter_10', name: '戦士', model: 'warrior', cell: { x: 16, y: 14 }, size: 1, monster: false },
  { identifier: 'testCharacter_11', name: 'ゴブリン', model: 'goblin', cell: { x: 10, y: 11 }, size: 1, monster: true },
  { identifier: 'testCharacter_12', name: 'ゴーレム', model: 'golem', cell: { x: 9, y: 7 }, size: 3, monster: true },
  { identifier: 'testCharacter_13', name: '騎士', model: 'knight', cell: { x: 8, y: 14 }, size: 1, monster: false },
  {
    identifier: 'testCharacter_14',
    name: '魔法使い',
    model: 'wizard',
    cell: { x: 10, y: 14 },
    size: 1,
    monster: false,
  },
  { identifier: 'testCharacter_15', name: 'ドラゴン', model: 'dragon', cell: { x: 13, y: 7 }, size: 3, monster: true },
];

/** Has a sample piece drawn as one of the bundled models on a table drawn on a canvas; the page's own table goes on drawing its picture. */
function wearBundledModel(character: GameCharacter, model: BundledPieceModel): void {
  character.modelIdentifier = BUNDLED_PIECE_MODELS[model];
}

/** Sets out a sample piece made for a bundled model: in the players' party, or among the monsters. */
function makeModelledSample(sample: ModelledSample, imageStorage: ImageStorage, party: Party, monsters: Party): void {
  const character = new GameCharacter(sample.identifier);
  const context = ImageFile.createEmpty(`${sample.identifier}_image`).toContext();
  context.url = `./assets/images/piece_${sample.model}_3d.webp`;
  const picture = imageStorage.add(context);
  ImageTag.create(picture.identifier).tag = sample.monster ? 'モンスター' : '';
  character.location.x = sample.cell.x * 50;
  character.location.y = sample.cell.y * 50;
  character.initialize();
  CharacterTemplateFactory.createDefault(character, sample.name, sample.size, picture.identifier);
  if (sample.monster) {
    character.isNpc = true;
    character.partyIdentifier = monsters.identifier;
  } else {
    joinSampleParty(character, party);
  }
  applySampleStats(character, sample.name);
  if (sample.size > 1) addSampleBodyCount(character, sample.size);
  wearBundledModel(character, sample.model);
}

/**
 * The names the sample pieces and their two parties are made under, every seat making them under the
 * same names, so that what the first table came with can be told from what was made on it since.
 */
export const SAMPLE_PIECES: readonly string[] = [
  ...['testCharacter_1', 'testCharacter_2', 'testCharacter_3', 'testCharacter_4', 'testCharacter_5', 'testCharacter_6'],
  ...MODELLED_SAMPLES.map((sample) => sample.identifier),
];
export const SAMPLE_PARTIES: readonly string[] = ['testParty_1', 'testParty_2'];

/**
 * Sets out the sample pieces a new room opens with, lined up to be looked at: the big monsters in a
 * row behind, the small ones in a row before them and the party of characters in a row in front, the
 * ones drawn as the models the app bundles at the west of each row and the ones drawn as their
 * pictures at the east. The monsters stand on a step of the ground, above the party.
 *
 * The room's display items are set to the samples' stats, and the characters are given a little
 * sight and joined to one party so the fog and the dark can be tried at once. The monsters stand in
 * a party of their own, so a room telling sides apart by party still has two sides to fight.
 */
export function makeDefaultTabletopObjects(
  imageStorage: ImageStorage,
  t: TranslateFn,
  standing = true,
  hold: (work: Promise<unknown>) => void = () => undefined
): void {
  let testCharacter: GameCharacter;
  let testFile: ImageFile;
  let fileContext: ImageContext;
  const party = makeSampleParty();
  const monsters = makeSampleMonsterParty();
  makeSampleSummaryItems();

  testCharacter = new GameCharacter('testCharacter_1');
  fileContext = ImageFile.createEmpty('testCharacter_1_image').toContext();
  fileContext.url = './assets/images/piece_goblin.webp';
  testFile = imageStorage.add(fileContext);
  testCharacter.location.x = 16 * 50;
  testCharacter.location.y = 11 * 50;
  testCharacter.initialize();
  ImageTag.create(testFile.identifier).tag = 'モンスター';

  CharacterTemplateFactory.createDefault(testCharacter, 'モンスターA', 1, testFile.identifier);
  testCharacter.isNpc = true;
  testCharacter.partyIdentifier = monsters.identifier;
  applySampleStats(testCharacter, 'ゴブリン');
  addBuffRound(testCharacter, 'テストバフ1', '防+1', 3);

  testCharacter = new GameCharacter('testCharacter_2');
  testCharacter.location.x = 18 * 50;
  testCharacter.location.y = 11 * 50;
  testCharacter.initialize();
  CharacterTemplateFactory.createDefault(testCharacter, 'モンスターB', 1, testFile.identifier);
  testCharacter.isNpc = true;
  testCharacter.partyIdentifier = monsters.identifier;
  applySampleStats(testCharacter, '手負いのゴブリン');

  testCharacter = new GameCharacter('testCharacter_3');
  fileContext = ImageFile.createEmpty('testCharacter_3_image').toContext();
  fileContext.url = './assets/images/piece_golem.webp';
  testCharacter.location.x = 17 * 50;
  testCharacter.location.y = 7 * 50;
  testCharacter.initialize();

  testFile = imageStorage.add(fileContext);
  ImageTag.create(testFile.identifier).tag = 'モンスター';
  CharacterTemplateFactory.createDefault(testCharacter, 'モンスターC', 3, testFile.identifier);
  testCharacter.isNpc = true;
  testCharacter.partyIdentifier = monsters.identifier;
  applySampleStats(testCharacter, 'ゴーレム');
  addSampleBodyCount(testCharacter, 3);

  testCharacter = new GameCharacter('testCharacter_4');
  fileContext = ImageFile.createEmpty('testCharacter_4_image').toContext();
  fileContext.url = './assets/images/piece_knight.webp';

  testFile = imageStorage.add(fileContext);

  ImageTag.create(testFile.identifier).tag = '';
  testCharacter.location.x = 18 * 50;
  testCharacter.location.y = 14 * 50;
  testCharacter.initialize();
  CharacterTemplateFactory.createDefault(testCharacter, 'キャラクターA', 1, testFile.identifier);
  joinSampleParty(testCharacter, party);
  applySampleStats(testCharacter, '騎士');
  addBuffRound(testCharacter, 'テストバフ2', '攻撃+10', 1);

  testCharacter = new GameCharacter('testCharacter_5');
  fileContext = ImageFile.createEmpty('testCharacter_5_image').toContext();
  fileContext.url = './assets/images/piece_wizard.webp';
  testFile = imageStorage.add(fileContext);
  testCharacter.location.x = 20 * 50;
  testCharacter.location.y = 14 * 50;
  testCharacter.initialize();
  CharacterTemplateFactory.createDefault(testCharacter, 'キャラクターB', 1, testFile.identifier);
  joinSampleParty(testCharacter, party);
  applySampleStats(testCharacter, '魔法使い');
  addBuffRound(testCharacter, 'テストバフ2', '攻撃+10', 1);

  testCharacter = new GameCharacter('testCharacter_6');
  fileContext = ImageFile.createEmpty('testCharacter_6_image').toContext();
  fileContext.url = './assets/images/piece_scout.webp';
  testFile = imageStorage.add(fileContext);

  ImageTag.create(testFile.identifier).tag = '';

  testCharacter.initialize();
  testCharacter.location.x = 22 * 50;
  testCharacter.location.y = 14 * 50;
  testCharacter.initialize();
  CharacterTemplateFactory.createDefault(testCharacter, 'キャラクターC', 1, testFile.identifier);
  joinSampleParty(testCharacter, party);
  applySampleStats(testCharacter, '斥候');
  addBuffRound(testCharacter, 'テストバフ3', '', 3);

  for (const sample of MODELLED_SAMPLES) makeModelledSample(sample, imageStorage, party, monsters);

  const table = TableSelecter.instance.viewTable;
  if (!table) return;
  raiseSampleStep(table);
  layTutorialBoard(imageStorage, table, t, standing, hold);
}

/**
 * The step the monsters stand on: a flat top over their rows, in cells, as high as given, its edges
 * sloping down to the board over a cell and a half all round, so the sample room shows the ground raised and the
 * two sides facing each other from different heights.
 */
const SAMPLE_STEP = { left: 8.5, top: 6, right: 20.5, bottom: 12, height: 1.5, slope: 1.5 };

/** How high the sample step stands at a point of the board, in cells. */
function sampleStepAt(x: number, y: number): number {
  const step = SAMPLE_STEP;
  const outside = Math.hypot(Math.max(0, step.left - x, x - step.right), Math.max(0, step.top - y, y - step.bottom));
  if (outside >= step.slope) return 0;
  return (step.height * (1 + Math.cos((Math.PI * outside) / step.slope))) / 2;
}

/**
 * Raises the step the monsters stand on in the ground of a table, under the ground's own names, so
 * that two newcomers who meet each with a first table of their own find one step between them.
 */
function raiseSampleStep(table: GameTable): void {
  const columns = table.width * GROUND_SAMPLES_PER_CELL + 1;
  const rows = table.height * GROUND_SAMPLES_PER_CELL + 1;
  const heights = new Float32Array(columns * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      heights[j * columns + i] = sampleStepAt(i / GROUND_SAMPLES_PER_CELL, j / GROUND_SAMPLES_PER_CELL);
    }
  }
  const field = ensureGroundFieldOn(table);
  for (const chunk of groundChunksOfRaster({ columns, rows, heights })) field.writeChunk(chunk);
}
