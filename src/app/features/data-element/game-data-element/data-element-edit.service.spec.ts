import { TestBed } from '@angular/core/testing';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
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

  describe('the defaults of a piece (acceptance 18)', () => {
    const originalCursor = PeerCursor.myCursor;
    let made: GameCharacter[] = [];

    function beSeat(role: PeerRole): void {
      PeerCursor.myCursor = { role, userId: 'me', identifier: 'seat' } as PeerCursor;
    }

    /** A piece whose sheet holds one item of each kind: those that may keep a default, and those that may not. */
    function piece(name: string): GameCharacter {
      const character = GameCharacter.create(name, 1, '');
      for (const child of [...character.detailDataElement!.children]) child.destroy();
      const section = DataElement.create('能力', '');
      character.detailDataElement!.appendChild(section);
      const add = (item: DataElement) => section.appendChild(item);
      add(DataElement.create('HP', 20, { type: DataElementType.NUMBER_RESOURCE, currentValue: 4 }));
      add(DataElement.create('命中', 5, { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER }));
      add(DataElement.create('転倒', 1, { type: DataElementType.CHECK, fieldType: DataElementFieldType.CHECK }));
      add(DataElement.create('筋力', '12'));
      add(DataElement.create('種族', '人間'));
      add(DataElement.create('メモ', '3', { type: DataElementType.NOTE }));
      add(DataElement.create('姿勢', '1', { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.SELECT }));
      add(DataElement.create('合計', '1', { [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CALC }));
      made.push(character);
      return character;
    }

    function partOf(body: GameCharacter, name: string): GameCharacter {
      const part = piece(name);
      part.ridingOn = body.identifier;
      part.rideSeat = 'part';
      return part;
    }

    const item = (character: GameCharacter, name: string) => character.detailDataElement!.getFirstElementByName(name)!;
    const marked = (character: GameCharacter) =>
      character
        .detailDataElement!.children[0].children.filter((element) => `${element.getAttribute('cs-default')}` !== '')
        .map((element) => element.name);

    beforeEach(() => beSeat(PeerRole.Player));

    afterEach(() => {
      PeerCursor.myCursor = originalCursor;
      for (const character of made) character.destroy();
      made = [];
    });

    it('makes what the piece and its parts hold now their defaults, on the kinds that may keep one alone', () => {
      const body = piece('竜');
      const head = partOf(body, '竜の頭');

      expect(service.countDefaultsToCapture(body)).toBe(8);
      expect(service.captureDefaults(body)).toBe(8);

      expect(marked(body)).toEqual(['HP', '命中', '転倒', '筋力']);
      expect(marked(head)).toEqual(['HP', '命中', '転倒', '筋力']);
      expect(item(body, 'HP').toAttributes()).toMatchObject({ 'cs-default': '4', 'cs-default-max': '20' });
      expect(item(body, '転倒').getAttribute('cs-default')).toBe('1');
      expect(item(body, '筋力').getAttribute('cs-default')).toBe('12');
    });

    it('takes every default off the piece and its parts', () => {
      const body = piece('竜');
      const head = partOf(body, '竜の頭');
      service.captureDefaults(body);

      expect(service.countDefaultsKept(body)).toBe(8);
      expect(service.clearDefaults(body)).toBe(8);

      expect(marked(body)).toEqual([]);
      expect(marked(head)).toEqual([]);
      expect(Object.keys(item(body, 'HP').toAttributes()).filter((key) => key.startsWith('cs-default'))).toEqual([]);
      expect(service.countDefaultsKept(body)).toBe(0);
    });

    it('puts one field back to its default', () => {
      const body = piece('騎士');
      service.captureDefaults(body);
      item(body, '命中').value = 9;
      item(body, '筋力').value = '15';

      expect(service.backToDefault(item(body, '命中'))).toBe(true);

      expect(item(body, '命中').value).toBe(5);
      expect(item(body, '筋力').value).toBe('15');
    });

    it('does none of it for a seat that only watches', () => {
      const body = piece('騎士');
      beSeat(PeerRole.Guest);

      expect(service.captureDefaults(body)).toBe(0);
      expect(marked(body)).toEqual([]);

      beSeat(PeerRole.Player);
      service.captureDefaults(body);
      item(body, '命中').value = 9;
      beSeat(PeerRole.Guest);

      expect(service.clearDefaults(body)).toBe(0);
      expect(service.backToDefault(item(body, '命中'))).toBe(false);
      expect(marked(body)).toEqual(['HP', '命中', '転倒', '筋力']);
      expect(item(body, '命中').value).toBe(9);
    });

    it('puts nothing back for a field on no piece', () => {
      const { hp } = sheet();
      hp.setAttribute('cs-default', '3');

      expect(service.backToDefault(hp)).toBe(false);
      expect(hp.value).toBe(10);
    });
  });

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

  describe('building a table', () => {
    const originalCursor = PeerCursor.myCursor;
    const column = { name: '技巧', label: '', group: '', kind: 'check', choices: '', from: null } as const;
    const shape = { columns: [column], rows: [{ name: '1', from: null }] };

    function beSeat(role: PeerRole): void {
      PeerCursor.myCursor = { role, userId: 'me', identifier: 'seat' } as PeerCursor;
    }

    beforeEach(() => beSeat(PeerRole.Player));
    afterEach(() => (PeerCursor.myCursor = originalCursor));

    it('builds an empty group as the table asked for, and adds a new one at the end of a section', () => {
      const { skills } = sheet();
      const section = skills.parent as DataElement;

      expect(service.buildTable(skills, shape)).toBe(true);
      expect(skills.viewMode).toBe(DataElementViewMode.TABLE);
      expect(skills.children.map((row) => names(row as DataElement))).toEqual([['技巧']]);

      const added = service.addTable(section, '表', shape);
      expect(added?.parent).toBe(section);
      expect(names(section)).toEqual(['アクション', '表']);
    });

    it('keeps which tables this reader edits as rows, one table apart from another', () => {
      const { basic, skills } = sheet();

      service.toggleEditAsRows(basic);
      expect([service.editsAsRows(basic), service.editsAsRows(skills)]).toEqual([true, false]);
      service.toggleEditAsRows(basic);
      expect(service.editsAsRows(basic)).toBe(false);
    });

    it('builds nothing for a seat that may not edit the table, on a field or a group of fields, or of a shape that may not be built', () => {
      const { basic, hp, skills } = sheet();

      expect(service.buildTable(skills, { ...shape, rows: [] })).toBe(false);
      expect(service.buildTable(hp, shape)).toBe(false);
      expect(service.buildTable(basic, shape)).toBe(false);
      beSeat(PeerRole.Guest);
      expect(service.buildTable(skills, shape)).toBe(false);
      expect(service.addTable(skills.parent as DataElement, '表', shape)).toBeNull();
      expect(names(basic)).toEqual(['HP', 'MP']);
      expect(skills.children).toEqual([]);
      expect([basic.viewMode, skills.viewMode]).not.toContain(DataElementViewMode.TABLE);
    });
  });

  describe('copying the path of an element', () => {
    afterEach(() => vi.restoreAllMocks());

    it('says the path was copied once the clipboard has it', async () => {
      const { hp } = sheet();
      const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

      await expect(service.copyReference(hp)).resolves.toBe(true);
      expect(write).toHaveBeenCalledWith(DataElement.formatReferencePath(hp));
    });

    it('says the path was not copied where the browser refuses the write', async () => {
      const { hp } = sheet();
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

      await expect(service.copyReference(hp)).resolves.toBe(false);
    });
  });
});
