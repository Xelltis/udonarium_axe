import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { DataElement, DataElementAttribute, DataElementFieldType } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { DataElementEditService } from '@axe/features/data-element/game-data-element/data-element-edit.service';
import { GameDataElementTableViewComponent } from '@axe/features/data-element/game-data-element/game-data-element-table-view.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function makeTableElement(): DataElement {
  // table column header row + 1 body row, 2 columns + 1 gap column
  const table = DataElement.create('SkillTable', '');
  const header = DataElement.create('header', '', { tableControl: 'true' });
  const skill = DataElement.create('skill', '', { columnLabel: '技能' });
  const gap = DataElement.create('gap', '', { columnLabel: '間', cellKind: 'gap' });
  const stat = DataElement.create('stat', '', { columnLabel: '能力値' });
  header.appendChild(skill);
  header.appendChild(gap);
  header.appendChild(stat);
  table.appendChild(header);

  for (const name of ['row1', 'row2']) {
    const row = DataElement.create(name, '');
    const cellSkill = DataElement.create('skill', '0', { fieldType: DataElementFieldType.CHECK });
    const cellGap = DataElement.create('gap', '0', { fieldType: DataElementFieldType.CHECK, cellKind: 'gap' });
    const cellStat = DataElement.create('stat', '5');
    row.appendChild(cellSkill);
    row.appendChild(cellGap);
    row.appendChild(cellStat);
    table.appendChild(row);
  }

  return table;
}

describe('GameDataElementTableViewComponent', () => {
  let fixture: ComponentFixture<GameDataElementTableViewComponent>;
  let component: GameDataElementTableViewComponent;
  let componentRef: ComponentRef<GameDataElementTableViewComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameDataElementTableViewComponent],
      providers: [...TEST_PROVIDERS],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(GameDataElementTableViewComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    componentRef.setInput('element', makeTableElement());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ticking a whole column from its heading', () => {
    function columnNamed(name: string) {
      return component.tableColumns().find((column) => column.name === name)!;
    }

    function cellsIn(name: string) {
      return component.tableBodyRows().map((row) => component.getTableCell(row, name)!);
    }

    it('offers a box on a column of boxes, and on nothing else', () => {
      fixture.detectChanges();

      expect(component.hasTableColumnChecks(columnNamed('skill'))).toBe(true);
      expect(component.hasTableColumnChecks(columnNamed('stat'))).toBe(false);
      expect(component.hasTableColumnChecks(columnNamed('gap'))).toBe(false);
    });

    it('ticks every box under it, and clears them again', () => {
      fixture.detectChanges();
      const column = columnNamed('skill');

      component.setTableColumnChecked(column, { stopPropagation: () => undefined } as Event);

      expect(cellsIn('skill').every((cell) => component.isTableCheckCellChecked(cell))).toBe(true);
      expect(component.isTableColumnAllChecked(column)).toBe(true);

      component.setTableColumnChecked(column, { stopPropagation: () => undefined } as Event);

      expect(cellsIn('skill').some((cell) => component.isTableCheckCellChecked(cell))).toBe(false);
    });

    it('stands half filled while only some of the column is ticked', () => {
      fixture.detectChanges();
      const column = columnNamed('skill');
      component.toggleTableCheckCell(cellsIn('skill')[0]);

      expect(component.isTableColumnPartlyChecked(column)).toBe(true);
      expect(component.isTableColumnAllChecked(column)).toBe(false);

      component.setTableColumnChecked(column, { stopPropagation: () => undefined } as Event);

      expect(component.isTableColumnPartlyChecked(column)).toBe(false);
      expect(component.isTableColumnAllChecked(column)).toBe(true);
    });

    it('leaves the boxes alone where the values are locked', () => {
      componentRef.setInput('isValueLocked', true);
      fixture.detectChanges();

      component.setTableColumnChecked(columnNamed('skill'), { stopPropagation: () => undefined } as Event);

      expect(cellsIn('skill').some((cell) => component.isTableCheckCellChecked(cell))).toBe(false);
    });
  });

  it('scrolls the table sideways from the wheel', () => {
    const scrollElement = document.createElement('div');
    Object.defineProperty(scrollElement, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(scrollElement, 'scrollWidth', { configurable: true, value: 600 });
    scrollElement.scrollLeft = 0;
    const event = {
      currentTarget: scrollElement,
      deltaX: 0,
      deltaY: 120,
      preventDefault: vi.fn(),
    } as unknown as WheelEvent;

    component.onTableWheel(event);

    expect(scrollElement.scrollLeft).toBe(120);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('leaves the wheel alone when the table fits', () => {
    const scrollElement = document.createElement('div');
    Object.defineProperty(scrollElement, 'clientWidth', { configurable: true, value: 600 });
    Object.defineProperty(scrollElement, 'scrollWidth', { configurable: true, value: 600 });
    const event = {
      currentTarget: scrollElement,
      deltaX: 0,
      deltaY: 120,
      preventDefault: vi.fn(),
    } as unknown as WheelEvent;

    component.onTableWheel(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('counts as judging only while it is both enabled and active', () => {
    componentRef.setInput('isJudgeModeEnabled', false);
    expect(component.isJudgeMode()).toBe(false);

    component.toggleJudgeActive();
    componentRef.setInput('isJudgeModeEnabled', true);
    expect(component.isJudgeMode()).toBe(true);

    component.toggleJudgeActive();
    expect(component.isJudgeMode()).toBe(false);
  });

  it('ticks and unticks a cell', () => {
    const cell = DataElement.create('c', '0', { fieldType: DataElementFieldType.CHECK });
    component.toggleTableCheckCell(cell);
    expect(cell.value).toBe(1);
    component.toggleTableCheckCell(cell);
    expect(cell.value).toBe(0);
  });

  it('leaves a locked cell alone', () => {
    componentRef.setInput('isValueLocked', true);
    const cell = DataElement.create('c', '0', { fieldType: DataElementFieldType.CHECK });
    component.toggleTableCheckCell(cell);
    expect(cell.value).toBe('0');
  });

  it('clears the candidates on close', () => {
    component.judgeCandidatesState.set({ clickedCellLabel: 'x', candidates: [] });
    component.closeJudgeCandidates();
    expect(component.judgeCandidatesState()).toBeNull();
  });

  it('puts a candidate into the chat box and clears them', () => {
    const uiSignal = TestBed.inject(UiSignalService);
    const requestSpy = vi.spyOn(uiSignal, 'requestChatInputText').mockImplementation(() => {});
    component.judgeCandidatesState.set({ clickedCellLabel: 'skill', candidates: [] });
    const fakeCandidate = { cell: null, rowName: '', colName: '', colLabel: '', cellLabel: '', distance: 3 } as never;

    component.sendCandidateToChat(fakeCandidate);

    // baseDifficulty defaults to 5 when attribute missing, + distance(3) = 8
    expect(requestSpy).toHaveBeenCalledWith('2d6>=8');
    expect(component.judgeCandidatesState()).toBeNull();
  });

  it('says what the roll is for, behind a space the dice bot stops at', () => {
    const uiSignal = TestBed.inject(UiSignalService);
    const requestSpy = vi.spyOn(uiSignal, 'requestChatInputText').mockImplementation(() => {});
    component.judgeCandidatesState.set({ clickedCellLabel: '静音移動', candidates: [] });
    const candidate = { cell: null, rowName: '2', colName: '技巧', colLabel: '技巧', cellLabel: '解錠', distance: 2 };

    component.sendCandidateToChat(candidate as never);

    const [text] = requestSpy.mock.calls[0];
    expect(text.split(' ')[0]).toBe('2d6>=7');
    expect(text).toContain('静音移動');
    expect(text).toContain('解錠');
  });

  it('names the column where the cell carries no label of its own', () => {
    const uiSignal = TestBed.inject(UiSignalService);
    const requestSpy = vi.spyOn(uiSignal, 'requestChatInputText').mockImplementation(() => {});
    component.judgeCandidatesState.set({ clickedCellLabel: '静音移動', candidates: [] });
    const candidate = { cell: null, rowName: '2', colName: '身体', colLabel: '身体', cellLabel: '', distance: 1 };

    component.sendCandidateToChat(candidate as never);

    expect(requestSpy.mock.calls[0][0]).toContain('身体');
  });

  it('sends the roll alone when there is nothing to name', () => {
    const uiSignal = TestBed.inject(UiSignalService);
    const requestSpy = vi.spyOn(uiSignal, 'requestChatInputText').mockImplementation(() => {});
    component.judgeCandidatesState.set({ clickedCellLabel: '', candidates: [] });
    const candidate = { cell: null, rowName: '', colName: '', colLabel: '', cellLabel: '', distance: 1 };

    component.sendCandidateToChat(candidate as never);

    expect(requestSpy).toHaveBeenCalledWith('2d6>=6');
  });

  it('reads the base difficulty off the attribute', () => {
    const uiSignal = TestBed.inject(UiSignalService);
    const requestSpy = vi.spyOn(uiSignal, 'requestChatInputText').mockImplementation(() => {});
    const el = component.element();
    el.setAttribute(DataElementAttribute.BASE_DIFFICULTY, '10');
    const fakeCandidate = { cell: null, rowName: '', colName: '', colLabel: '', cellLabel: '', distance: 2 } as never;

    component.sendCandidateToChat(fakeCandidate);

    expect(requestSpy).toHaveBeenCalledWith('2d6>=12');
  });
  describe('editing the rows and columns on the table', () => {
    const originalCursor = PeerCursor.myCursor;

    beforeEach(() => {
      PeerCursor.myCursor = { role: PeerRole.Player, userId: 'me', identifier: 'seat' } as PeerCursor;
      componentRef.setInput('editable', true);
      fixture.detectChanges();
    });

    afterEach(() => {
      PeerCursor.myCursor = originalCursor;
      vi.restoreAllMocks();
    });

    function find(testId: string): HTMLElement[] {
      return [...fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`)] as HTMLElement[];
    }

    async function press(element: HTMLElement): Promise<void> {
      element.click();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    async function type(testId: string, value: string): Promise<void> {
      const [field] = find(testId) as (HTMLInputElement | HTMLSelectElement)[];
      field.value = value;
      field.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      fixture.detectChanges();
    }

    const bodyCells = () =>
      component.tableBodyRows().map((row) => row.children.map((cell) => (cell as DataElement).name));

    it('shows no way to edit them on a table that is only read', () => {
      componentRef.setInput('editable', false);
      fixture.detectChanges();

      expect(find('table-edit-columns')).toEqual([]);
      expect(find('table-add-row')).toEqual([]);
      expect(find('table-edit-row-button')).toEqual([]);
    });

    it('builds every change through the same one place as the table builder', async () => {
      const build = vi.spyOn(TestBed.inject(DataElementEditService), 'buildTable');

      await press(find('table-add-column')[0]);
      await press(find('table-add-row')[0]);

      expect(build).toHaveBeenCalledTimes(2);
      expect(build.mock.calls.every(([element]) => element === component.element())).toBe(true);
    });

    it('adds a column with a cell in every row at the right end, and puts it on the bar to be named', async () => {
      await press(find('table-add-column')[0]);
      const added = (find('table-edit-column-name')[0] as HTMLInputElement).value;

      expect(bodyCells()).toEqual([
        ['skill', 'gap', 'stat', added],
        ['skill', 'gap', 'stat', added],
      ]);

      await type('table-edit-column-name', '隠密');

      expect(bodyCells()).toEqual([
        ['skill', 'gap', 'stat', '隠密'],
        ['skill', 'gap', 'stat', '隠密'],
      ]);
      expect((find('table-edit-column-name')[0] as HTMLInputElement).value).toBe('隠密');
    });

    it('refuses a name another column has, says why, and puts the name back on the bar', async () => {
      await press(find('table-edit-column-button')[0]);

      await type('table-edit-column-name', 'stat');

      expect(bodyCells()[0]).toEqual(['skill', 'gap', 'stat']);
      expect((find('table-edit-column-name')[0] as HTMLInputElement).value).toBe('skill');
      expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('changes what a column holds from the bar, carrying each value over', async () => {
      await press(find('table-edit-column-button')[1]);

      await type('table-edit-column-kind', 'number');

      const cells = component.tableBodyRows().map((row) => component.getTableCell(row, 'stat')!);
      expect(cells.map((cell) => [cell.fieldType, cell.value])).toEqual([
        [DataElementFieldType.NUMBER, 5],
        [DataElementFieldType.NUMBER, 5],
      ]);
    });

    it('says the table changed, and builds nothing, where another seat changed it while the question stood open', async () => {
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockImplementation(async () => {
        for (const row of component.element().children)
          component.getTableCell(row as DataElement, 'skill')!.name = 'renamed';
        return true;
      });
      await press(find('table-edit-column-button')[1]);

      await press(find('table-edit-remove-column')[0]);

      expect(bodyCells()[0]).toEqual(['renamed', 'gap', 'stat']);
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
        'ほかの人がこの表の行か列を変えました'
      );
    });

    it('asks before taking away a column whose cells hold something, and keeps it where the answer is no', async () => {
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
      await press(find('table-edit-column-button')[1]);

      await press(find('table-edit-remove-column')[0]);
      expect(ask).toHaveBeenCalledTimes(1);
      expect(bodyCells()[0]).toEqual(['skill', 'gap', 'stat']);

      ask.mockResolvedValue(true);
      await press(find('table-edit-remove-column')[0]);
      expect(bodyCells()).toEqual([
        ['skill', 'gap'],
        ['skill', 'gap'],
      ]);
      expect(find('table-edit-column')).toEqual([]);
    });

    it('adds, names, moves and takes away a row', async () => {
      await press(find('table-add-row')[0]);
      expect(component.tableBodyRows().map((row) => row.name)).toEqual(['row1', 'row2', '3']);
      expect(bodyCells()[2]).toEqual(['skill', 'stat']);

      await type('table-edit-row-name', '最後');
      await press(fixture.nativeElement.querySelector('[data-testid="table-edit-row"] button'));
      expect(component.tableBodyRows().map((row) => row.name)).toEqual(['row1', '最後', 'row2']);

      await press(find('table-edit-remove-row')[0]);
      expect(component.tableBodyRows().map((row) => row.name)).toEqual(['row1', 'row2']);
    });
  });
});
