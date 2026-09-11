import { TestBed } from '@angular/core/testing';
import { ObjectNode } from '@axe/core/sync/object-node';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
} from '@axe/domain/data/data-element';
import {
  appendElementTemplateToSheet,
  buildElementTemplate,
  duplicateDataElement,
  findElementTemplateHolder,
  findElementTemplateOwner,
  findOwnerRootElement,
  readElementTemplates,
  saveElementTemplate,
  sheetElementsOf,
} from '@axe/domain/data/data-element-templates';

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

function buildSheet(): {
  owner: ObjectNode;
  root: DataElement;
  detail: DataElement;
  section: DataElement;
  part: DataElement;
} {
  const owner = new ObjectNode();
  owner.initialize();
  const root = DataElement.create('character', '');
  const detail = DataElement.create('detail', '');
  const section = DataElement.create('パーツ', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
  const part = group('義眼');
  part.appendChild(check('損傷', 1));
  part.appendChild(DataElement.create('効果', '判定+1', { [DataElementAttribute.ROLE]: DataElementRole.FIELD }));
  owner.appendChild(root);
  root.appendChild(detail);
  detail.appendChild(section);
  section.appendChild(part);
  return { owner, root, detail, section, part };
}

function buildTable(): DataElement {
  const table = group('頭');
  const row = group('義眼');
  row.appendChild(check('損傷', 0));
  table.appendChild(row);
  return table;
}

describe('copies and templates of a part of a sheet', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('finds the sheet and the piece it belongs to from anywhere inside it', () => {
    const { owner, root, part } = buildSheet();

    expect(findOwnerRootElement(part.children[0])).toBe(root);
    expect(findElementTemplateOwner(part.children[0])).toBe(owner);
  });

  it('reads no templates from a piece that never kept one', () => {
    const { owner } = buildSheet();

    expect(findElementTemplateHolder(owner)).toBeNull();
    expect(readElementTemplates(owner)).toEqual([]);
  });

  it('reads the sheet of a piece without the templates kept beside it', () => {
    const { owner, root, part } = buildSheet();

    saveElementTemplate(owner, part);

    expect(sheetElementsOf(owner)).toEqual([root]);
  });

  it('keeps a copy on the piece beside the sheet, where a name looked up on the sheet cannot find it', () => {
    const { owner, root, part } = buildSheet();

    const template = saveElementTemplate(owner, part)!;

    expect(findElementTemplateHolder(owner)?.parent).toBe(owner);
    expect(readElementTemplates(owner)).toEqual([template]);
    expect(identifiersOf(template).filter((identifier) => identifiersOf(part).includes(identifier))).toEqual([]);
    expect(DataElement.findElementByReference(root, '損傷')).toBe(part.children[0]);
    expect(DataElement.findElementByReference(root, '義眼')).toBe(part);
  });

  it('gives a part saved again a template of its own rather than writing over the first', () => {
    const { owner, part } = buildSheet();

    saveElementTemplate(owner, part);
    saveElementTemplate(owner, part);

    expect(readElementTemplates(owner).map((template) => template.name)).toEqual(['義眼', '義眼 2']);
  });

  it('keeps a template after the part it was made from is gone', () => {
    const { owner, detail, part } = buildSheet();
    saveElementTemplate(owner, part);

    part.destroy();

    expect(readElementTemplates(owner).map((template) => template.name)).toEqual(['義眼']);
    expect(appendElementTemplateToSheet(detail, readElementTemplates(owner)[0])?.parent).toBe(detail);
  });

  it('names no piece as the keeper of templates for something that is itself a template', () => {
    const { owner, part } = buildSheet();

    const template = saveElementTemplate(owner, part)!;

    expect(findElementTemplateOwner(template)).toBeNull();
    expect(findElementTemplateOwner(template.children[0])).toBeNull();
  });

  it('builds a template afresh under the name it has been given, with new identifiers throughout', () => {
    const { owner, section } = buildSheet();
    const template = saveElementTemplate(owner, section.children[0])!;
    template.name = 'パーツ行';
    template.children[0].value = 0;

    const built = buildElementTemplate(template, section)!;

    expect(built.name).toBe('パーツ行');
    expect(identifiersOf(built).filter((identifier) => identifiersOf(template).includes(identifier))).toEqual([]);
    expect(built.children.map((child) => child.name)).toEqual(['損傷', '効果']);
    expect(built.children[0].fieldType).toBe(DataElementFieldType.CHECK);
    expect(String(built.children[0].value)).toBe('0');
    expect(built.children[1].value).toBe('判定+1');
  });

  it('gives a built template a name no sibling has', () => {
    const { owner, section, part } = buildSheet();
    const template = saveElementTemplate(owner, part)!;

    expect(buildElementTemplate(template, section)!.name).toBe('義眼 2');
  });

  it('adds a group to the end of the sheet as a section, its loose fields gathered into a group', () => {
    const { owner, detail, part } = buildSheet();
    const template = saveElementTemplate(owner, part)!;

    const placed = appendElementTemplateToSheet(detail, template)!;

    expect(detail.children.at(-1)).toBe(placed.element);
    expect(placed.element.fieldRole).toBe(DataElementRole.SECTION);
    expect(placed.element.children.map((child) => child.name)).toEqual(['基本']);
    expect(placed.element.children[0].fieldRole).toBe(DataElementRole.GROUP);
    expect(placed.element.children[0].children.map((child) => child.name)).toEqual(['損傷', '効果']);
  });

  it('adds a table to the sheet as a section that holds its rows as they were', () => {
    const { owner, detail } = buildSheet();
    const template = saveElementTemplate(owner, buildTable())!;

    const placed = appendElementTemplateToSheet(detail, template)!;

    expect(placed.parent).toBe(detail);
    expect(placed.element.fieldRole).toBe(DataElementRole.SECTION);
    expect(placed.element.children.map((child) => child.name)).toEqual(['義眼']);
    expect(placed.element.children[0].fieldRole).toBe(DataElementRole.GROUP);
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
