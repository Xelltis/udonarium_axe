import { carryToAliasMates, writeElementField } from '@axe/domain/character/alias-mate-follow';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import type { ElementAliasTable } from '@axe/domain/data/element-alias';

function resource(name: string, max: number, current: number, attributes: Record<string, string> = {}): DataElement {
  return DataElement.create(name, max, {
    type: DataElementType.NUMBER_RESOURCE,
    currentValue: String(current),
    ...attributes,
  });
}

const SPEED: ElementAliasTable = [{ name: '行動値', candidates: ['リソース/行動値', '戦闘/行動値', 'イニシアティブ'] }];

describe('an item edited on its sheet and its alias mates', () => {
  let detail: DataElement;
  let first: DataElement;
  let second: DataElement;
  let plain: DataElement;

  beforeEach(() => {
    detail = DataElement.create('detail', '');
    first = resource('行動値', 20, 10);
    second = resource('行動値', 20, 12);
    plain = DataElement.create('イニシアティブ', 4);
    const resources = DataElement.create('リソース', '');
    const battle = DataElement.create('戦闘', '');
    detail.appendChild(resources);
    detail.appendChild(battle);
    resources.appendChild(first);
    battle.appendChild(second);
    battle.appendChild(plain);
  });

  it('gives what is left of a resource to what its mates hold now', () => {
    writeElementField(first, 'currentValue', 15, SPEED);

    expect(first.currentValue).toBe(15);
    expect(second.currentValue).toBe(15);
    expect(plain.value).toBe(15);
    expect(second.value).toBe(20);
  });

  it('gives a maximum to the maximums of its mates, and leaves what they hold alone', () => {
    writeElementField(second, 'value', 30, SPEED);

    expect(first.value).toBe(30);
    expect(`${first.currentValue}`).toBe('10');
    expect(plain.value).toBe(4);
  });

  it('gives the value of a plain field to what its mates hold now', () => {
    writeElementField(plain, 'value', 9, SPEED);

    expect(first.currentValue).toBe(9);
    expect(second.currentValue).toBe(9);
    expect(first.value).toBe(20);
  });

  it('holds each mate within its own bounds', () => {
    second.value = 14;
    first.value = 99;

    writeElementField(first, 'currentValue', 50, SPEED);

    expect(first.currentValue).toBe(50);
    expect(second.currentValue).toBe(14);
  });

  it('holds a mate under the minimum it was given', () => {
    second.setAttribute(DataElementAttribute.MIN_BASE, '0');

    writeElementField(first, 'currentValue', -5, SPEED);

    expect(first.currentValue).toBe(-5);
    expect(second.currentValue).toBe(0);
  });

  it('carries words as they were typed', () => {
    writeElementField(plain, 'value', '未行動', SPEED);

    expect(first.currentValue).toBe('未行動');
  });

  it('writes nothing to a mate that already holds the value', () => {
    second.currentValue = 15;
    const before = second.version;

    writeElementField(first, 'currentValue', 15, SPEED);

    expect(second.version).toBe(before);
  });

  it('counts the item and its mates as one change apiece', () => {
    const before = [first.version, second.version, plain.version].map(Math.floor);

    writeElementField(first, 'currentValue', 15, SPEED);

    expect([first.version, second.version, plain.version].map(Math.floor)).toEqual(before.map((major) => major + 1));
  });

  it('leaves an item no alias stands for to itself', () => {
    const hp = resource('HP', 30, 30);
    detail.children[0].appendChild(hp);

    writeElementField(hp, 'currentValue', 1, SPEED);

    expect(`${first.currentValue}`).toBe('10');
    expect(`${second.currentValue}`).toBe('12');
  });

  it('does nothing in a room with no aliases', () => {
    writeElementField(first, 'currentValue', 15, []);

    expect(`${second.currentValue}`).toBe('12');
    expect(plain.value).toBe(4);
  });

  it('writes nothing further when a value arrives from another seat', () => {
    const context = first.toContext();
    context.majorVersion += 1;
    const attributes = context.syncData['attributes'] as Record<string, unknown>;
    context.syncData = { ...context.syncData, attributes: { ...attributes, currentValue: 18 } };
    const before = [second.version, plain.version];

    first.apply(context);

    expect(first.currentValue).toBe(18);
    expect(`${second.currentValue}`).toBe('12');
    expect(plain.value).toBe(4);
    expect([second.version, plain.version]).toEqual(before);
  });

  it('carries only when the seat that edited asks it to', () => {
    first.currentValue = 18;
    expect(`${second.currentValue}`).toBe('12');

    carryToAliasMates(first, 'currentValue', SPEED);

    expect(second.currentValue).toBe(18);
  });
});
