import { parseAppspotCharacterForSystem } from '@axe/domain/character/import/system-profiles/appspot-profiles';

/**
 * Cut from a real sheet at the warehouse. What matters here is where each system keeps what a
 * piece spends: one counts in boxes beside its categories, the other in a number with a most.
 */
const SHINOBIGAMI = {
  base: { name: 'ヴォヤージュ・ヒカミ', level: '中忍頭' },
  ninpou: [{ name: '接近戦攻撃', type: '攻撃', targetSkill: '分身の術', effect: '接近戦ダメージを１点与える。' }],
  learned: [{ id: 'skills.row8.name2' }, { id: 'skills.row0.name2' }],
  skills: {
    a: null,
    b: '1',
    c: '1',
    d: null,
    e: null,
    f: null,
    damage: { check0: null, check1: null, check2: null, check3: null, check4: null, check5: null },
  },
};

const INSANE = {
  base: { name: '探索者' },
  hitpoint: { max: '6', value: '6' },
  sanepoint: { max: '5', value: '4' },
  ability: [{ name: '目星', targetSkill: '知覚' }],
};

describe('what a warehouse piece has left, whichever system it came from', () => {
  it('counts a life force kept in boxes beside the categories', () => {
    const character = parseAppspotCharacterForSystem(SHINOBIGAMI, 'shinobigami')!;

    expect(character.statuses).toEqual([{ label: '生命力', value: 6, max: 6 }]);
  });

  it('takes the boxes that are crossed off away from it', () => {
    const hurt = {
      ...SHINOBIGAMI,
      skills: { ...SHINOBIGAMI.skills, damage: { ...SHINOBIGAMI.skills.damage, check1: '0', check4: '0' } },
    };

    expect(parseAppspotCharacterForSystem(hurt, 'shinobigami')!.statuses).toEqual([
      { label: '生命力', value: 4, max: 6 },
    ]);
  });

  it('still brings the skill table and the palette with it', () => {
    const character = parseAppspotCharacterForSystem(SHINOBIGAMI, 'shinobigami')!;

    expect(character.skillTables).toHaveLength(1);
    expect(character.commands).toContain('接近戦攻撃');
  });

  it('reads a life force kept as a number, and calls it what its own page calls it', () => {
    const character = parseAppspotCharacterForSystem(INSANE, 'insane')!;

    expect(character.statuses).toEqual([
      { label: '生命力', value: 6, max: 6 },
      { label: '正気度', value: 4, max: 5 },
    ]);
  });

  it('reads that one the same way with nothing said about the system', () => {
    const pasted = parseAppspotCharacterForSystem(INSANE)!;

    expect(pasted.statuses.map((status) => [status.value, status.max])).toEqual([
      [6, 6],
      [4, 5],
    ]);
  });

  it('does not also keep it as a table nobody can move', () => {
    const character = parseAppspotCharacterForSystem(INSANE)!;

    expect(character.sections.some((section) => section.label.includes('hitpoint'))).toBe(false);
  });
});
