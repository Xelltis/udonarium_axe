import { TestBed } from '@angular/core/testing';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { DataElementEditService } from '@axe/features/data-element/game-data-element/data-element-edit.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function sheet(): { detail: DataElement; basic: DataElement; hp: DataElement; mp: DataElement; skills: DataElement } {
  const detail = DataElement.create('detail', '');
  const resources = DataElement.create('リソース', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
  const basic = DataElement.create('基本', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  const hp = DataElement.create('HP', 10, { [DataElementAttribute.ROLE]: DataElementRole.FIELD });
  const mp = DataElement.create('MP', 5, { [DataElementAttribute.ROLE]: DataElementRole.FIELD });
  const skillSection = DataElement.create('スキル', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
  const skills = DataElement.create('アクション', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  detail.appendChild(resources);
  resources.appendChild(basic);
  basic.appendChild(hp);
  basic.appendChild(mp);
  detail.appendChild(skillSection);
  skillSection.appendChild(skills);
  return { detail, basic, hp, mp, skills };
}

const names = (parent: DataElement) => parent.children.map((child) => (child as DataElement).name);

describe('DataElementEditService', () => {
  let service: DataElementEditService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(DataElementEditService);
  });

  afterEach(() => TestBed.inject(SnackbarService).dismiss());

  describe('renaming', () => {
    it('takes a new name', () => {
      const { hp } = sheet();

      expect(service.rename(hp, ' 体力 ')).toBe('renamed');
      expect(hp.name).toBe('体力');
    });

    it('turns away a name a sibling has, and a blank one', () => {
      const { hp } = sheet();

      expect(service.rename(hp, 'MP')).toBe('duplicate');
      expect(service.rename(hp, '   ')).toBe('empty');
      expect(hp.name).toBe('HP');
    });

    it('says when the name is the one it already has', () => {
      expect(service.rename(sheet().hp, 'HP')).toBe('unchanged');
    });
  });

  it('changes the kind of a field, with the older data type in step', () => {
    const { hp } = sheet();

    service.setFieldType(hp, DataElementFieldType.RESOURCE);

    expect(hp.fieldType).toBe(DataElementFieldType.RESOURCE);
    expect(hp.getAttribute('type')).toBe(DataElementType.NUMBER_RESOURCE);
  });

  it('adds a field of the kind asked for at the end of a group', () => {
    const { basic } = sheet();

    const added = service.addFieldInside(basic, DataElementFieldType.CHECK)!;

    expect(basic.children.at(-1)).toBe(added);
    expect(added.fieldType).toBe(DataElementFieldType.CHECK);
  });

  it('adds a field just after another', () => {
    const { basic, hp } = sheet();

    service.addFieldAfter(hp);

    expect(names(basic)).toHaveLength(3);
    expect(names(basic)[0]).toBe('HP');
    expect(names(basic)[2]).toBe('MP');
  });

  it('copies an element just after itself under a name of its own', () => {
    const { basic, hp } = sheet();

    service.duplicate(hp);

    expect(names(basic)[0]).toBe('HP');
    expect(names(basic)[1]).not.toBe('HP');
    expect(names(basic)).toHaveLength(3);
  });

  it('steps an element among its siblings', () => {
    const { basic, mp } = sheet();

    expect(service.canMove(mp, 'moveUp')).toBe(true);
    expect(service.canMove(mp, 'moveDown')).toBe(false);
    service.move(mp, 'moveUp');

    expect(names(basic)).toEqual(['MP', 'HP']);
  });

  it('moves a field into another group', () => {
    const { basic, hp, skills } = sheet();

    expect(service.moveTargetsOf(hp).map((target) => target.element)).toEqual([skills]);
    service.moveInto(hp, skills);

    expect(names(basic)).toEqual(['MP']);
    expect(names(skills)).toEqual(['HP']);
  });

  it('shows an element in the popup and stops again', () => {
    const { hp } = sheet();

    service.togglePopup(hp);
    expect(service.isPopup(hp)).toBe(true);

    service.togglePopup(hp);
    expect(service.isPopup(hp)).toBe(false);
  });

  it('switches a group between a table and rows, and leaves a field alone', () => {
    const { basic, hp } = sheet();

    service.toggleTableView(basic);
    expect(basic.viewMode).toBe(DataElementViewMode.TABLE);
    service.toggleTableView(basic);
    expect(basic.viewMode).toBe(DataElementViewMode.NORMAL);

    service.toggleTableView(hp);
    expect(hp.viewMode).toBe(DataElementViewMode.NORMAL);
  });

  it('deletes an element with a notice that can put it back', () => {
    const { basic, hp } = sheet();

    service.delete(hp);
    expect(names(basic)).toEqual(['MP']);

    TestBed.inject(SnackbarService).runAction();
    expect(names(basic)).toEqual(['HP', 'MP']);
  });
});
