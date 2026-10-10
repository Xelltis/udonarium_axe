import { createEmptyImportedCharacter } from '@axe/domain/character/import/imported-character';
import { parseAppspotCharacterForSystem } from '@axe/domain/character/import/system-profiles/appspot-profiles';
import { fillFromGeneral } from '@axe/domain/character/import/system-profiles/profile-fill';

/** A warehouse character of one of the psycho-fiction systems, cut down to what matters here. */
const SHINOBIGAMI = {
  base: { name: 'かり', cover: '高校生', level: '中忍' },
  subAbility: { 生命力: { total: 6 }, 兵糧丸: { total: 2 } },
  baseAbility: { 階級: { total: 3 } },
  ninpou: [{ name: '接近戦攻撃', type: '攻撃', targetSkill: '掘削術', effect: '１点与える。' }],
  background: [{ name: '整備班', type: '長所', point: '3', effect: 'サポート忍法を自動成功。' }],
  learned: [{ id: 'skills.row10.name0' }, { id: 'skills.row3.name3' }],
  skills: { a: '1', b: null, c: null, d: null, e: null, f: '1' },
  outline: '設定テキスト',
};

describe('reading a warehouse sheet the same way whichever way it came in', () => {
  it('brings the resources in from its address, as it always did from pasted json', () => {
    const fromUrl = parseAppspotCharacterForSystem(SHINOBIGAMI, 'shinobigami')!;
    const fromJson = parseAppspotCharacterForSystem(SHINOBIGAMI)!;

    expect(fromUrl.statuses.map((status) => status.label)).toEqual(['生命力', '兵糧丸']);
    expect(fromUrl.statuses).toEqual(fromJson.statuses);
    expect(fromUrl.params).toEqual(fromJson.params);
  });

  it('counts life by its boxes and still brings the rest, where the sheet keeps both', () => {
    const boxed = {
      ...SHINOBIGAMI,
      skills: { ...SHINOBIGAMI.skills, damage: { check0: '0', check1: null, check2: null, check3: null } },
    };

    const fromUrl = parseAppspotCharacterForSystem(boxed, 'shinobigami')!;

    expect(fromUrl.statuses).toEqual([
      { label: '生命力', value: 5, max: 6 },
      { label: '兵糧丸', value: 2, max: 2 },
    ]);
    expect(fromUrl.statuses.map((status) => status.label)).toEqual(
      parseAppspotCharacterForSystem(boxed)!.statuses.map((status) => status.label)
    );
  });

  it('still says everything only the profile could say', () => {
    const fromUrl = parseAppspotCharacterForSystem(SHINOBIGAMI, 'shinobigami')!;

    expect(fromUrl.skillTables).toHaveLength(1);
    expect(fromUrl.skillTables[0].name).toBe('特技表');
    expect(fromUrl.commands).toContain('接近戦攻撃');
    expect(fromUrl.sections.some((section) => section.label === '忍法')).toBe(true);
  });

  it('leaves a profile that has resources of its own alone', () => {
    const profile = createEmptyImportedCharacter('appspot');
    profile.statuses = [{ label: 'HP', value: 30, max: 30 }];
    const general = createEmptyImportedCharacter('appspot');
    general.statuses = [{ label: 'そちらではない', value: 1, max: 1 }];
    general.params = [{ label: '種族', value: '人間' }];

    const filled = fillFromGeneral(profile, general);

    expect(filled.statuses).toEqual([{ label: 'HP', value: 30, max: 30 }]);
    expect(filled.params).toEqual([{ label: '種族', value: '人間' }]);
  });

  it('has nothing to fill in with where the sheet was not read generally at all', () => {
    const profile = createEmptyImportedCharacter('appspot');

    expect(fillFromGeneral(profile, null)).toBe(profile);
  });
});
