import { CharacterTemplateFactory } from '@axe/domain/character/character-template-factory';
import { GameCharacter } from '@axe/domain/character/game-character';
import { playsEffectOnChange, playsSoundOnChange } from '@axe/domain/character/resource-feedback';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
  DataElementViewMode,
} from '@axe/domain/data/data-element';

describe('CharacterTemplateFactory', () => {
  beforeEach(() => {});

  describe('createDefault', () => {
    it('gives the character a name, a size and an altitude', () => {
      const character = GameCharacter.create('テスト勇者', 2, '');

      expect(character.name).toBe('テスト勇者');
      expect(character.size).toBe(2);
      const altitude = character.commonDataElement!.getFirstElementByName('altitude');
      expect(altitude).toBeTruthy();
      expect(altitude!.value).toBe(0);
    });

    it('gives it the two usual resources', () => {
      const character = GameCharacter.create('戦士', 1, '');

      const resource = character.detailDataElement!.getFirstElementByName('リソース');
      expect(resource?.fieldRole).toBe(DataElementRole.SECTION);
      expect(resource?.children[0].fieldRole).toBe(DataElementRole.GROUP);

      const hp = character.detailDataElement!.getFirstElementByName('HP');
      expect(hp).toBeTruthy();
      expect(hp!.parent).toBe(resource!.children[0]);
      expect(hp!.fieldRole).toBe(DataElementRole.FIELD);
      expect(hp!.value).toBe(200);
      expect(hp!.currentValue).toBe('200');
      expect(hp!.type).toBe(DataElementType.NUMBER_RESOURCE);

      const mp = character.detailDataElement!.getFirstElementByName('MP');
      expect(mp).toBeTruthy();
      expect(mp!.value).toBe(100);
      expect(mp!.currentValue).toBe('100');
    });

    it('lets the two usual resources be both seen and heard when they move', () => {
      const character = GameCharacter.create('戦士', 1, '');

      for (const name of ['HP', 'MP']) {
        const element = character.detailDataElement!.getFirstElementByName(name)!;
        expect(playsEffectOnChange(element)).toBe(true);
        expect(playsSoundOnChange(element)).toBe(true);
      }
    });

    it('gives it its abilities', () => {
      const character = GameCharacter.create('魔法使い', 1, '');

      const dex = character.detailDataElement!.getFirstElementByName('器用度');
      expect(dex).toBeTruthy();
      expect(dex!.value).toBe(24);
      expect(dex!.fieldType).toBe(DataElementFieldType.NUMBER);

      const int = character.detailDataElement!.getFirstElementByName('知力');
      expect(int).toBeTruthy();
      expect(int!.value).toBe(24);
    });

    it('puts a sample of every field format into the general profile', () => {
      const character = GameCharacter.create('サンプル', 1, 'image-id');

      const section = character.detailDataElement!.getFirstElementByName('プロフィール');
      expect(section?.fieldRole).toBe(DataElementRole.SECTION);
      expect(section?.getAttribute('cs-colspan')).toBe('2');
      expect(section?.children[0].fieldRole).toBe(DataElementRole.GROUP);

      const group = section!.children[0];
      expect(group.getFirstElementByName('名前メモ')?.fieldType).toBe(DataElementFieldType.TEXT);
      expect(group.getFirstElementByName('年齢')?.fieldType).toBe(DataElementFieldType.NUMBER);
      expect(group.getFirstElementByName('役割')?.fieldType).toBe(DataElementFieldType.SELECT);
      expect(group.getFirstElementByName('公開メモ')?.fieldType).toBe(DataElementFieldType.LONG_TEXT);
      expect(group.getFirstElementByName('準備済み')?.fieldType).toBe(DataElementFieldType.CHECK);
      expect(group.getFirstElementByName('参考画像')?.fieldType).toBe(DataElementFieldType.IMAGE);
      expect(group.getFirstElementByName('参考画像')?.value).toBe('image-id');
      expect(group.getFirstElementByName('能力合計')?.fieldType).toBe(DataElementFieldType.CALC);
      expect(group.getFirstElementByName('能力合計')?.getAttribute(DataElementAttribute.FORMULA)).toContain('器用度');
      expect(group.getFirstElementByName('役割')?.getAttribute(DataElementAttribute.CHOICES)).toContain('調査役');
    });

    it('gives it a chat palette', () => {
      const character = GameCharacter.create('盗賊', 1, '');

      const palette = character.chatPalette;
      expect(palette).toBeTruthy();
      expect(palette!.getPalette().join('\n')).toContain('精密射撃');
      expect(palette!.evaluate('2d6+{精密射撃命中}', character.detailDataElement!)).toBe('2d6+24+2');
      expect(palette!.evaluate(':MP-{スキル/アクション/精密射撃/消費MP}', character.detailDataElement!)).toBe(':MP-4');
      expect(palette!.evaluate('{スキル/支援/応急手当/効果}', character.detailDataElement!)).toContain(
        'HPを威力ぶん回復'
      );
    });

    it('builds the deeper groups of skill fields', () => {
      const character = GameCharacter.create('スキル確認', 1, '');

      const skillSection = character.detailDataElement!.getFirstElementByName('スキル');
      const actionGroup = skillSection?.getFirstElementByName('アクション');
      const supportGroup = skillSection?.getFirstElementByName('支援');
      const precisionShot = actionGroup?.getFirstElementByName('精密射撃');
      const firstAid = supportGroup?.getFirstElementByName('応急手当');

      expect(skillSection?.fieldRole).toBe(DataElementRole.SECTION);
      expect(skillSection?.getAttribute('cs-colspan')).toBe('2');
      expect(actionGroup?.fieldRole).toBe(DataElementRole.GROUP);
      expect(actionGroup?.getAttribute('cs-colspan')).toBe('2');
      expect(supportGroup?.fieldRole).toBe(DataElementRole.GROUP);
      expect(precisionShot?.fieldRole).toBe(DataElementRole.GROUP);
      expect(precisionShot?.getFirstElementByName('名称')?.fieldType).toBe(DataElementFieldType.TEXT);
      expect(precisionShot?.getFirstElementByName('種別')?.fieldType).toBe(DataElementFieldType.SELECT);
      expect(precisionShot?.getFirstElementByName('判定能力')?.value).toBe('器用度');
      expect(precisionShot?.getFirstElementByName('威力')?.fieldType).toBe(DataElementFieldType.NUMBER);
      expect(precisionShot?.getFirstElementByName('命中補正')?.value).toBe(2);
      expect(precisionShot?.getFirstElementByName('消費MP')?.value).toBe(4);
      expect(precisionShot?.getFirstElementByName('使用済み')?.fieldType).toBe(DataElementFieldType.CHECK);
      expect(precisionShot?.getFirstElementByName('効果')?.fieldType).toBe(DataElementFieldType.LONG_TEXT);
      expect(precisionShot?.getFirstElementByName('合計威力')?.fieldType).toBe(DataElementFieldType.CALC);
      expect(precisionShot?.getFirstElementByName('合計威力')?.getAttribute(DataElementAttribute.FORMULA)).toBe(
        '[スキル/アクション/精密射撃/威力] + [能力/基本/器用度]'
      );
      expect(firstAid?.getFirstElementByName('種別')?.value).toBe('回復');
    });

    it('builds a sample skill table', () => {
      const character = GameCharacter.create('サンプル', 1, '');

      const skillTable = character.detailDataElement!.getFirstElementByName('技能表');

      expect(skillTable?.fieldRole).toBe(DataElementRole.SECTION);
      expect(skillTable?.viewMode).toBe(DataElementViewMode.TABLE);
      expect(skillTable?.getAttribute('cs-colspan')).toBe('2');
      expect(skillTable?.children).toHaveLength(12);
    });

    it('builds one that pairs each skill with its proficiency', () => {
      const character = GameCharacter.create('タイプ2', 1, '');

      const skillTable = character.detailDataElement!.getFirstElementByName('技能表タイプ2');
      const row1 = skillTable?.children[0];
      const row3 = skillTable?.children[2];
      const row4 = skillTable?.children[3];

      expect(skillTable?.fieldRole).toBe(DataElementRole.SECTION);
      expect(skillTable?.viewMode).toBe(DataElementViewMode.TABLE);
      expect(skillTable?.getAttribute('cs-colspan')).toBe('2');
      expect(skillTable?.getAttribute(DataElementAttribute.ROW_HEADER_LABEL)).toBe('技能');
      expect(skillTable?.children).toHaveLength(4);
      expect(row1?.children).toHaveLength(12);
      expect(row1?.children.map((child) => child.getAttribute(DataElementAttribute.COLUMN_GROUP))).toEqual([
        '肉体技能',
        '肉体技能',
        '機械技能',
        '機械技能',
        '感覚技能',
        '感覚技能',
        '幸運技能',
        '幸運技能',
        '知力技能',
        '知力技能',
        '精神技能',
        '精神技能',
      ]);
      expect(row1?.getFirstElementByName('肉体技能名')?.value).toBe('肉体攻撃');
      expect(row1?.getFirstElementByName('肉体技能習熟度')?.fieldType).toBe(DataElementFieldType.SELECT);
      expect(row1?.getFirstElementByName('肉体技能習熟度')?.getAttribute(DataElementAttribute.CHOICES)).toBe(
        '初級,中級,上級'
      );
      expect(row1?.getFirstElementByName('機械技能習熟度')?.value).toBe('初級');
      expect(row1?.getFirstElementByName('感覚技能習熟度')?.value).toBe('中級');
      expect(row3?.getFirstElementByName('感覚技能名')?.value).toBe('芸術(絵画)');
      expect(row4?.getFirstElementByName('肉体技能名')?.value).toBe('登攀');
      expect(row4?.getFirstElementByName('肉体技能習熟度')?.value).toBe('初級');
    });

    it('builds a table of parts for each site, marking damage and use as two separate checks', () => {
      const character = GameCharacter.create('パーツ確認', 1, '');

      const section = character.detailDataElement!.getFirstElementByName('パーツ');
      const tables = section?.children ?? [];

      expect(section?.fieldRole).toBe(DataElementRole.SECTION);
      expect(tables.map((table) => table.name)).toEqual(['頭', '腕', '胴', '脚']);
      for (const table of tables) {
        expect(table.fieldRole).toBe(DataElementRole.GROUP);
        expect(table.viewMode).toBe(DataElementViewMode.TABLE);
        for (const row of table.children) {
          expect(row.fieldRole).toBe(DataElementRole.GROUP);
          expect(row.children.map((cell) => cell.name)).toEqual([
            '損傷',
            '使用済み',
            'タイミング',
            'コスト',
            '射程',
            '効果',
          ]);
          expect(row.getFirstElementByName('損傷')?.fieldType).toBe(DataElementFieldType.CHECK);
          expect(row.getFirstElementByName('使用済み')?.fieldType).toBe(DataElementFieldType.CHECK);
          expect(row.children.every((cell) => cell.getAttribute(DataElementAttribute.CELL_KIND) === '')).toBe(true);
        }
      }
      const claw = tables[1].getFirstElementByName('鉤爪');
      const armour = tables[2].getFirstElementByName('装甲');
      expect(claw?.getFirstElementByName('使用済み')?.value).toBe(1);
      expect(claw?.getFirstElementByName('損傷')?.value).toBe(0);
      expect(armour?.getFirstElementByName('損傷')?.value).toBe(1);
      expect(armour?.getFirstElementByName('使用済み')?.value).toBe(0);
    });

    it('keeps every row of the part tables in its table when the sheet is tidied on load', () => {
      const character = GameCharacter.create('パーツ確認', 1, '');
      const section = character.detailDataElement!.getFirstElementByName('パーツ')!;
      const before = section.children.map((table) => table.children.map((row) => row.name));

      character.normalizeDetailDataElementHierarchy();

      expect(section.children.map((table) => table.children.map((row) => row.name))).toEqual(before);
      expect(section.children.every((table) => table.viewMode === DataElementViewMode.TABLE)).toBe(true);
    });
  });

  describe('createCheckTable', () => {
    it('builds one in the current element format', () => {
      const character = new GameCharacter();
      character.createDataElements();
      character.initialize();
      CharacterTemplateFactory.createCheckTable(character, '冒険者', 1, '');

      const skillTable = character.detailDataElement!.getFirstElementByName('技能表')!;
      const gapRow = skillTable.children.find((child) => child.name === 'ギャップ') as DataElement;
      const row2 = skillTable.children.find((child) => child.name === '2') as DataElement;
      const row12 = skillTable.children.find((child) => child.name === '12') as DataElement;

      expect(skillTable.fieldRole).toBe(DataElementRole.SECTION);
      expect(skillTable.viewMode).toBe(DataElementViewMode.TABLE);
      expect(skillTable.getAttribute('cs-colspan')).toBe('2');
      expect(skillTable.children).toHaveLength(12);
      expect(gapRow.fieldRole).toBe(DataElementRole.GROUP);
      expect(gapRow.children.map((child) => child.name)).toEqual([
        'ギャップ6',
        '技巧',
        'ギャップ1',
        '身体',
        'ギャップ2',
        '隠密',
        'ギャップ3',
        '知識',
        'ギャップ4',
        '交流',
        'ギャップ5',
        '異能',
      ]);
      expect(gapRow.getFirstElementByName('ギャップ1')?.fieldType).toBe(DataElementFieldType.CHECK);
      expect(gapRow.getFirstElementByName('ギャップ1')?.getAttribute(DataElementAttribute.CELL_KIND)).toBe('gap');
      expect(gapRow.getFirstElementByName('ギャップ1')?.getAttribute(DataElementAttribute.COLUMN_LABEL)).toBe('G');
      expect(gapRow.getFirstElementByName('ギャップ6')?.getAttribute(DataElementAttribute.CELL_TEXT)).toBe('異能-技巧');
      expect(row2.fieldRole).toBe(DataElementRole.GROUP);
      expect(row2.children.map((child) => child.name)).toEqual(['技巧', '身体', '隠密', '知識', '交流', '異能']);
      expect(row2.children.map((child) => child.getAttribute(DataElementAttribute.CELL_TEXT))).toEqual([
        '解錠',
        '跳躍',
        '静音移動',
        '応急処置',
        '交渉',
        '霊感',
      ]);
      expect(row2.children.every((child) => child.fieldType === DataElementFieldType.CHECK)).toBe(true);
      expect(row12.getFirstElementByName('異能')?.getAttribute(DataElementAttribute.CELL_TEXT)).toBe('呪印');
      expect(DataElement.findElementByReference(character.detailDataElement!, '技能表/2/技巧')?.value).toBe(1);
      expect(character.detailDataElement!.getFirstElementByName('技能表（旧形式）')).toBeNull();
    });

    it('builds the sample equipment as a table', () => {
      const character = new GameCharacter();
      character.createDataElements();
      character.initialize();
      CharacterTemplateFactory.createCheckTable(character, '装備', 1, '');

      const equipment = character.detailDataElement!.getFirstElementByName('装備サンプル');
      expect(equipment).toBeTruthy();
      expect(equipment!.fieldRole).toBe(DataElementRole.SECTION);
      expect(equipment!.viewMode).toBe(DataElementViewMode.TABLE);
      expect(equipment!.children[0].fieldRole).toBe(DataElementRole.GROUP);
      expect(equipment!.children[0].getFirstElementByName('消耗')?.fieldType).toBe(DataElementFieldType.CHECK);
      expect(equipment!.children[0].getFirstElementByName('効果')?.value).toContain('回復');
    });

    it('takes its own width and height for the overview', () => {
      const character = new GameCharacter();
      character.createDataElements();
      character.initialize();
      CharacterTemplateFactory.createCheckTable(character, 'テスト', 1, '');

      expect(character.overViewWidth).toBe(800);
      expect(character.overViewMaxHeight).toBe(620);
    });
  });
});
