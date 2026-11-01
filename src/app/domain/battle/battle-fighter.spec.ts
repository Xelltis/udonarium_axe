import { fighterBetween } from '@axe/domain/battle/battle-fighter';
import { FighterSource, readFighter, readingsDiffer } from '@axe/domain/battle/battle-reading';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

describe('reading a fighter', () => {
  const created: DataElement[] = [];

  function make(name: string, value: number | string, options: Record<string, string | number> = {}): DataElement {
    const element = DataElement.create(name, value, options);
    created.push(element);
    return element;
  }

  function resource(name: string, current: number, max: number, onPiece: boolean, inverted = false): DataElement {
    const element = make(name, max, { type: DataElementType.NUMBER_RESOURCE, currentValue: current });
    if (onPiece) element.setAttribute(DataElementAttribute.PIECE_GAUGE, 'true');
    if (inverted) element.setAttribute(DataElementAttribute.GAUGE_INVERTED, 'true');
    return element;
  }

  function piece(...resources: DataElement[]): FighterSource & { elements: DataElement[] } {
    const detail = make('detail', '');
    for (const element of resources) detail.appendChild(element);
    const image = make('image', '');
    image.appendChild(make('imageIdentifier', 'image-hero'));
    return {
      identifier: 'hero',
      name: '勇者',
      detailDataElement: detail,
      imageDataElement: image,
      elements: resources,
    };
  }

  afterEach(() => {
    for (const element of created.splice(0)) element.destroy();
  });

  it('reads the picture and every resource as they stand', () => {
    const hero = piece(resource('HP', 12, 20, true), resource('所持金', 300, 9999, false));

    const reading = readFighter(hero);

    expect(reading.name).toBe('勇者');
    expect(reading.image).toBe('image-hero');
    expect([...reading.resources.values()].map((entry) => [entry.name, entry.current, entry.max, entry.bar])).toEqual([
      ['HP', 12, 20, true],
      ['所持金', 300, 9999, false],
    ]);
  });

  it('reads the picture the piece shows on the table, as the ICON of the sheet picks it', () => {
    const hero = piece();
    hero.imageDataElement!.appendChild(make('imageIdentifier', 'image-hero-angry'));
    const icon = make('ICON', 1, { type: DataElementType.NUMBER_RESOURCE, currentValue: 1 });
    hero.detailDataElement!.appendChild(icon);

    expect(readFighter(hero).image).toBe('image-hero-angry');

    icon.currentValue = 0;
    expect(readFighter(hero).image).toBe('image-hero');
  });

  it('carries the way the picture faces onto the stage', () => {
    const hero = { ...piece(), battleFacing: 'left' };

    const reading = readFighter(hero);

    expect(reading.facing).toBe('left');
    expect(fighterBetween(reading, reading, { enabled: false, resource: '' }).facing).toBe('left');
    expect(readFighter(piece()).facing).toBeNull();
  });

  it('carries the bars, then whatever else moved, and brings down one that fell to nothing', () => {
    const hp = resource('HP', 12, 20, true);
    const mp = resource('MP', 5, 10, true);
    const money = resource('所持金', 300, 9999, false);
    const ammo = resource('弾', 6, 6, false);
    const hero = piece(hp, mp, money, ammo);
    const before = readFighter(hero);

    hp.currentValue = 0;
    ammo.currentValue = 5;
    const after = readFighter(hero);
    const fighter = fighterBetween(before, after, { enabled: true, resource: 'HP' });

    expect(readingsDiffer(before, after)).toBe(true);
    expect(fighter.gauges).toEqual([
      { name: 'HP', before: 12, after: 0, max: 20, inverted: false, color: '' },
      { name: 'MP', before: 5, after: 5, max: 10, inverted: false, color: '' },
      { name: '弾', before: 6, after: 5, max: 6, inverted: false, color: '' },
    ]);
    expect(fighter.defeated).toBe(true);
  });

  it('brings nobody down while the room has going down turned off, or by another resource', () => {
    const hp = resource('HP', 3, 20, true);
    const hero = piece(hp);
    const before = readFighter(hero);
    hp.currentValue = 0;
    const after = readFighter(hero);

    expect(fighterBetween(before, after, { enabled: false, resource: 'HP' }).defeated).toBe(false);
    expect(fighterBetween(before, after, { enabled: true, resource: '生命力' }).defeated).toBe(false);
  });

  it('sees no difference between two readings of nothing moving', () => {
    const hero = piece(resource('HP', 12, 20, true));

    expect(readingsDiffer(readFighter(hero), readFighter(hero))).toBe(false);
  });
});
