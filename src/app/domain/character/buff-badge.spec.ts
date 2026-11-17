import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import {
  buffBadgeOf,
  buffIconOf,
  buffIconUrlOf,
  countBuffs,
  parseBuffStrength,
  toBuffBadges,
} from '@axe/domain/character/buff-badge';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

describe('parseBuffStrength()', () => {
  it('takes the number out of an effect', () => {
    expect(parseBuffStrength('防+1')).toBe('+1');
    expect(parseBuffStrength('ダメージ2')).toBe('2');
    expect(parseBuffStrength('攻撃力-3')).toBe('-3');
    expect(parseBuffStrength('移動0.5倍')).toBe('0.5');
  });

  it('reads a full-width minus as a sign', () => {
    expect(parseBuffStrength('命中−2')).toBe('-2');
  });

  it('returns nothing when there is no number', () => {
    expect(parseBuffStrength('麻痺')).toBe('');
    expect(parseBuffStrength('')).toBe('');
  });

  it('shows no strength for a zero', () => {
    expect(parseBuffStrength('0')).toBe('');
    expect(parseBuffStrength('効果+0')).toBe('');
  });
});

describe('toBuffBadges()', () => {
  const created: DataElement[] = [];

  function buff(name: string, effect: string, rounds: number, icon?: string): DataElement {
    const element = DataElement.create(name, rounds, {
      type: DataElementType.NUMBER_RESOURCE,
      currentValue: effect,
    });
    if (icon) element.setAttribute(DataElementAttribute.BUFF_ICON, icon);
    created.push(element);
    return element;
  }

  afterEach(() => {
    for (const element of created.splice(0)) element.destroy();
  });

  it('makes the badge of one row in its colour, saying it counts nothing down where it never runs out', () => {
    const row = buff('石化', 'HP=0', 1, '🪨');
    row.setAttribute(DataElementAttribute.BUFF_COLOR, '#2e7d32');
    row.setAttribute(DataElementAttribute.BUFF_TIMING, 'none');

    expect(buffBadgeOf(row)).toMatchObject({
      icon: '🪨',
      name: '石化',
      effect: 'HP=0',
      strength: '',
      rounds: 1,
      expires: false,
      color: '#2e7d32',
    });
  });

  it('carries the kind the buff is marked as, and none where it carries no mark', () => {
    const cursed = buff('呪い', '命中-1', 3);
    cursed.setAttribute(DataElementAttribute.BUFF_KIND, 'debuff');
    const odd = buff('祝福', '命中+1', 3);
    odd.setAttribute(DataElementAttribute.BUFF_KIND, 'curse');

    expect(buffBadgeOf(cursed).kindMark).toBe('debuff');
    expect(buffBadgeOf(buff('毒', '', 3)).kindMark).toBeNull();
    expect(buffBadgeOf(odd).kindMark).toBeNull();
  });

  it('carries the moment the effect moves at where the buff has one of its own, and none otherwise', () => {
    const row = buff('再生', ':HP+0~+3', 3, '💚');
    expect(buffBadgeOf(row).effectTiming).toBeNull();

    row.setAttribute(DataElementAttribute.BUFF_EFFECT_TIMING, 'turnStart');
    expect(buffBadgeOf(row).effectTiming).toBe('turnStart');

    row.setAttribute(DataElementAttribute.BUFF_EFFECT_TIMING, '');
    expect(buffBadgeOf(row).effectTiming).toBeNull();
  });

  it('folds a buff into its icon, its strength and the rounds left', () => {
    const root = DataElement.create('buff', '', {});
    created.push(root);
    const container = DataElement.create('バフ', '', {});
    created.push(container);
    root.appendChild(container);
    container.appendChild(buff('毒', 'ダメージ2', 3, '☠️'));
    container.appendChild(buff('加護', '防+1', 1));

    const badges = toBuffBadges(root);

    expect(badges).toHaveLength(2);
    expect(badges[0]).toMatchObject({ icon: '☠️', name: '毒', strength: '2', rounds: 3, iconUrl: '' });
    expect(badges[1]).toMatchObject({ name: '加護', strength: '+1', rounds: 1 });
  });

  it('marks the one that waits to be taken away as counting nothing down', () => {
    const root = DataElement.create('buff', '', {});
    created.push(root);
    const container = DataElement.create('バフ', '', {});
    created.push(container);
    root.appendChild(container);
    const held = buff('毒', '', 0);
    held.setAttribute(DataElementAttribute.BUFF_TIMING, 'none');
    container.appendChild(held);
    container.appendChild(buff('加護', '', 2));

    const badges = toBuffBadges(root);

    expect(badges.map((badge) => badge.expires)).toEqual([false, true]);
  });

  it('falls back to the default mark without an icon', () => {
    const element = buff('加護', '防+1', 1);

    expect(buffIconOf(element)).not.toBe('');
    expect(buffIconOf(element)).toBe(buffIconOf(buff('別のバフ', '', 1)));
  });

  it('returns nothing when it is unset', () => {
    expect(toBuffBadges(null)).toEqual([]);
  });
});

describe('buffIconUrlOf()', () => {
  afterEach(() => vi.restoreAllMocks());

  it('finds the picture an icon names', () => {
    vi.spyOn(ImageStorage.instance, 'get').mockImplementation((identifier: string) =>
      identifier === 'image-1' ? ({ identifier, url: 'blob:poison' } as ImageFile) : null
    );

    expect(buffIconUrlOf('image-1')).toBe('blob:poison');
  });

  it('finds a picture the app carries, named by its path with slashes and brackets, as a die’s face is', () => {
    const face = './assets/images/dice/6_dice/6_dice[1].png';
    vi.spyOn(ImageStorage.instance, 'get').mockImplementation((identifier: string) =>
      identifier === face ? ({ identifier, url: face } as ImageFile) : null
    );

    expect(buffIconUrlOf(face)).toBe(face);
  });

  it('leaves a mark as a mark, since no picture goes by that name', () => {
    vi.spyOn(ImageStorage.instance, 'get').mockReturnValue(null);

    expect(buffIconUrlOf('☠️')).toBe('');
    expect(buffIconUrlOf('毒')).toBe('');
    expect(buffIconUrlOf('A')).toBe('');
    expect(buffIconUrlOf('')).toBe('');
  });
});

describe('countBuffs()', () => {
  it('counts each row that time takes away, and every row of a row holding rows of its own', () => {
    const poison = DataElement.create('毒', 3, { type: DataElementType.NUMBER_RESOURCE, currentValue: 'ダメージ2' });
    const group = DataElement.create('祝福', '', {});
    group.appendChild(DataElement.create('命中', 2, { type: DataElementType.NUMBER_RESOURCE, currentValue: '+1' }));
    group.appendChild(DataElement.create('回避', 2, { type: DataElementType.NUMBER_RESOURCE, currentValue: '+1' }));
    const note = DataElement.create('メモ', '', {});

    try {
      expect(countBuffs([])).toBe(0);
      expect(countBuffs([poison, group, note])).toBe(3);
    } finally {
      for (const element of [poison, group, note]) element.destroy();
    }
  });
});
