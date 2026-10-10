import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement, DataElementAttribute, DataElementRole } from '@axe/domain/data/data-element';
import { captureElementRestorePoint, restoreElementFromPoint } from '@axe/domain/data/data-element-restore';

function group(name: string): DataElement {
  return DataElement.create(name, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
}

function field(name: string, value: number | string): DataElement {
  return DataElement.create(name, value, { [DataElementAttribute.ROLE]: DataElementRole.FIELD });
}

function buildGroup(): { parent: DataElement; hp: DataElement; mp: DataElement; san: DataElement } {
  const parent = group('リソース');
  const hp = field('HP', 10);
  const mp = field('MP', 5);
  const san = field('SAN', 60);
  parent.appendChild(hp);
  parent.appendChild(mp);
  parent.appendChild(san);
  return { parent, hp, mp, san };
}

const find = (identifier: string) => ObjectStore.instance.get<DataElement>(identifier);
const names = (parent: DataElement) => parent.children.map((child) => (child as DataElement).name);

describe('putting a deleted element back', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('brings it back where it stood, with its value', () => {
    const { parent, mp } = buildGroup();
    const point = captureElementRestorePoint(mp)!;
    mp.destroy();

    const restored = restoreElementFromPoint(point, find)!;

    expect(names(parent)).toEqual(['HP', 'MP', 'SAN']);
    expect(String(restored.value)).toBe('5');
  });

  it('brings it back under a new identifier', () => {
    const { mp } = buildGroup();
    const identifier = mp.identifier;
    const point = captureElementRestorePoint(mp)!;
    mp.destroy();

    expect(restoreElementFromPoint(point, find)!.identifier).not.toBe(identifier);
  });

  it('brings back what was under it', () => {
    const parent = group('スキル');
    const skill = group('精密射撃');
    skill.appendChild(field('威力', 12));
    skill.appendChild(field('命中', 2));
    parent.appendChild(skill);
    const point = captureElementRestorePoint(skill)!;
    skill.destroy();

    const restored = restoreElementFromPoint(point, find)!;

    expect(names(restored)).toEqual(['威力', '命中']);
    expect(String((restored.children[0] as DataElement).value)).toBe('12');
  });

  it('goes last when it was the last', () => {
    const { parent, san } = buildGroup();
    const point = captureElementRestorePoint(san)!;
    san.destroy();

    restoreElementFromPoint(point, find);

    expect(names(parent)).toEqual(['HP', 'MP', 'SAN']);
  });

  it('keeps its place when the one it stood before is gone too', () => {
    const { parent, mp, san } = buildGroup();
    const point = captureElementRestorePoint(mp)!;
    mp.destroy();
    san.destroy();
    parent.appendChild(field('LUK', 3));

    restoreElementFromPoint(point, find);

    expect(names(parent)).toEqual(['HP', 'MP', 'LUK']);
  });

  it('takes a new name when another took its name meanwhile', () => {
    const { parent, mp } = buildGroup();
    const point = captureElementRestorePoint(mp)!;
    mp.destroy();
    parent.appendChild(field('MP', 0));

    expect(restoreElementFromPoint(point, find)!.name).not.toBe('MP');
  });

  it('cannot come back once its parent is gone', () => {
    const { parent, mp } = buildGroup();
    const point = captureElementRestorePoint(mp)!;
    parent.destroy();

    expect(restoreElementFromPoint(point, find)).toBeNull();
  });

  it('cannot be taken down without a parent element', () => {
    expect(captureElementRestorePoint(field('孤立', 1))).toBeNull();
  });
});
