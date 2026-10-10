import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectNode } from '@axe/core/sync/object-node';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { IN_DATA_ELEMENT_SHEET } from '@axe/features/data-element/game-data-element/data-element-sheet-host';
import {
  GameDataElementComponent,
  STEP_COMMIT_MS,
} from '@axe/features/data-element/game-data-element/game-data-element.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function createDragEvent(clientY: number = 15): DragEvent {
  return {
    clientY,
    currentTarget: {
      getBoundingClientRect: () => ({ top: 0, height: 30 }),
    },
    dataTransfer: {
      dropEffect: 'move',
      effectAllowed: 'move',
      getData: vi.fn(() => ''),
      setData: vi.fn(),
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as DragEvent;
}

describe('GameDataElementComponent', () => {
  let component: GameDataElementComponent;
  let fixture: ComponentFixture<GameDataElementComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameDataElementComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GameDataElementComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('a long text being edited', () => {
    function edit(fieldType: string): HTMLElement {
      const field = DataElement.create('効果', '判定に成功した', {
        [DataElementAttribute.ROLE]: DataElementRole.FIELD,
        [DataElementAttribute.FIELD_TYPE]: fieldType,
      });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', field);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('gets ten lines of its own under the row, which it can be stretched from', () => {
      const host = edit(DataElementFieldType.LONG_TEXT);
      const content = host.querySelector('.elm-value-content')!;
      const textarea = host.querySelector('textarea[name="data-value"]')!;

      expect(content.classList.contains('gde-editing')).toBe(false);
      expect(content.classList).toContain('row-start-2');
      expect(textarea.classList).toContain('min-h-[calc(10lh+0.5rem+2px)]');
      expect(textarea.classList).toContain('resize-y');
      expect(textarea.classList).toContain('whitespace-pre-wrap');
    });

    it('leaves the other kinds of field on the one line beside the buttons', () => {
      const content = edit(DataElementFieldType.TEXT).querySelector('.elm-value-content')!;

      expect(content.classList.contains('gde-editing')).toBe(true);
      expect(content.classList.contains('row-start-2')).toBe(false);
    });

    it('is drawn as before outside editing', () => {
      const field = DataElement.create('効果', '判定に成功した', {
        [DataElementAttribute.ROLE]: DataElementRole.FIELD,
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.LONG_TEXT,
      });
      fixture.componentRef.setInput('gameDataElement', field);
      fixture.detectChanges();
      const textarea = (fixture.nativeElement as HTMLElement).querySelector('textarea[name="data-value"]')!;

      expect(textarea.classList).toContain('resize-none');
      expect(textarea.classList.contains('resize-y')).toBe(false);
    });
  });

  describe('the icon picker', () => {
    it('lifts the heading it opens from above the headings of the children', () => {
      const group = DataElement.create('頭', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
      const row = DataElement.create('義眼', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
      row.appendChild(
        DataElement.create('損傷', 0, {
          [DataElementAttribute.ROLE]: DataElementRole.FIELD,
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK,
        })
      );
      group.appendChild(row);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', group);
      fixture.detectChanges();

      const heading = (fixture.nativeElement as HTMLElement).querySelector('.elm-name-input')!.closest('.z-1')!;
      expect(heading.classList.contains('z-100!')).toBe(false);

      heading.querySelector<HTMLButtonElement>('.relative.shrink-0 > button')!.click();
      fixture.detectChanges();

      expect(heading.classList.contains('z-100!')).toBe(true);
    });
  });

  describe('copies and templates', () => {
    function buildSheet(): { detail: DataElement; section: DataElement; part: DataElement } {
      const owner = new ObjectNode();
      owner.initialize();
      const root = DataElement.create('character', '');
      owner.appendChild(root);
      const detail = DataElement.create('detail', '');
      const section = DataElement.create('パーツ', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
      const part = DataElement.create('義眼', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
      part.appendChild(
        DataElement.create('損傷', 0, {
          [DataElementAttribute.ROLE]: DataElementRole.FIELD,
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK,
        })
      );
      const shield = DataElement.create('盾', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
      root.appendChild(detail);
      detail.appendChild(section);
      section.appendChild(part);
      section.appendChild(shield);
      return { detail, section, part };
    }

    it('puts a copy of a group straight after it, under a name of its own', () => {
      const { section, part } = buildSheet();
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', part);
      fixture.detectChanges();

      component.duplicateElement();

      expect(section.children.map((child) => child.name)).toEqual(['義眼', '義眼 2', '盾']);
      expect(section.children[1].children.map((child) => child.name)).toEqual(['損傷']);
    });

    it('offers a saved group where it fits and builds a fresh one there', () => {
      const { section, part } = buildSheet();
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', part);
      fixture.detectChanges();
      component.saveAsTemplate();

      fixture.componentRef.setInput('gameDataElement', section);
      fixture.detectChanges();
      expect(component.elementTemplates().map((template) => template.name)).toEqual(['義眼']);

      component.insertTemplate(component.elementTemplates()[0]);

      expect(section.children.map((child) => child.name)).toEqual(['義眼', '盾', '義眼 2']);
      expect(section.children[2].identifier).not.toBe(part.identifier);
    });

    it('offers every template, and sets one that will not fit inside down just after the container', () => {
      const { section } = buildSheet();
      const table = DataElement.create('頭', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
      const row = DataElement.create('義眼', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
      row.appendChild(DataElement.create('損傷', 0, { [DataElementAttribute.ROLE]: DataElementRole.FIELD }));
      table.appendChild(row);
      section.insertBefore(table, section.children[1]);
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', table);
      fixture.detectChanges();
      component.saveAsTemplate();

      expect(component.elementTemplates().map((template) => template.name)).toEqual(['頭']);
      component.insertTemplate(component.elementTemplates()[0]);

      expect(section.children.map((child) => child.name)).toEqual(['義眼', '頭', '頭 2', '盾']);
    });

    it('lets a section be kept as a template as well as a group', () => {
      const { section } = buildSheet();
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', section);
      fixture.detectChanges();

      expect(component.canSaveAsTemplate()).toBe(true);
      component.saveAsTemplate();

      expect(component.elementTemplates().map((template) => template.name)).toEqual(['パーツ']);
    });

    it('offers neither saving nor adding templates inside a template itself', () => {
      const { part } = buildSheet();
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', part);
      fixture.detectChanges();
      component.saveAsTemplate();
      const template = component.elementTemplates()[0];

      fixture.componentRef.setInput('gameDataElement', template);
      fixture.detectChanges();

      expect(component.canSaveAsTemplate()).toBe(false);
      expect(component.elementTemplates()).toEqual([]);
    });
  });

  describe('moving the structure from the menu held on its handle', () => {
    function openMenuOn(element: DataElement, isEdit = true) {
      vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(true);
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
      fixture.componentRef.setInput('isEdit', isEdit);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();
      component.onStructureHandleContextMenu(new MouseEvent('contextmenu', { cancelable: true }));
      return open;
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('moves an item up past the one before it, for a screen that cannot drag it', () => {
      const t = TestBed.inject(TRANSLATE_FN);
      const parent = DataElement.create('parent', '');
      for (const name of ['first', 'second', 'third']) parent.appendChild(DataElement.create(name, ''));

      const open = openMenuOn(parent.children[2] as DataElement);
      const actions = open.mock.calls[0][1] as ContextMenuAction[];
      actions.find((action) => action.name === t('common.reorder.up'))?.action?.();

      expect(parent.children.map((child) => child.name)).toEqual(['first', 'third', 'second']);
    });

    it('offers nothing while the sheet is not being edited', () => {
      const parent = DataElement.create('parent', '');
      for (const name of ['first', 'second']) parent.appendChild(DataElement.create(name, ''));

      const open = openMenuOn(parent.children[1] as DataElement, false);

      expect(open).not.toHaveBeenCalled();
    });
  });

  describe('dragging the structure about', () => {
    it('moves an item back within its parent', () => {
      const parent = DataElement.create('parent', '');
      const dragged = DataElement.create('dragged', '');
      const target = DataElement.create('target', '');
      const next = DataElement.create('next', '');
      parent.appendChild(dragged);
      parent.appendChild(target);
      parent.appendChild(next);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', dragged);
      fixture.detectChanges();
      component.onStructureDragStart(createDragEvent());

      fixture.componentRef.setInput('gameDataElement', target);
      fixture.detectChanges();
      const dropEvent = createDragEvent(29);
      component.onStructureDragOver(dropEvent);
      component.onStructureDrop(dropEvent);

      expect(parent.children.map((child) => child.name)).toEqual(['target', 'dragged', 'next']);
      expect(dropEvent.preventDefault).toHaveBeenCalled();
      expect(dropEvent.stopPropagation).toHaveBeenCalled();
    });

    it('refuses to move a field directly under a section', () => {
      const detail = DataElement.create('detail', '');
      const sourceSection = DataElement.create('source', '', { role: DataElementRole.SECTION });
      const targetSection = DataElement.create('target', '', { role: DataElementRole.SECTION });
      const field = DataElement.create('field', 'value');
      detail.appendChild(sourceSection);
      detail.appendChild(targetSection);
      sourceSection.appendChild(field);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', field);
      fixture.detectChanges();
      component.onStructureDragStart(createDragEvent());

      fixture.componentRef.setInput('depth', 0);
      fixture.componentRef.setInput('gameDataElement', targetSection);
      fixture.detectChanges();
      const dropEvent = createDragEvent(15);
      component.onStructureDragOver(dropEvent);
      component.onStructureDrop(dropEvent);

      expect(sourceSection.children).toEqual([field]);
      expect(targetSection.children).toEqual([]);
      expect(field.parent).toBe(sourceSection);
      expect(field.fieldRole).toBe(DataElementRole.FIELD);
    });

    it('moves a group there', () => {
      const detail = DataElement.create('detail', '');
      const sourceSection = DataElement.create('source', '', { role: DataElementRole.SECTION });
      const targetSection = DataElement.create('target', '', { role: DataElementRole.SECTION });
      const group = DataElement.create('group', '', { role: DataElementRole.GROUP });
      group.appendChild(DataElement.create('field', 'value', { role: DataElementRole.FIELD }));
      detail.appendChild(sourceSection);
      detail.appendChild(targetSection);
      sourceSection.appendChild(group);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('depth', 1);
      fixture.componentRef.setInput('gameDataElement', group);
      fixture.detectChanges();
      component.onStructureDragStart(createDragEvent());

      fixture.componentRef.setInput('depth', 0);
      fixture.componentRef.setInput('gameDataElement', targetSection);
      fixture.detectChanges();
      const dropEvent = createDragEvent(15);
      component.onStructureDragOver(dropEvent);
      component.onStructureDrop(dropEvent);

      expect(sourceSection.children).toEqual([]);
      expect(targetSection.children).toContain(group);
      expect(group.parent).toBe(targetSection);
      expect(group.fieldRole).toBe(DataElementRole.GROUP);
    });

    it('moves an item into the group before it', () => {
      const section = DataElement.create('section', '', { role: DataElementRole.SECTION });
      const group = DataElement.create('group', '', { role: DataElementRole.GROUP });
      const field = DataElement.create('field', 'value');
      section.appendChild(group);
      section.appendChild(field);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('depth', 1);
      fixture.componentRef.setInput('gameDataElement', field);
      fixture.detectChanges();

      component.onStructureDragStart(createDragEvent());

      fixture.componentRef.setInput('gameDataElement', group);
      fixture.detectChanges();
      const dropEvent = createDragEvent(15);
      component.onStructureDragOver(dropEvent);
      component.onStructureDrop(dropEvent);

      expect(section.children).toEqual([group]);
      expect(group.children).toContain(field);
      expect(field.parent).toBe(group);
      expect(field.fieldRole).toBe(DataElementRole.FIELD);
    });

    it('moves a group into another', () => {
      const section = DataElement.create('section', '', { role: DataElementRole.SECTION });
      const targetGroup = DataElement.create('target', '', { role: DataElementRole.GROUP });
      const draggedGroup = DataElement.create('dragged', '', { role: DataElementRole.GROUP });
      draggedGroup.appendChild(DataElement.create('field', 'value', { role: DataElementRole.FIELD }));
      section.appendChild(draggedGroup);
      section.appendChild(targetGroup);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('depth', 1);
      fixture.componentRef.setInput('gameDataElement', draggedGroup);
      fixture.detectChanges();
      component.onStructureDragStart(createDragEvent());

      fixture.componentRef.setInput('gameDataElement', targetGroup);
      fixture.detectChanges();
      const dropEvent = createDragEvent(15);
      component.onStructureDragOver(dropEvent);
      component.onStructureDrop(dropEvent);

      expect(section.children).toEqual([targetGroup]);
      expect(targetGroup.children).toContain(draggedGroup);
      expect(draggedGroup.parent).toBe(targetGroup);
      expect(draggedGroup.fieldRole).toBe(DataElementRole.GROUP);
    });

    it('refuses to drop a field straight behind its group', () => {
      const section = DataElement.create('section', '', { role: DataElementRole.SECTION });
      const group = DataElement.create('group', '', { role: DataElementRole.GROUP });
      const field = DataElement.create('field', 'value');
      section.appendChild(group);
      group.appendChild(field);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('depth', 2);
      fixture.componentRef.setInput('gameDataElement', field);
      fixture.detectChanges();

      component.onStructureDragStart(createDragEvent());

      fixture.componentRef.setInput('depth', 1);
      fixture.componentRef.setInput('gameDataElement', group);
      fixture.detectChanges();
      const dropEvent = createDragEvent(29);
      component.onStructureDragOver(dropEvent);
      component.onStructureDrop(dropEvent);

      expect(section.children).toEqual([group]);
      expect(group.children).toEqual([field]);
      expect(field.parent).toBe(group);
      expect(field.fieldRole).toBe(DataElementRole.FIELD);
    });

    it('adds a row right after the one it was asked from', () => {
      const group = DataElement.create('group', '', { role: DataElementRole.GROUP });
      const hp = DataElement.create('HP', '');
      const mp = DataElement.create('MP', '');
      group.appendChild(hp);
      group.appendChild(mp);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', hp);
      fixture.detectChanges();

      component.addSiblingElement();

      expect(group.children.map((child) => child.name)).toEqual(['HP', 'タグ', 'MP']);
      expect((group.children[1] as DataElement).fieldRole).toBe(DataElementRole.FIELD);
    });

    it('numbers a new row so its tag is its own', () => {
      const detail = DataElement.create('detail', '');
      const section = DataElement.create('section', '', { role: DataElementRole.SECTION });
      const group = DataElement.create('group', '', { role: DataElementRole.GROUP });
      const existing = DataElement.create('タグ', '');
      detail.appendChild(section);
      section.appendChild(group);
      group.appendChild(existing);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', group);
      fixture.detectChanges();

      component.addElement();

      expect(group.children.map((child) => child.name)).toEqual(['タグ', 'タグ 2']);
    });

    it('refuses to rename a tag onto one already taken', () => {
      vi.useFakeTimers();
      try {
        const detail = DataElement.create('detail', '');
        const section = DataElement.create('section', '', { role: DataElementRole.SECTION });
        const group = DataElement.create('group', '', { role: DataElementRole.GROUP });
        const hp = DataElement.create('HP', '');
        const mp = DataElement.create('MP', '');
        detail.appendChild(section);
        section.appendChild(group);
        group.appendChild(hp);
        group.appendChild(mp);

        fixture.componentRef.setInput('isEdit', true);
        fixture.componentRef.setInput('gameDataElement', hp);
        fixture.detectChanges();

        component.name = 'MP';
        expect(component.isDuplicateName()).toBe(true);

        vi.advanceTimersByTime(70);

        expect(hp.name).toBe('HP');
        expect(component.name).toBe('HP');
      } finally {
        vi.useRealTimers();
      }
    });

    it('allows the same tag in another group', () => {
      vi.useFakeTimers();
      try {
        const detail = DataElement.create('detail', '');
        const section = DataElement.create('section', '', { role: DataElementRole.SECTION });
        const groupA = DataElement.create('groupA', '', { role: DataElementRole.GROUP });
        const groupB = DataElement.create('groupB', '', { role: DataElementRole.GROUP });
        const nameA = DataElement.create('名称', 'A');
        const nameB = DataElement.create('名前', 'B');
        detail.appendChild(section);
        section.appendChild(groupA);
        section.appendChild(groupB);
        groupA.appendChild(nameA);
        groupB.appendChild(nameB);

        fixture.componentRef.setInput('isEdit', true);
        fixture.componentRef.setInput('gameDataElement', nameB);
        fixture.detectChanges();

        component.name = '名称';
        expect(component.isDuplicateName()).toBe(false);

        vi.advanceTimersByTime(70);

        expect(nameB.name).toBe('名称');
      } finally {
        vi.useRealTimers();
      }
    });

    it('copies the tag as a path', () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
      try {
        const detail = DataElement.create('detail', '');
        const section = DataElement.create('戦闘特技', '', { role: DataElementRole.SECTION });
        const group = DataElement.create('最終能力', '', { role: DataElementRole.GROUP });
        const field = DataElement.create('コスト', 'なし');
        detail.appendChild(section);
        section.appendChild(group);
        group.appendChild(field);

        fixture.componentRef.setInput('isEdit', true);
        fixture.componentRef.setInput('gameDataElement', field);
        fixture.detectChanges();

        component.copyReferencePath();

        expect(writeText).toHaveBeenCalledWith('戦闘特技/最終能力/コスト');
      } finally {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: originalClipboard,
        });
      }
    });

    it('adds no field directly under a section', () => {
      const section = DataElement.create('section', '', { role: DataElementRole.SECTION });

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('depth', 0);
      fixture.componentRef.setInput('gameDataElement', section);
      fixture.detectChanges();

      component.addElement();

      expect(section.children).toEqual([]);
      expect(component.canAddChildFieldElement()).toBe(false);
      expect(component.canAddChildGroupElement()).toBe(true);
    });

    it('adds a group from a heading', () => {
      const section = DataElement.create('section', '', { role: DataElementRole.SECTION });

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', section);
      fixture.detectChanges();

      component.addGroupElement();

      const group = section.children[0] as DataElement;
      expect(group.name).toBe('グループ');
      expect(group.fieldRole).toBe(DataElementRole.GROUP);
      expect(group.children).toHaveLength(1);
      expect((group.children[0] as DataElement).fieldRole).toBe(DataElementRole.FIELD);
    });

    it('adds one inside the topmost heading', () => {
      const detail = DataElement.create('detail', '');
      const section = DataElement.create('section', '', { role: DataElementRole.SECTION });
      const next = DataElement.create('next', '', { role: DataElementRole.SECTION });
      const field = DataElement.create('field', 'value', { role: DataElementRole.FIELD });
      detail.appendChild(section);
      detail.appendChild(next);
      section.appendChild(field);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('depth', 0);
      fixture.componentRef.setInput('gameDataElement', section);
      fixture.detectChanges();

      component.addGroupElement();

      expect(detail.children.map((child) => child.name)).toEqual(['section', 'next']);
      expect(section.children.map((child) => child.name)).toEqual(['field', 'グループ']);
      expect((section.children[1] as DataElement).fieldRole).toBe(DataElementRole.GROUP);
      expect((section.children[1] as DataElement).children[0].fieldRole).toBe(DataElementRole.FIELD);
    });

    it('adds a group inside a group', () => {
      const section = DataElement.create('section', '', { role: DataElementRole.SECTION });
      const group = DataElement.create('group', '', { role: DataElementRole.GROUP });
      const next = DataElement.create('next', '', { role: DataElementRole.GROUP });
      section.appendChild(group);
      section.appendChild(next);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', group);
      fixture.detectChanges();

      component.addGroupElement();

      expect(section.children.map((child) => child.name)).toEqual(['group', 'next']);
      expect(group.children.map((child) => child.name)).toEqual(['グループ']);
      expect((group.children[0] as DataElement).fieldRole).toBe(DataElementRole.GROUP);
      expect((group.children[0] as DataElement).children[0].fieldRole).toBe(DataElementRole.FIELD);
    });

    it('adds none inside the third', () => {
      const section = DataElement.create('section', '', { role: DataElementRole.SECTION });
      const group = DataElement.create('group', '', { role: DataElementRole.GROUP });
      const nestedGroup = DataElement.create('nested', '', { role: DataElementRole.GROUP });
      section.appendChild(group);
      group.appendChild(nestedGroup);

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('depth', 2);
      fixture.componentRef.setInput('gameDataElement', nestedGroup);
      fixture.detectChanges();

      component.addGroupElement();

      expect(nestedGroup.children).toEqual([]);
      expect(component.canAddChildGroupElement()).toBe(false);
      expect(component.canAddChildFieldElement()).toBe(true);
    });

    it('shows a container as a table', () => {
      const group = DataElement.create('group', '', { role: DataElementRole.GROUP });

      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', group);
      fixture.detectChanges();

      component.toggleTableViewMode();

      expect(group.viewMode).toBe(DataElementViewMode.TABLE);
      expect(component.isTableViewMode()).toBe(true);

      component.toggleTableViewMode();

      expect(group.viewMode).toBe(DataElementViewMode.NORMAL);
    });

    it('lays the child groups out as rows while reading, and not while editing', () => {
      const section = DataElement.create('戦闘特技', '', {
        role: DataElementRole.SECTION,
        viewMode: DataElementViewMode.TABLE,
      });
      const skillA = DataElement.create('最終能力', '', { role: DataElementRole.GROUP });
      const skillB = DataElement.create('Lv1', '', { role: DataElementRole.GROUP });
      skillA.appendChild(DataElement.create('名称', 'オーバークリエイト'));
      skillA.appendChild(DataElement.create('コスト', 'なし'));
      skillB.appendChild(DataElement.create('名称', 'ストラグチャアタック'));
      skillB.appendChild(DataElement.create('コスト', '3'));
      section.appendChild(skillA);
      section.appendChild(skillB);

      fixture.componentRef.setInput('isEdit', false);
      fixture.componentRef.setInput('gameDataElement', section);
      fixture.detectChanges();

      const table = fixture.nativeElement.querySelector('.elm-view-table') as HTMLTableElement | null;
      expect(table).toBeTruthy();
      expect(table?.textContent).toContain('名称');
      expect(table?.textContent).toContain('コスト');
      expect(table?.textContent).toContain('最終能力');
      expect(table?.textContent).toContain('オーバークリエイト');

      fixture.componentRef.setInput('isEdit', true);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.elm-view-table')).toBeNull();
    });

    it('takes the column names and the gaps from the settings', () => {
      const section = DataElement.create('技能表', '', {
        role: DataElementRole.SECTION,
        viewMode: DataElementViewMode.TABLE,
      });
      const gapRow = DataElement.create('ギャップ', '', { role: DataElementRole.GROUP });
      gapRow.appendChild(
        DataElement.create('技巧', '', {
          role: DataElementRole.FIELD,
          fieldType: DataElementFieldType.TEXT,
          columnLabel: '技巧',
        })
      );
      gapRow.appendChild(
        DataElement.create('ギャップ1', 0, {
          role: DataElementRole.FIELD,
          fieldType: DataElementFieldType.CHECK,
          cellKind: 'gap',
          cellText: '技巧-身体',
          columnLabel: 'G',
        })
      );
      const gapCell = gapRow.getFirstElementByName('ギャップ1')!;
      gapRow.appendChild(
        DataElement.create('身体', '', {
          role: DataElementRole.FIELD,
          fieldType: DataElementFieldType.TEXT,
          columnLabel: '身体',
        })
      );
      const row2 = DataElement.create('2', '', { role: DataElementRole.GROUP });
      row2.appendChild(
        DataElement.create('技巧', 1, {
          role: DataElementRole.FIELD,
          fieldType: DataElementFieldType.CHECK,
          cellText: '解錠',
          columnLabel: '技巧',
        })
      );
      row2.appendChild(
        DataElement.create('身体', 0, {
          role: DataElementRole.FIELD,
          fieldType: DataElementFieldType.CHECK,
          cellText: '跳躍',
          columnLabel: '身体',
        })
      );
      section.appendChild(gapRow);
      section.appendChild(row2);

      fixture.componentRef.setInput('isEdit', false);
      fixture.componentRef.setInput('gameDataElement', section);
      fixture.detectChanges();

      const table = fixture.nativeElement.querySelector('.elm-view-table') as HTMLTableElement | null;
      const gapColumns = fixture.nativeElement.querySelectorAll('.elm-view-table-column--gap');
      const gapHeader = fixture.nativeElement.querySelector('th.elm-view-table-column--gap') as HTMLElement | null;
      expect(gapHeader?.querySelector('input[type="checkbox"]')).toBeTruthy();
      expect(table?.textContent).not.toContain('ギャップ');
      expect(table?.textContent).not.toContain('技巧-身体');
      expect(table?.textContent).toContain('解錠');
      expect(gapColumns.length).toBeGreaterThan(0);

      gapHeader?.click();
      fixture.detectChanges();

      expect(gapCell.value).toBe(1);
      expect(fixture.nativeElement.querySelector('.elm-view-table-column--gap-active')).toBeTruthy();
    });

    it('takes the column groups, the row headings and the chosen cells', () => {
      const section = DataElement.create('技能表タイプ2', '', {
        role: DataElementRole.SECTION,
        viewMode: DataElementViewMode.TABLE,
        rowHeaderLabel: '技能',
      });
      const row = DataElement.create('行1', '', { role: DataElementRole.GROUP });
      row.appendChild(
        DataElement.create('肉体技能名', '肉体攻撃', {
          role: DataElementRole.FIELD,
          fieldType: DataElementFieldType.TEXT,
          columnLabel: '技能',
          columnGroup: '肉体技能',
        })
      );
      const rankCell = DataElement.create('肉体技能習熟度', '初級', {
        role: DataElementRole.FIELD,
        fieldType: DataElementFieldType.SELECT,
        choices: '初級,中級,上級',
        columnLabel: '習熟度',
        columnGroup: '肉体技能',
      });
      row.appendChild(rankCell);
      section.appendChild(row);

      fixture.componentRef.setInput('isEdit', false);
      fixture.componentRef.setInput('gameDataElement', section);
      fixture.detectChanges();

      const groupHeader = fixture.nativeElement.querySelector('.elm-view-table-column-group') as HTMLElement | null;
      const rowHeader = fixture.nativeElement.querySelector('.elm-view-table-row-heading--group') as HTMLElement | null;
      const select = fixture.nativeElement.querySelector('.elm-view-table-select') as HTMLSelectElement | null;
      expect(groupHeader?.textContent?.trim()).toBe('肉体技能');
      expect(groupHeader?.getAttribute('colspan')).toBe('2');
      expect(rowHeader?.textContent?.trim()).toBe('技能');
      expect(fixture.nativeElement.textContent).toContain('肉体攻撃');
      expect(select?.value).toBe('初級');

      select!.value = '上級';
      select!.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(rankCell.value).toBe('上級');
    });

    it('shows an image cell as a picture', () => {
      const image = ImageStorage.instance.add('table-image.png');
      try {
        const section = DataElement.create('画像一覧', '', {
          role: DataElementRole.SECTION,
          viewMode: DataElementViewMode.TABLE,
        });
        const row = DataElement.create('行1', '', { role: DataElementRole.GROUP });
        row.appendChild(
          DataElement.create('立ち絵', image.identifier, {
            fieldType: DataElementFieldType.IMAGE,
            role: DataElementRole.FIELD,
          })
        );
        section.appendChild(row);

        fixture.componentRef.setInput('isEdit', false);
        fixture.componentRef.setInput('gameDataElement', section);
        fixture.detectChanges();

        const table = fixture.nativeElement.querySelector('.elm-view-table') as HTMLTableElement | null;
        const imageElement = fixture.nativeElement.querySelector('.elm-view-table-image') as HTMLImageElement | null;
        expect(table?.textContent).not.toContain('画像');
        expect(imageElement).toBeTruthy();
        expect(imageElement?.getAttribute('src')).toBe('table-image.png');
        expect(imageElement?.getAttribute('alt')).toBe('立ち絵');
      } finally {
        ImageStorage.instance.delete(image.identifier);
      }
    });

    it('keeps the contents in the ordinary layout when a row holds nothing but groups', () => {
      const section = DataElement.create('戦闘特技', '', {
        role: DataElementRole.SECTION,
        viewMode: DataElementViewMode.TABLE,
      });
      const skillList = DataElement.create('スキル一覧', '', { role: DataElementRole.GROUP });
      const nestedSkill = DataElement.create('最終能力', '', { role: DataElementRole.GROUP });
      nestedSkill.appendChild(DataElement.create('名称', 'オーバークリエイト'));
      skillList.appendChild(nestedSkill);
      section.appendChild(skillList);

      fixture.componentRef.setInput('isEdit', false);
      fixture.componentRef.setInput('gameDataElement', section);
      fixture.detectChanges();

      expect(component.shouldRenderTableView()).toBe(false);
      expect(fixture.nativeElement.querySelector('.elm-view-table')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('スキル一覧');
      expect(fixture.nativeElement.textContent).toContain('最終能力');
      expect(fixture.nativeElement.textContent).toContain('名称');
      expect(fixture.nativeElement.textContent).toContain('オーバークリエイト');
    });
  });

  describe('the field types', () => {
    it('keeps the compatibility type in step with the field type', () => {
      const element = DataElement.create('HP', 10);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      component.setElementFieldType(DataElementFieldType.RESOURCE);

      expect(element.fieldType).toBe(DataElementFieldType.RESOURCE);
      expect(element.type).toBe(DataElementType.NUMBER_RESOURCE);
    });

    it('shows a resource as a number rather than a slider', () => {
      const element = DataElement.create('HP', 200, {
        currentValue: 120,
        fieldType: DataElementFieldType.RESOURCE,
        type: DataElementType.NUMBER_RESOURCE,
      });
      fixture.componentRef.setInput('isEdit', false);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.resource-range')).toBeNull();
      expect(fixture.nativeElement.querySelector('input[type="range"]')).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.resource-number')).toHaveLength(2);
    });

    it('caps the current value at the maximum on show', () => {
      const element = DataElement.create('HP', 100, {
        currentValue: 0,
        fieldType: DataElementFieldType.RESOURCE,
        type: DataElementType.NUMBER_RESOURCE,
        min: '0',
        max: '999',
      });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      expect(component.currentValueMinAttr()).toBe('0');
      expect(component.currentValueMaxAttr()).toBe('100');
    });

    it('sets no cap while the value is empty', () => {
      const element = DataElement.create('HP', '', {
        currentValue: 0,
        fieldType: DataElementFieldType.RESOURCE,
        type: DataElementType.NUMBER_RESOURCE,
        min: '0',
        max: '50',
      });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      expect(component.currentValueMaxAttr()).toBe('');
    });

    it('clamps a value past that maximum when the field loses focus', () => {
      const element = DataElement.create('HP', 100, {
        currentValue: 50,
        fieldType: DataElementFieldType.RESOURCE,
        type: DataElementType.NUMBER_RESOURCE,
      });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      component.currentValue = 200;
      component.commitCurrentValueBounds();

      expect(component.currentValue).toBe(100);
    });

    it('keeps the original maximum apart from the current one', () => {
      const element = DataElement.create('HP', 200, {
        currentValue: 50,
        fieldType: DataElementFieldType.RESOURCE,
        type: DataElementType.NUMBER_RESOURCE,
        max: '300',
      });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      // the value holds the current maximum
      expect(component.value).toBe(200);
      // the text holds the original, independently of it
      expect(component.maxText).toBe('300');
    });

    it('clamps the current maximum between the floor and the original', () => {
      const element = DataElement.create('HP', 100, {
        currentValue: 50,
        fieldType: DataElementFieldType.RESOURCE,
        type: DataElementType.NUMBER_RESOURCE,
        min: '0',
        max: '300',
      });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      // clamped at the original when it goes above
      component.value = 500;
      component.commitValueBounds();
      expect(component.value).toBe(300);

      // clamped at the floor when it goes below
      component.value = -10;
      component.commitValueBounds();
      expect(component.value).toBe(0);
    });

    it('keeps an unsaved edit through a change to another attribute', async () => {
      const element = DataElement.create('HP', 0, {
        currentValue: 0,
        fieldType: DataElementFieldType.RESOURCE,
        type: DataElementType.NUMBER_RESOURCE,
      });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      component.value = 50;
      expect(component.value).toBe(50);

      element.setAttribute(DataElementAttribute.MIN, '0');
      TestBed.inject(ObjectChangeService).notifyChanged(element.identifier);
      fixture.detectChanges();
      await Promise.resolve();
      await new Promise((resolve) => queueMicrotask(() => resolve(null)));

      expect(component.value).toBe(50);
    });

    it('clamps a value outside the bounds when the field loses focus', () => {
      const element = DataElement.create('Strength', 5, {
        fieldType: DataElementFieldType.NUMBER,
        min: '0',
        max: '20',
      });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      component.value = 99;
      component.commitValueBounds();
      expect(component.value).toBe(20);

      component.value = -5;
      component.commitValueBounds();
      expect(component.value).toBe(0);
    });

    it('reads the options apart by their lines and commas', () => {
      const element = DataElement.create('種族', '', { choices: '人間, エルフ\nドワーフ' });
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      expect(component.getSelectOptions()).toEqual(['人間', 'エルフ', 'ドワーフ']);
    });

    it('offers the advanced settings to a cell of a table', () => {
      const table = DataElement.create('技能表', '', {
        role: DataElementRole.SECTION,
        viewMode: DataElementViewMode.TABLE,
      });
      const row = DataElement.create('ギャップ', '', { role: DataElementRole.GROUP });
      const cell = DataElement.create('ギャップ1', 0, {
        role: DataElementRole.FIELD,
        fieldType: DataElementFieldType.CHECK,
      });
      table.appendChild(row);
      row.appendChild(cell);
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', cell);
      fixture.detectChanges();

      expect(component.shouldShowFieldOptions()).toBe(true);
    });

    it('offers the table settings to a table being edited', () => {
      const table = DataElement.create('技能表タイプ2', '', {
        role: DataElementRole.SECTION,
        viewMode: DataElementViewMode.TABLE,
      });
      table.appendChild(DataElement.create('行1', '', { role: DataElementRole.GROUP }));
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', table);
      fixture.detectChanges();

      expect(component.shouldShowContainerOptions()).toBe(true);
    });

    it('keeps the formula of a calculated field', () => {
      const element = DataElement.create('合計', '', { fieldType: DataElementFieldType.CALC });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      component.formulaText = 'HP + MP';

      expect(element.getAttribute(DataElementAttribute.FORMULA)).toBe('HP + MP');
      expect(component.formulaText).toBe('HP + MP');
    });

    it('works its result out from its siblings', () => {
      const root = DataElement.create('detail', '');
      const hp = DataElement.create('HP', '30');
      const mp = DataElement.create('MP', '20');
      const calc = DataElement.create('合計', '', { fieldType: DataElementFieldType.CALC, formula: 'HP + MP' });
      root.appendChild(hp);
      root.appendChild(mp);
      root.appendChild(calc);

      fixture.componentRef.setInput('gameDataElement', calc);
      fixture.detectChanges();

      expect(component.calcResult()).toBe('50');
    });

    it('treats a repeated short name as ambiguous and works from the full path', () => {
      const root = DataElement.create('detail', '');
      const section = DataElement.create('戦闘特技', '');
      const skillA = DataElement.create('最終能力', '');
      const skillB = DataElement.create('Lv1', '');
      const costA = DataElement.create('コスト', '3');
      const costB = DataElement.create('コスト', '5');
      const calc = DataElement.create('合計', '', {
        fieldType: DataElementFieldType.CALC,
        formula: '[戦闘特技/最終能力/コスト] + [戦闘特技/Lv1/コスト]',
      });
      root.appendChild(section);
      section.appendChild(skillA);
      section.appendChild(skillB);
      section.appendChild(calc);
      skillA.appendChild(costA);
      skillB.appendChild(costB);

      fixture.componentRef.setInput('gameDataElement', calc);
      fixture.detectChanges();

      expect(component.calcResult()).toBe('8');

      component.formulaText = 'コスト + 1';

      expect(component.calcResult()).toBe('?');
    });

    it('works itself out again when what it reads changes', () => {
      const root = DataElement.create('detail', '');
      const hp = DataElement.create('HP', '30');
      const calc = DataElement.create('合計', '', { fieldType: DataElementFieldType.CALC, formula: 'HP + 1' });
      root.appendChild(hp);
      root.appendChild(calc);

      fixture.componentRef.setInput('gameDataElement', calc);
      fixture.detectChanges();
      expect(component.calcResult()).toBe('31');

      hp.value = '40';
      TestBed.inject(ObjectChangeService).notifyChanged(hp.identifier);

      expect(component.calcResult()).toBe('41');
    });

    it('reads a resource at what it is now rather than at the top of its bar', () => {
      const root = DataElement.create('detail', '');
      const hp = DataElement.create('HP', 20, { type: 'numberResource', currentValue: 6 });
      const calc = DataElement.create('残り', '', { fieldType: DataElementFieldType.CALC, formula: 'HP' });
      root.appendChild(hp);
      root.appendChild(calc);

      fixture.componentRef.setInput('gameDataElement', calc);
      fixture.detectChanges();

      expect(component.calcResult()).toBe('6');
    });

    it('returns a question mark for a formula it cannot read', () => {
      const element = DataElement.create('合計', '', {
        fieldType: DataElementFieldType.CALC,
        formula: 'UNDEFINED_VAR',
      });
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      expect(component.calcResult()).toBe('?');
    });

    it('shows the advanced settings for an image field as well', () => {
      const element = DataElement.create('参考画像', '', { fieldType: DataElementFieldType.IMAGE });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();

      expect(component.shouldShowFieldOptions()).toBe(true);
    });

    it('puts that switch in the advanced settings', () => {
      const element = DataElement.create('参考画像', '', { fieldType: DataElementFieldType.IMAGE });
      fixture.componentRef.setInput('isEdit', true);
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();
      component.fieldOptionsOpen.set(true);
      fixture.detectChanges();

      const checkbox = fixture.nativeElement.querySelector(
        'input[name="data-image-popup-original"]'
      ) as HTMLInputElement | null;
      expect(checkbox).toBeTruthy();
      expect(checkbox?.checked).toBe(false);

      checkbox?.click();
      fixture.detectChanges();

      expect(element.getAttribute(DataElementAttribute.IMAGE_POPUP_ORIGINAL)).toBe('true');
    });
  });

  describe('keeping track of which addresses are being edited', () => {
    it('marks one that was not marked', () => {
      component.changeChk('elem-1');
      expect(component.isEditUrl('elem-1')).toBe(true);
    });

    it('unmarks one that was', () => {
      component.changeChk('elem-1');
      component.changeChk('elem-1');
      expect(component.isEditUrl('elem-1')).toBe(false);
    });

    it('is false for one that was never marked', () => {
      expect(component.isEditUrl('unknown')).toBe(false);
    });

    it('marks one on focus', () => {
      component.textFocus('elem-2');
      expect(component.isEditUrl('elem-2')).toBe(true);
    });

    it('leaves one already marked alone', () => {
      component.changeChk('elem-3');
      component.textFocus('elem-3');
      expect(component.isEditUrl('elem-3')).toBe(true);
    });

    it('keeps several apart', () => {
      component.changeChk('elem-a');
      component.changeChk('elem-b');
      expect(component.isEditUrl('elem-a')).toBe(true);
      expect(component.isEditUrl('elem-b')).toBe(true);

      component.changeChk('elem-a');
      expect(component.isEditUrl('elem-a')).toBe(false);
      expect(component.isEditUrl('elem-b')).toBe(true);
    });
  });

  describe('the slider over what is left of a resource', () => {
    function resourceField(attributes: Record<string, string> = {}): DataElement {
      const field = DataElement.create('HP', 20, {
        [DataElementAttribute.ROLE]: DataElementRole.FIELD,
        type: DataElementType.NUMBER_RESOURCE,
        ...attributes,
      });
      field.currentValue = 12;
      return field;
    }

    function show(field: DataElement, options: { isEdit?: boolean; isValueLocked?: boolean } = {}): void {
      fixture.componentRef.setInput('isEdit', options.isEdit ?? false);
      fixture.componentRef.setInput('isValueLocked', options.isValueLocked ?? false);
      fixture.componentRef.setInput('gameDataElement', field);
      fixture.detectChanges();
    }

    const slider = () =>
      fixture.nativeElement.querySelector('[data-testid="resource-slider"]') as HTMLInputElement | null;

    function drag(to: number, letGo: boolean): void {
      const input = slider()!;
      input.value = String(to);
      input.dispatchEvent(new Event('input'));
      if (letGo) input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    it('is drawn under the values of a resource set to have one, from 0 up to its maximum', () => {
      show(resourceField({ [DataElementAttribute.RESOURCE_SLIDER]: 'true' }));

      expect(slider()).not.toBeNull();
      expect(slider()!.min).toBe('0');
      expect(slider()!.max).toBe('20');
      expect(slider()!.value).toBe('12');
    });

    it('is not drawn for a resource not set to have one', () => {
      show(resourceField());

      expect(slider()).toBeNull();
    });

    it('runs down to the lowest point the resource is set to fall to', () => {
      show(resourceField({ [DataElementAttribute.RESOURCE_SLIDER]: 'true', [DataElementAttribute.MIN_BASE]: '-5' }));

      expect(slider()!.min).toBe('-5');
    });

    it('shows where it is being dragged in the box beside it and writes nothing yet', () => {
      vi.useFakeTimers();
      try {
        const field = resourceField({ [DataElementAttribute.RESOURCE_SLIDER]: 'true' });
        show(field);

        drag(5, false);
        vi.advanceTimersByTime(200);

        expect(component.currentValue).toBe(5);
        expect(Number(field.currentValue)).toBe(12);
      } finally {
        vi.useRealTimers();
      }
    });

    it('writes where it is let go as what is left, and leaves the maximum alone', () => {
      vi.useFakeTimers();
      try {
        const field = resourceField({ [DataElementAttribute.RESOURCE_SLIDER]: 'true' });
        show(field);

        drag(5, true);
        vi.advanceTimersByTime(200);

        expect(Number(field.currentValue)).toBe(5);
        expect(Number(field.value)).toBe(20);
      } finally {
        vi.useRealTimers();
      }
    });

    it('cannot be moved while the values are locked', () => {
      show(resourceField({ [DataElementAttribute.RESOURCE_SLIDER]: 'true' }), { isValueLocked: true });

      expect(slider()!.disabled).toBe(true);
    });

    it('is turned on and off among the field options', () => {
      const field = resourceField();
      show(field, { isEdit: true });
      component.toggleFieldOptions();
      fixture.detectChanges();
      const option = fixture.nativeElement.querySelector('input[name="data-resource-slider"]') as HTMLInputElement;

      option.click();
      expect(field.getAttribute(DataElementAttribute.RESOURCE_SLIDER)).toBe('true');

      option.click();
      expect(field.getAttribute(DataElementAttribute.RESOURCE_SLIDER)).toBe('');
    });
  });
});

describe('GameDataElementComponent on a sheet', () => {
  let component: GameDataElementComponent;
  let fixture: ComponentFixture<GameDataElementComponent>;

  function show(element: DataElement, options: { inSheet?: boolean; isEdit?: boolean } = {}): HTMLElement {
    TestBed.configureTestingModule({
      imports: [GameDataElementComponent],
      providers: [
        ...TEST_PROVIDERS,
        ...(options.inSheet === false ? [] : [{ provide: IN_DATA_ELEMENT_SHEET, useValue: true }]),
      ],
    });
    fixture = TestBed.createComponent(GameDataElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('isEdit', options.isEdit ?? false);
    fixture.componentRef.setInput('gameDataElement', element);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function hp(current = 12): DataElement {
    const field = DataElement.create('HP', 20, {
      [DataElementAttribute.ROLE]: DataElementRole.FIELD,
      [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.RESOURCE,
      type: DataElementType.NUMBER_RESOURCE,
    });
    field.currentValue = current;
    return field;
  }

  const press = (host: HTMLElement, testId: string) =>
    (host.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();

  it('puts ± beside a resource read on a sheet', () => {
    const host = show(hp());

    expect(host.querySelector('[data-testid="step-down"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="step-up"]')).not.toBeNull();
  });

  it('puts none beside a row outside a sheet, or one being edited', () => {
    expect(show(hp(), { inSheet: false }).querySelector('[data-testid="step-down"]')).toBeNull();
    TestBed.resetTestingModule();
    expect(show(hp(), { isEdit: true }).querySelector('[data-testid="step-down"]')).toBeNull();
  });

  it('writes a run of presses as one change, once the presses stop', () => {
    vi.useFakeTimers();
    try {
      const field = hp(12);
      const host = show(field);
      const writes = vi.fn();
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'currentValue');
      Object.defineProperty(field, 'currentValue', {
        configurable: true,
        get: () => descriptor!.get!.call(field),
        set: (value) => {
          writes(value);
          descriptor!.set!.call(field, value);
        },
      });

      press(host, 'step-down');
      vi.advanceTimersByTime(200);
      press(host, 'step-down');
      vi.advanceTimersByTime(200);
      press(host, 'step-down');
      expect(component.currentValue).toBe(9);
      expect(writes).not.toHaveBeenCalled();

      vi.advanceTimersByTime(STEP_COMMIT_MS);

      expect(writes).toHaveBeenCalledTimes(1);
      expect(Number(descriptor!.get!.call(field))).toBe(9);
    } finally {
      vi.useRealTimers();
    }
  });

  it('greys out the + of a resource at its maximum', () => {
    const host = show(hp(20));
    fixture.detectChanges();

    expect((host.querySelector('[data-testid="step-up"]') as HTMLButtonElement).disabled).toBe(true);
    expect((host.querySelector('[data-testid="step-down"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('steps a number within its bounds', () => {
    vi.useFakeTimers();
    try {
      const field = DataElement.create('筋力', 5, {
        [DataElementAttribute.ROLE]: DataElementRole.FIELD,
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
        min: '0',
        max: '6',
      });
      const host = show(field);

      press(host, 'step-up');
      press(host, 'step-up');
      vi.advanceTimersByTime(STEP_COMMIT_MS);

      expect(Number(field.value)).toBe(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks a phone for the number pad where the value never goes below zero', () => {
    const field = DataElement.create('筋力', 5, {
      [DataElementAttribute.ROLE]: DataElementRole.FIELD,
      [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
      min: '0',
    });

    expect(show(field).querySelector('input[name="data-value"]')?.getAttribute('inputmode')).toBe('decimal');
  });
  it('puts an add at the end of a group being edited on a sheet, and none outside a sheet', () => {
    const group = DataElement.create('基本', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
    group.appendChild(DataElement.create('HP', 10, { [DataElementAttribute.ROLE]: DataElementRole.FIELD }));

    expect(show(group, { isEdit: true }).querySelector('[data-testid="group-add-field"]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(show(group, { isEdit: true, inSheet: false }).querySelector('[data-testid="group-add-field"]')).toBeNull();
  });

  it('opens the editor from the name or the "⋯" of a row being edited on a sheet', () => {
    const host = show(hp(), { isEdit: true });

    expect(host.querySelector('[data-testid="row-name-button"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="row-more"]')).not.toBeNull();
  });
});
