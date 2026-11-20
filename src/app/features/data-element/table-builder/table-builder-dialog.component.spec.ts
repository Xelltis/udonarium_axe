import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import type { TableShape } from '@axe/domain/data/table-shape';
import {
  TableBuilderDialogComponent,
  type TableBuilderOption,
} from '@axe/features/data-element/table-builder/table-builder-dialog.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const SHAPE: TableShape = {
  columns: [
    { name: '技巧', label: '器用', group: '肉体', kind: 'check', choices: '', from: '技巧' },
    { name: '備考', label: '', group: '', kind: 'text', choices: '', from: '備考' },
  ],
  rows: [
    { name: '2', from: 'row-2' },
    { name: '3', from: 'row-3' },
  ],
  gaps: ['間'],
};

describe('TableBuilderDialogComponent', () => {
  let fixture: ComponentFixture<TableBuilderDialogComponent>;
  let host: HTMLElement;
  let answered: unknown[];

  async function open(option: TableBuilderOption): Promise<void> {
    const modalService = TestBed.inject(ModalService);
    (modalService as unknown as Record<string, unknown>).modalContext = { option };
    answered = [];
    vi.spyOn(modalService, 'resolve').mockImplementation((value) => void answered.push(value));
    fixture = TestBed.createComponent(TableBuilderDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    host = fixture.nativeElement as HTMLElement;
  }

  const all = (testId: string) => [...host.querySelectorAll(`[data-testid="${testId}"]`)] as HTMLElement[];

  async function press(element: HTMLElement): Promise<void> {
    element.click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function type(field: HTMLInputElement, value: string): Promise<void> {
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function build(): Promise<void> {
    host.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TableBuilderDialogComponent], providers: [...TEST_PROVIDERS] });
  });

  afterEach(() => vi.restoreAllMocks());

  it('lays out the table as it stands, and answers it unchanged where nothing was changed', async () => {
    await open({ title: '表を組む', shape: SHAPE });

    expect(all('table-builder-column')).toHaveLength(2);
    expect(all('table-builder-row')).toHaveLength(2);
    await build();

    expect(answered).toEqual([SHAPE]);
  });

  it('adds, renames, moves and takes away columns and rows, and answers the table as built', async () => {
    await open({ title: '表を組む', shape: SHAPE });

    await press(all('table-builder-add-column')[0]);
    await press(all('table-builder-add-row')[0]);
    await type(all('table-builder-row')[2].querySelector('input')!, '十二');
    await press(all('table-builder-remove-column')[1]);
    await press(all('table-builder-remove-row')[0]);
    await build();

    expect(answered).toEqual([
      {
        columns: [SHAPE.columns[0], { name: '列3', label: '', group: '', kind: 'check', choices: '', from: null }],
        rows: [SHAPE.rows[1], { name: '十二', from: null }],
        gaps: ['間'],
      },
    ]);
  });

  it('builds nothing while a column takes the name of another or of a gap column, and says why', async () => {
    await open({ title: '表を組む', shape: SHAPE });

    await type(all('table-builder-column')[1].querySelector('input')!, '間');

    expect((all('table-builder-apply')[0] as HTMLButtonElement).disabled).toBe(true);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await build();
    expect(answered).toEqual([]);
  });

  it('says how many values the rows and columns taken away would take with them', async () => {
    await open({ title: '表を組む', shape: SHAPE, cellsLostBy: (shape) => 4 - shape.rows.length * 2 });

    expect(all('table-builder-lost')).toEqual([]);
    await press(all('table-builder-remove-row')[0]);

    expect(all('table-builder-lost')[0].textContent).toContain('2');
  });

  it('answers nothing built where it is let go', async () => {
    await open({ title: '表を組む', shape: SHAPE });

    await press([...host.querySelectorAll('button')].find((button) => button.textContent?.includes('キャンセル'))!);

    expect(answered).toEqual([null]);
  });
});
