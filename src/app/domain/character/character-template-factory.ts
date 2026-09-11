import type { GameCharacter } from '@axe/domain/character/game-character';
import { ChatPalette } from '@axe/domain/chat/chat-palette';
import { createStructuredCheckTableElement } from '@axe/domain/data/check-table-converter';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { createSkillGapTableElement, DEFAULT_SKILL_TABLE_ROW_NAMES } from '@axe/domain/data/skill-gap-table';

/** How far the sample sheet walks before anybody says otherwise, in cells of the table. */
export const DEFAULT_SAMPLE_WALK_CELLS = 5;

export class CharacterTemplateFactory {
  static createDefault(character: GameCharacter, name: string, size: number, imageIdentifier: string): void {
    character.createDataElements();

    const nameElement = DataElement.create('name', name, {}, `name_${character.identifier}`);
    const sizeElement = DataElement.create('size', size, {}, `size_${character.identifier}`);
    const altitudeElement = DataElement.create('altitude', 0, {}, `altitude_${character.identifier}`);

    if (character.imageDataElement!.getFirstElementByName('imageIdentifier')) {
      character.imageDataElement!.getFirstElementByName('imageIdentifier')!.value = imageIdentifier;
    }

    const resourceElement = CharacterTemplateFactory.createSectionElement(
      'リソース',
      `リソース${character.identifier}`
    );
    const resourceGroupElement = CharacterTemplateFactory.createGroupElement(
      '基本',
      `リソース基本${character.identifier}`
    );
    const hpElement = CharacterTemplateFactory.createFieldElement(
      'HP',
      200,
      {
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.RESOURCE,
        [DataElementAttribute.PIECE_GAUGE]: 'true',
        [DataElementAttribute.CHANGE_EFFECT]: 'true',
        [DataElementAttribute.CHANGE_SOUND]: 'true',
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: '200',
      },
      `HP_${character.identifier}`
    );
    const mpElement = CharacterTemplateFactory.createFieldElement(
      'MP',
      100,
      {
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.RESOURCE,
        [DataElementAttribute.PIECE_GAUGE]: 'true',
        [DataElementAttribute.CHANGE_EFFECT]: 'true',
        [DataElementAttribute.CHANGE_SOUND]: 'true',
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: '100',
      },
      `MP_${character.identifier}`
    );
    character.commonDataElement!.appendChild(nameElement);
    character.commonDataElement!.appendChild(sizeElement);
    character.commonDataElement!.appendChild(altitudeElement);

    character.detailDataElement!.appendChild(resourceElement);
    resourceElement.appendChild(resourceGroupElement);
    resourceGroupElement.appendChild(hpElement);
    resourceGroupElement.appendChild(mpElement);

    CharacterTemplateFactory.appendCommonDetailElements(character);
    CharacterTemplateFactory.appendChatPalette(character);
    character.addExtendData();
  }

  static createCheckTable(character: GameCharacter, name: string, size: number, imageIdentifier: string): void {
    character.createDataElements();

    const nameElement = DataElement.create('name', name, {}, `name_${character.identifier}`);
    const sizeElement = DataElement.create('size', size, {}, `size_${character.identifier}`);
    const altitudeElement = DataElement.create('altitude', 0, {}, `altitude_${character.identifier}`);

    if (character.imageDataElement!.getFirstElementByName('imageIdentifier')) {
      character.imageDataElement!.getFirstElementByName('imageIdentifier')!.value = imageIdentifier;
    }

    const resourceElement = CharacterTemplateFactory.createSectionElement(
      'リソース',
      `リソース${character.identifier}`
    );
    const resourceGroupElement = CharacterTemplateFactory.createGroupElement(
      '基本',
      `リソース基本${character.identifier}`
    );
    const hpElement = CharacterTemplateFactory.createFieldElement(
      'HP',
      200,
      {
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.RESOURCE,
        [DataElementAttribute.PIECE_GAUGE]: 'true',
        [DataElementAttribute.CHANGE_EFFECT]: 'true',
        [DataElementAttribute.CHANGE_SOUND]: 'true',
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: '200',
      },
      `HP_${character.identifier}`
    );
    const mpElement = CharacterTemplateFactory.createFieldElement(
      'MP',
      100,
      {
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.RESOURCE,
        [DataElementAttribute.PIECE_GAUGE]: 'true',
        [DataElementAttribute.CHANGE_EFFECT]: 'true',
        [DataElementAttribute.CHANGE_SOUND]: 'true',
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: '100',
      },
      `MP_${character.identifier}`
    );

    character.commonDataElement!.appendChild(nameElement);
    character.commonDataElement!.appendChild(sizeElement);
    character.commonDataElement!.appendChild(altitudeElement);

    character.detailDataElement!.appendChild(resourceElement);
    resourceElement.appendChild(resourceGroupElement);
    resourceGroupElement.appendChild(hpElement);
    resourceGroupElement.appendChild(mpElement);

    const equipmentTable = `|消耗|使用|種別|コスト|射程|効果|
  |[]応急キット|[]|補助|1|接触|HPを少し回復|
  |[]照明|[]|道具|0|近距離|暗所ペナルティを軽減|`;

    character.overViewWidth = 800;
    character.overViewMaxHeight = 620;

    CharacterTemplateFactory.appendCommonDetailElements(character);
    character.detailDataElement!.appendChild(createStructuredCheckTableElement('装備サンプル', equipmentTable));
    character.detailDataElement!.appendChild(createStructuredCheckTableElement('進行チェック', '[][][][] 準備完了'));
    CharacterTemplateFactory.appendChatPalette(character);
    character.addExtendData();
  }

  private static appendCommonDetailElements(character: GameCharacter): void {
    CharacterTemplateFactory.appendAbilitySampleElements(character);
    CharacterTemplateFactory.appendFormatSampleElements(character);
    CharacterTemplateFactory.appendSkillSampleElements(character);

    character.detailDataElement!.appendChild(CharacterTemplateFactory.createGenericSkillTableElement(character));
    character.detailDataElement!.appendChild(CharacterTemplateFactory.createSkillTableType2Element(character));
    character.detailDataElement!.appendChild(CharacterTemplateFactory.createPartsSectionElement(character));
  }

  private static appendAbilitySampleElements(character: GameCharacter): void {
    const sectionElement = CharacterTemplateFactory.createSectionElement('能力', `能力${character.identifier}`);
    const groupElement = CharacterTemplateFactory.createGroupElement('基本', `能力基本${character.identifier}`);
    character.detailDataElement!.appendChild(sectionElement);
    sectionElement.appendChild(groupElement);

    for (const name of ['器用度', '敏捷度', '筋力', '生命力', '知力', '精神力']) {
      groupElement.appendChild(
        CharacterTemplateFactory.createFieldElement(
          name,
          24,
          {
            [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
            [DataElementAttribute.UNIT]: '点',
            [DataElementAttribute.MIN]: '0',
            [DataElementAttribute.MAX]: '100',
          },
          `${name}${character.identifier}`
        )
      );
    }
    groupElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '移動',
        DEFAULT_SAMPLE_WALK_CELLS,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
          [DataElementAttribute.UNIT]: 'マス',
          [DataElementAttribute.MIN]: '0',
          [DataElementAttribute.MAX]: '100',
        },
        `移動${character.identifier}`
      )
    );
  }

  private static appendFormatSampleElements(character: GameCharacter): void {
    const sectionElement = CharacterTemplateFactory.createSectionElement(
      'プロフィール',
      `プロフィール${character.identifier}`
    );
    sectionElement.setAttribute('cs-colspan', '2');
    const groupElement = CharacterTemplateFactory.createGroupElement('基本', `プロフィール基本${character.identifier}`);
    character.detailDataElement!.appendChild(sectionElement);
    sectionElement.appendChild(groupElement);

    groupElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '名前メモ',
        'サンプルキャラクター',
        { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.TEXT },
        `名前メモ${character.identifier}`
      )
    );
    groupElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '年齢',
        18,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
          [DataElementAttribute.UNIT]: '歳',
          [DataElementAttribute.MIN]: '0',
          [DataElementAttribute.MAX]: '999',
        },
        `年齢${character.identifier}`
      )
    );
    groupElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '役割',
        '調査役',
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.SELECT,
          [DataElementAttribute.CHOICES]: '調査役,交渉役,支援役,記録役',
        },
        `役割${character.identifier}`
      )
    );
    groupElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '公開メモ',
        'どのルールでも使いやすい、汎用的な説明欄です。',
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.LONG_TEXT,
          type: DataElementType.NOTE,
        },
        `公開メモ${character.identifier}`
      )
    );
    groupElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '準備済み',
        1,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK,
          type: DataElementType.CHECK,
        },
        `準備済み${character.identifier}`
      )
    );
    groupElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '参考画像',
        character.imageDataElement!.getFirstElementByName('imageIdentifier')?.value ?? '',
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.IMAGE,
          type: DataElementType.IMAGE,
        },
        `参考画像${character.identifier}`
      )
    );
    groupElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '能力合計',
        '',
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CALC,
          [DataElementAttribute.FORMULA]: '器用度 + 敏捷度 + 筋力 + 生命力 + 知力 + 精神力',
        },
        `能力合計${character.identifier}`
      )
    );
  }

  private static appendSkillSampleElements(character: GameCharacter): void {
    const sectionElement = CharacterTemplateFactory.createSectionElement('スキル', `スキル${character.identifier}`);
    sectionElement.setAttribute('cs-colspan', '2');
    const categoryElements = new Map<string, DataElement>();
    character.detailDataElement!.appendChild(sectionElement);

    const skillSamples = [
      {
        category: 'アクション',
        name: '精密射撃',
        kind: '攻撃',
        ability: '器用度',
        skillReference: '技能表/7/技巧',
        power: 12,
        hitBonus: 2,
        mpCost: 4,
        range: '遠距離',
        effect: '判定に成功したら、威力に器用度を加えてダメージを算出します。',
      },
      {
        category: 'アクション',
        name: '重撃',
        kind: '攻撃',
        ability: '筋力',
        skillReference: '技能表/8/身体',
        power: 18,
        hitBonus: -1,
        mpCost: 6,
        range: '近距離',
        effect: '命中しにくい代わりに、高い威力を持つ攻撃サンプルです。',
      },
      {
        category: '支援',
        name: '応急手当',
        kind: '回復',
        ability: '知力',
        skillReference: '技能表/2/知識',
        power: 10,
        hitBonus: 1,
        mpCost: 3,
        range: '接触',
        effect: '対象のHPを威力ぶん回復します。消耗品や状況に応じて補正を加えてください。',
      },
    ];

    for (const sample of skillSamples) {
      let categoryElement = categoryElements.get(sample.category);
      if (!categoryElement) {
        categoryElement = CharacterTemplateFactory.createGroupElement(
          sample.category,
          `スキル${sample.category}${character.identifier}`
        );
        if (sample.category === 'アクション') categoryElement.setAttribute('cs-colspan', '2');
        sectionElement.appendChild(categoryElement);
        categoryElements.set(sample.category, categoryElement);
      }

      const skillElement = CharacterTemplateFactory.createGroupElement(
        sample.name,
        `スキル${sample.category}${sample.name}${character.identifier}`
      );
      categoryElement.appendChild(skillElement);
      CharacterTemplateFactory.appendSkillFields(character, skillElement, sample);
    }
  }

  private static appendSkillFields(
    character: GameCharacter,
    skillElement: DataElement,
    sample: {
      category: string;
      name: string;
      kind: string;
      ability: string;
      skillReference: string;
      power: number;
      hitBonus: number;
      mpCost: number;
      range: string;
      effect: string;
    }
  ): void {
    const prefix = `スキル${sample.category}${sample.name}${character.identifier}`;

    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '名称',
        sample.name,
        { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.TEXT },
        `${prefix}名称`
      )
    );
    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '種別',
        sample.kind,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.SELECT,
          [DataElementAttribute.CHOICES]: '攻撃,支援,妨害,回復,移動',
        },
        `${prefix}種別`
      )
    );
    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '判定能力',
        sample.ability,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.SELECT,
          [DataElementAttribute.CHOICES]: '器用度,敏捷度,筋力,生命力,知力,精神力',
        },
        `${prefix}判定能力`
      )
    );
    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '技能参照',
        sample.skillReference,
        { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.TEXT },
        `${prefix}技能参照`
      )
    );
    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '威力',
        sample.power,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
          [DataElementAttribute.UNIT]: '点',
          [DataElementAttribute.MIN]: '0',
          [DataElementAttribute.MAX]: '999',
        },
        `${prefix}威力`
      )
    );
    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '命中補正',
        sample.hitBonus,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
          [DataElementAttribute.UNIT]: '点',
        },
        `${prefix}命中補正`
      )
    );
    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '消費MP',
        sample.mpCost,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
          [DataElementAttribute.UNIT]: '点',
          [DataElementAttribute.MIN]: '0',
        },
        `${prefix}消費MP`
      )
    );
    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '射程',
        sample.range,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.SELECT,
          [DataElementAttribute.CHOICES]: '自身,接触,近距離,中距離,遠距離,場面',
        },
        `${prefix}射程`
      )
    );
    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '使用済み',
        0,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK,
          type: DataElementType.CHECK,
        },
        `${prefix}使用済み`
      )
    );
    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '効果',
        sample.effect,
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.LONG_TEXT,
          type: DataElementType.NOTE,
        },
        `${prefix}効果`
      )
    );
    skillElement.appendChild(
      CharacterTemplateFactory.createFieldElement(
        '合計威力',
        '',
        {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CALC,
          [DataElementAttribute.FORMULA]: `[スキル/${sample.category}/${sample.name}/威力] + [能力/基本/${sample.ability}]`,
        },
        `${prefix}合計威力`
      )
    );
  }

  private static createSectionElement(name: string, identifier: string): DataElement {
    return DataElement.create(name, '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION }, identifier);
  }

  private static createGroupElement(name: string, identifier: string): DataElement {
    return DataElement.create(name, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP }, identifier);
  }

  private static createGenericSkillTableElement(character: GameCharacter): DataElement {
    const categories = [
      {
        name: '技巧',
        skills: ['解錠', '工作', '細工', '修理', '道具知識', '照準', '道具扱い', '鑑定', '罠解除', '精密操作', '改造'],
      },
      {
        name: '身体',
        skills: ['跳躍', '登攀', '持久', '格闘', '回避', '運搬', '踏み込み', '水泳', '投擲', '剛力', '受け身'],
      },
      {
        name: '隠密',
        skills: ['静音移動', '尾行', '潜入', '変装', '偽装', '逃走', '追跡', '聞き耳', '影渡り', '隠蔽', '危険察知'],
      },
      {
        name: '知識',
        skills: [
          '応急処置',
          '薬品知識',
          '自然知識',
          '歴史',
          '調査',
          '推理',
          '心理',
          '地理',
          '戦略',
          '学術',
          'オカルト',
        ],
      },
      {
        name: '交流',
        skills: ['交渉', '説得', '威圧', '共感', '礼儀', '噂話', '取引', '指揮', '人脈', '演技', '励まし'],
      },
      {
        name: '異能',
        skills: ['霊感', '感応', '予見', '護符', '幻視', '結界', '浄化', '変化', '念動', '呼応', '呪印'],
      },
    ];
    const checked = categories.map((_, categoryIndex) =>
      DEFAULT_SKILL_TABLE_ROW_NAMES.map((__, rowIndex) => categoryIndex === 0 && rowIndex === 0)
    );

    return createSkillGapTableElement({
      name: '技能表',
      idSuffix: character.identifier,
      categories: categories.map((category) => category.name),
      skillsByCategory: categories.map((category) => category.skills),
      checked,
    });
  }

  private static createSkillTableType2Element(character: GameCharacter): DataElement {
    const tableElement = DataElement.create(
      '技能表タイプ2',
      '',
      {
        'cs-colspan': '2',
        [DataElementAttribute.ROLE]: DataElementRole.SECTION,
        [DataElementAttribute.VIEW_MODE]: DataElementViewMode.TABLE,
        [DataElementAttribute.ROW_HEADER_LABEL]: '技能',
      },
      `技能表タイプ2_${character.identifier}`
    );
    const rankChoices = '初級,中級,上級';
    const categories = [
      {
        name: '肉体技能',
        skills: [
          ['肉体攻撃', ''],
          ['剛力', ''],
          ['水泳', ''],
          ['登攀', '初級'],
        ],
      },
      {
        name: '機械技能',
        skills: [
          ['運動', '初級'],
          ['隠密', '初級'],
          ['運転', ''],
          ['操作', ''],
        ],
      },
      {
        name: '感覚技能',
        skills: [
          ['射撃攻撃', '中級'],
          ['意思疎通', ''],
          ['芸術(絵画)', '初級'],
          ['知覚', '初級'],
        ],
      },
      {
        name: '幸運技能',
        skills: [
          ['直感', ''],
          ['賭博', '初級'],
          ['交渉', ''],
          ['社会', ''],
        ],
      },
      {
        name: '知力技能',
        skills: [
          ['特殊攻撃', '中級'],
          ['知謀・パワー', '上級'],
          ['応急手当', ''],
          ['情報技術', ''],
        ],
      },
      {
        name: '精神技能',
        skills: [
          ['礼儀', ''],
          ['統率', ''],
          ['尋問', '初級'],
          ['魅了', ''],
        ],
      },
    ];

    for (let rowIndex = 0; rowIndex < 4; rowIndex++) {
      const rowElement = CharacterTemplateFactory.createGroupElement(
        `行${rowIndex + 1}`,
        `技能表タイプ2_行${rowIndex + 1}_${character.identifier}`
      );
      tableElement.appendChild(rowElement);
      for (const category of categories) {
        const [skillName, rank] = category.skills[rowIndex];
        rowElement.appendChild(
          CharacterTemplateFactory.createFieldElement(
            `${category.name}名`,
            skillName,
            {
              [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.TEXT,
              [DataElementAttribute.COLUMN_LABEL]: '技能',
              [DataElementAttribute.COLUMN_GROUP]: category.name,
            },
            `技能表タイプ2_${rowIndex + 1}_${category.name}名_${character.identifier}`
          )
        );
        rowElement.appendChild(
          CharacterTemplateFactory.createFieldElement(
            `${category.name}習熟度`,
            rank,
            {
              [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.SELECT,
              [DataElementAttribute.CHOICES]: rankChoices,
              [DataElementAttribute.COLUMN_LABEL]: '習熟度',
              [DataElementAttribute.COLUMN_GROUP]: category.name,
            },
            `技能表タイプ2_${rowIndex + 1}_${category.name}習熟度_${character.identifier}`
          )
        );
      }
    }

    return tableElement;
  }

  private static createPartsSectionElement(character: GameCharacter): DataElement {
    const sectionElement = CharacterTemplateFactory.createSectionElement('パーツ', `パーツ_${character.identifier}`);
    sectionElement.setAttribute('cs-colspan', '2');
    const sites = [
      {
        name: '頭',
        parts: [
          { name: '義眼', timing: '常時', cost: 0, range: '自身', effect: '判定+1', damaged: 0, used: 0 },
          { name: 'センサー', timing: '行動', cost: 1, range: '0～2', effect: '索敵', damaged: 0, used: 0 },
        ],
      },
      {
        name: '腕',
        parts: [
          { name: '鉤爪', timing: '行動', cost: 2, range: '0', effect: '近接攻撃1', damaged: 0, used: 1 },
          { name: '盾', timing: 'ダメージ', cost: 1, range: '0', effect: '防御1', damaged: 0, used: 0 },
        ],
      },
      {
        name: '胴',
        parts: [
          { name: '装甲', timing: 'ダメージ', cost: 1, range: '自身', effect: '防御1', damaged: 1, used: 0 },
          { name: '予備動力', timing: '常時', cost: 0, range: '自身', effect: '行動値+1', damaged: 0, used: 0 },
        ],
      },
      {
        name: '脚',
        parts: [
          {
            name: '強化脚',
            timing: '割り込み',
            cost: 0,
            range: '自身',
            effect: '移動1（1ターンに1回）',
            damaged: 0,
            used: 0,
          },
        ],
      },
    ];

    for (const site of sites) {
      const sitePrefix = `パーツ_${site.name}`;
      const tableElement = CharacterTemplateFactory.createGroupElement(
        site.name,
        `${sitePrefix}_${character.identifier}`
      );
      tableElement.setAttribute(DataElementAttribute.VIEW_MODE, DataElementViewMode.TABLE);
      sectionElement.appendChild(tableElement);

      for (const part of site.parts) {
        const prefix = `${sitePrefix}_${part.name}`;
        const rowElement = CharacterTemplateFactory.createGroupElement(part.name, `${prefix}_${character.identifier}`);
        tableElement.appendChild(rowElement);
        const cells: [string, number | string, Record<string, number | string>][] = [
          [
            '損傷',
            part.damaged,
            { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK, type: DataElementType.CHECK },
          ],
          [
            '使用済み',
            part.used,
            { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK, type: DataElementType.CHECK },
          ],
          [
            'タイミング',
            part.timing,
            {
              [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.SELECT,
              [DataElementAttribute.CHOICES]: '常時,行動,判定,ダメージ,割り込み',
            },
          ],
          ['コスト', part.cost, { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER }],
          ['射程', part.range, { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.TEXT }],
          ['効果', part.effect, { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.TEXT }],
        ];
        for (const [column, value, attributes] of cells) {
          rowElement.appendChild(
            CharacterTemplateFactory.createFieldElement(
              column,
              value,
              attributes,
              `${prefix}_${column}_${character.identifier}`
            )
          );
        }
      }
    }

    return sectionElement;
  }

  private static createFieldElement(
    name: string,
    value: number | string,
    attributes: Record<string, number | string>,
    identifier: string
  ): DataElement {
    return DataElement.create(
      name,
      value,
      { ...attributes, [DataElementAttribute.ROLE]: DataElementRole.FIELD },
      identifier
    );
  }

  private static appendChatPalette(character: GameCharacter): void {
    const palette = new ChatPalette(`ChatPalette_${character.identifier}`);
    palette.setPalette(`チャットパレット入力例：
◆基本判定
2d6+{能力/基本/敏捷度}+{補正} 敏捷度判定
2d6+{能力/基本/知力}+{補正} 知力判定

◆スキル
2d6+{精密射撃命中} {スキル/アクション/精密射撃/名称} 命中 / 射程:{スキル/アクション/精密射撃/射程}
1d10+{精密射撃威力} {スキル/アクション/精密射撃/名称} 威力
:MP-{スキル/アクション/精密射撃/消費MP}
2d6+{重撃命中} {スキル/アクション/重撃/名称} 命中 / 射程:{スキル/アクション/重撃/射程}
1d10+{重撃威力} {スキル/アクション/重撃/名称} 威力
:MP-{スキル/アクション/重撃/消費MP}
2d6+{応急手当判定} {スキル/支援/応急手当/名称} 判定
1d6+{応急手当回復} {スキル/支援/応急手当/名称} 回復量
:MP-{スキル/支援/応急手当/消費MP}

◆技能表
2d6 技能表: 技巧/照準
2d6 技能表: 知識/応急処置

リソース操作コマンド例：
:MP-3
:HP+5
:HP+{応急手当回復}

//補正=1
//精密射撃命中={能力/基本/器用度}+{スキル/アクション/精密射撃/命中補正}
//精密射撃威力={スキル/アクション/精密射撃/威力}+{能力/基本/器用度}
//重撃命中={能力/基本/筋力}+{スキル/アクション/重撃/命中補正}
//重撃威力={スキル/アクション/重撃/威力}+{能力/基本/筋力}
//応急手当判定={能力/基本/知力}+{スキル/支援/応急手当/命中補正}
//応急手当回復={スキル/支援/応急手当/威力}+{能力/基本/知力}`);
    palette.initialize();
    character.appendChild(palette);
  }
}
