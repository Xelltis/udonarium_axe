import { ImageContext, ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { DEFAULT_STATUS_AILMENT_NAMES } from '@axe/domain/character/builtin-status-ailments';
import { CharacterTemplateFactory } from '@axe/domain/character/character-template-factory';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';
import { DataSummarySetting, SortOrder } from '@axe/domain/data/data-summary-setting';
import { ImageTag } from '@axe/domain/media/image-tag';
import { Party, PARTY_COLORS } from '@axe/domain/party/party';
import { GameTable } from '@axe/domain/tabletop/game-table';
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

/** Makes the table selector and the first table a new room opens on, and puts it in view. */
export function makeDefaultTable(imageStorage: ImageStorage): void {
  const tableSelecter = new TableSelecter('tableSelecter');
  tableSelecter.initialize();

  const gameTable = new GameTable('gameTable');
  const bgFileContext = ImageFile.createEmpty('testTableBackgroundImage_image').toContext();
  bgFileContext.url = './assets/images/table_forest_clearing.webp';
  const testBgFile = imageStorage.add(bgFileContext);
  ImageTag.create(testBgFile.identifier).tag = '背景';
  gameTable.name = '最初のテーブル';
  gameTable.imageIdentifier = testBgFile.identifier;
  gameTable.width = 20;
  gameTable.height = 15;
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
 */
function makeSampleParty(): Party {
  const party = new Party('testParty_1');
  party.name = 'パーティ1';
  party.color = PARTY_COLORS[0];
  party.initialize();
  return party;
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
 * Sets out the sample pieces a new room opens with: three monsters and a party of three characters.
 *
 * The room's display items are set to the samples' stats, and the characters are given a little
 * sight and joined to one party so the fog and the dark can be tried at once.
 */
export function makeDefaultTabletopObjects(imageStorage: ImageStorage): void {
  let testCharacter: GameCharacter;
  let testFile: ImageFile;
  let fileContext: ImageContext;
  const party = makeSampleParty();
  makeSampleSummaryItems();

  testCharacter = new GameCharacter('testCharacter_1');
  fileContext = ImageFile.createEmpty('testCharacter_1_image').toContext();
  fileContext.url = './assets/images/piece_goblin.webp';
  testFile = imageStorage.add(fileContext);
  testCharacter.location.x = 5 * 50;
  testCharacter.location.y = 9 * 50;
  testCharacter.initialize();
  ImageTag.create(testFile.identifier).tag = 'モンスター';

  CharacterTemplateFactory.createDefault(testCharacter, 'モンスターA', 1, testFile.identifier);
  testCharacter.isNpc = true;
  applySampleStats(testCharacter, 'ゴブリン');
  addBuffRound(testCharacter, 'テストバフ1', '防+1', 3);

  testCharacter = new GameCharacter('testCharacter_2');
  testCharacter.location.x = 8 * 50;
  testCharacter.location.y = 8 * 50;
  testCharacter.initialize();
  CharacterTemplateFactory.createDefault(testCharacter, 'モンスターB', 1, testFile.identifier);
  testCharacter.isNpc = true;
  applySampleStats(testCharacter, '手負いのゴブリン');

  testCharacter = new GameCharacter('testCharacter_3');
  fileContext = ImageFile.createEmpty('testCharacter_3_image').toContext();
  fileContext.url = './assets/images/piece_golem.webp';
  testCharacter.location.x = 4 * 50;
  testCharacter.location.y = 2 * 50;
  testCharacter.initialize();

  testFile = imageStorage.add(fileContext);
  ImageTag.create(testFile.identifier).tag = 'モンスター';
  CharacterTemplateFactory.createDefault(testCharacter, 'モンスターC', 3, testFile.identifier);
  testCharacter.isNpc = true;
  applySampleStats(testCharacter, 'ゴーレム');

  testCharacter = new GameCharacter('testCharacter_4');
  fileContext = ImageFile.createEmpty('testCharacter_4_image').toContext();
  fileContext.url = './assets/images/piece_knight.webp';

  testFile = imageStorage.add(fileContext);

  ImageTag.create(testFile.identifier).tag = '';
  testCharacter.location.x = 6 * 50;
  testCharacter.location.y = 11 * 50;
  testCharacter.initialize();
  CharacterTemplateFactory.createDefault(testCharacter, 'キャラクターA', 1, testFile.identifier);
  joinSampleParty(testCharacter, party);
  applySampleStats(testCharacter, '騎士');
  addBuffRound(testCharacter, 'テストバフ2', '攻撃+10', 1);

  testCharacter = new GameCharacter('testCharacter_5');
  fileContext = ImageFile.createEmpty('testCharacter_5_image').toContext();
  fileContext.url = './assets/images/piece_wizard.webp';
  testFile = imageStorage.add(fileContext);
  testCharacter.location.x = 12 * 50;
  testCharacter.location.y = 12 * 50;
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
  testCharacter.location.x = 5 * 50;
  testCharacter.location.y = 13 * 50;
  testCharacter.initialize();
  CharacterTemplateFactory.createDefault(testCharacter, 'キャラクターC', 1, testFile.identifier);
  joinSampleParty(testCharacter, party);
  applySampleStats(testCharacter, '斥候');
  addBuffRound(testCharacter, 'テストバフ3', '', 3);
}
