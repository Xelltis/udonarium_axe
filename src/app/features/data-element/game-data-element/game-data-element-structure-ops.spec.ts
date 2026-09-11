import { TestBed } from '@angular/core/testing';
import { ObjectNode } from '@axe/core/sync/object-node';
import { DataElement, DataElementAttribute, DataElementRole } from '@axe/domain/data/data-element';
import { saveElementTemplate } from '@axe/domain/data/data-element-templates';
import {
  createFieldElement,
  createGroupElement,
  insertElementAfter,
  moveStructureElement,
  type NewElementNames,
  placeElementTemplate,
} from '@axe/features/data-element/game-data-element/game-data-element-structure-ops';

const NAMES: NewElementNames = { field: '新規タグ', group: '新規グループ' };

function group(name: string): DataElement {
  return DataElement.create(name, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
}

function field(name: string): DataElement {
  return DataElement.create(name, '', { [DataElementAttribute.ROLE]: DataElementRole.FIELD });
}

function childNames(element: DataElement): string[] {
  return element.children.map((child) => (child as DataElement).name);
}

describe('rearranging the items', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  describe('moveStructureElement()', () => {
    it('moves an item into a container', () => {
      const from = group('元');
      const into = group('先');
      const item = field('HP');
      from.appendChild(item);

      const moved = moveStructureElement(item, into, 'inside');

      expect(moved).toEqual({ newParent: into, oldParent: from });
      expect(childNames(into)).toEqual(['HP']);
      expect(childNames(from)).toEqual([]);
    });

    it('moves it in front of a sibling', () => {
      const parent = group('親');
      const first = field('HP');
      const second = field('MP');
      parent.appendChild(first);
      parent.appendChild(second);

      moveStructureElement(second, first, 'before');

      expect(childNames(parent)).toEqual(['MP', 'HP']);
    });

    it('moves it behind one', () => {
      const parent = group('親');
      const first = field('HP');
      const second = field('MP');
      const third = field('SAN');
      parent.appendChild(first);
      parent.appendChild(second);
      parent.appendChild(third);

      moveStructureElement(first, second, 'after');

      expect(childNames(parent)).toEqual(['MP', 'HP', 'SAN']);
    });

    it('does not move it beside something with no parent', () => {
      const orphan = group('親なし');
      const item = field('HP');
      group('元').appendChild(item);

      expect(moveStructureElement(item, orphan, 'before')).toBeNull();
    });
  });

  describe('insertElementAfter()', () => {
    it('adds it at the end when it goes behind the last', () => {
      const parent = group('親');
      const last = field('HP');
      parent.appendChild(last);

      insertElementAfter(field('MP'), last, parent);

      expect(childNames(parent)).toEqual(['HP', 'MP']);
    });
  });

  describe('createFieldElement()', () => {
    it('gives it a name no sibling has', () => {
      const parent = group('親');
      parent.appendChild(field('新規タグ'));

      const created = createFieldElement(parent, NAMES);

      expect(created.name).not.toBe('新規タグ');
      expect(created.getAttribute(DataElementAttribute.ROLE)).toBe(DataElementRole.FIELD);
    });

    it('keeps giving distinct names one after another', () => {
      const parent = group('親');
      const reserved = new Set<string>();

      const first = createFieldElement(parent, NAMES, reserved);
      const second = createFieldElement(parent, NAMES, reserved);

      expect(first.name).not.toBe(second.name);
    });
  });

  describe('createGroupElement()', () => {
    it('makes it with one thing already inside', () => {
      const parent = group('親');

      const created = createGroupElement(parent, NAMES);

      expect(created.getAttribute(DataElementAttribute.ROLE)).toBe(DataElementRole.GROUP);
      expect(created.children).toHaveLength(1);
      expect((created.children[0] as DataElement).getAttribute(DataElementAttribute.ROLE)).toBe(DataElementRole.FIELD);
    });

    it('gives a group a name no sibling has either', () => {
      const parent = group('親');
      parent.appendChild(group('新規グループ'));

      expect(createGroupElement(parent, NAMES).name).not.toBe('新規グループ');
    });
  });

  describe('placeElementTemplate()', () => {
    function buildSheet(): { owner: ObjectNode; detail: DataElement; section: DataElement; table: DataElement } {
      const owner = new ObjectNode();
      owner.initialize();
      const root = DataElement.create('character', '');
      const detail = DataElement.create('detail', '');
      const section = DataElement.create('パーツ', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
      const table = group('頭');
      const row = group('義眼');
      row.appendChild(field('損傷'));
      table.appendChild(row);
      owner.appendChild(root);
      root.appendChild(detail);
      detail.appendChild(section);
      section.appendChild(table);
      return { owner, detail, section, table };
    }

    it('puts a template inside the container when it fits there', () => {
      const { owner, section, table } = buildSheet();
      const template = saveElementTemplate(owner, table.children[0])!;

      const placed = placeElementTemplate(template, section)!;

      expect(placed.parent).toBe(section);
      expect(childNames(section)).toEqual(['頭', '義眼']);
      expect(placed.element.getAttribute(DataElementAttribute.ROLE)).toBe(DataElementRole.GROUP);
    });

    it('sets it down just after the container, one level out, when it would sink too deep inside', () => {
      const { owner, section, table } = buildSheet();
      section.appendChild(group('腕'));
      const template = saveElementTemplate(owner, table)!;

      const placed = placeElementTemplate(template, table)!;

      expect(placed.parent).toBe(section);
      expect(childNames(section)).toEqual(['頭', '頭 2', '腕']);
      expect(placed.element.getAttribute(DataElementAttribute.ROLE)).toBe(DataElementRole.GROUP);
    });

    it('takes it out to the sheet as a section when nothing inside will hold it', () => {
      const { owner, detail, section } = buildSheet();
      const deep = DataElement.create('全身', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
      const outer = group('外');
      const inner = group('内');
      inner.appendChild(field('損傷'));
      outer.appendChild(inner);
      deep.appendChild(outer);
      const template = saveElementTemplate(owner, deep)!;

      const placed = placeElementTemplate(template, section)!;

      expect(placed.parent).toBe(detail);
      expect(childNames(detail)).toEqual(['パーツ', '全身']);
      expect(placed.element.getAttribute(DataElementAttribute.ROLE)).toBe(DataElementRole.SECTION);
    });

    it('sets a section down inside a section as a group', () => {
      const { owner, section } = buildSheet();
      const other = DataElement.create('腕', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
      const shield = group('盾');
      shield.appendChild(field('損傷'));
      other.appendChild(shield);
      const template = saveElementTemplate(owner, other)!;

      const placed = placeElementTemplate(template, section)!;

      expect(placed.parent).toBe(section);
      expect(placed.element.getAttribute(DataElementAttribute.ROLE)).toBe(DataElementRole.GROUP);
      expect(childNames(placed.element)).toEqual(['盾']);
    });
  });
});
