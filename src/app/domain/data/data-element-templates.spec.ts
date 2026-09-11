import { TestBed } from '@angular/core/testing';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
} from '@axe/domain/data/data-element';
import { duplicateDataElement } from '@axe/domain/data/data-element-templates';

function group(name: string): DataElement {
  return DataElement.create(name, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
}

function check(name: string, value: number): DataElement {
  return DataElement.create(name, value, {
    [DataElementAttribute.ROLE]: DataElementRole.FIELD,
    [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK,
  });
}

function identifiersOf(element: DataElement): string[] {
  return [element.identifier, ...element.children.flatMap((child) => identifiersOf(child))];
}

function buildSheet(): { root: DataElement; section: DataElement; part: DataElement } {
  const root = DataElement.create('character', '');
  const detail = DataElement.create('detail', '');
  const section = DataElement.create('パーツ', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
  const part = group('義眼');
  part.appendChild(check('損傷', 1));
  part.appendChild(DataElement.create('効果', '判定+1', { [DataElementAttribute.ROLE]: DataElementRole.FIELD }));
  root.appendChild(detail);
  detail.appendChild(section);
  section.appendChild(part);
  return { root, section, part };
}

describe('copies and templates of a part of a sheet', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('copies a part with new identifiers throughout and a name no sibling has', () => {
    const { section, part } = buildSheet();

    const copy = duplicateDataElement(part, section)!;

    expect(copy.name).toBe('義眼 2');
    expect(identifiersOf(copy).filter((identifier) => identifiersOf(part).includes(identifier))).toEqual([]);
    expect(copy.children.map((child) => child.name)).toEqual(['損傷', '効果']);
    expect(copy.children[0].fieldType).toBe(DataElementFieldType.CHECK);
  });
});
