import { TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { DataElement, DataElementAttribute, DataElementRole } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { DataElementEditService } from '@axe/features/data-element/game-data-element/data-element-edit.service';
import {
  TableBuilderDialogComponent,
  type TableBuilderOption,
} from '@axe/features/data-element/table-builder/table-builder-dialog.component';
import { TableBuilderLauncher } from '@axe/features/data-element/table-builder/table-builder-launcher.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableBuilderLauncher', () => {
  const originalCursor = PeerCursor.myCursor;
  let launcher: TableBuilderLauncher;
  let opened: { load: () => Promise<unknown>; option: TableBuilderOption }[];
  let answer: (option: TableBuilderOption) => unknown;

  beforeEach(() => {
    PeerCursor.myCursor = { role: PeerRole.Player, userId: 'me', identifier: 'seat' } as PeerCursor;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    opened = [];
    answer = (option) => option.shape;
    vi.spyOn(TestBed.inject(ModalService), 'openLazy').mockImplementation(async (load, option) => {
      opened.push({ load, option: option as TableBuilderOption });
      return answer(option as TableBuilderOption) as never;
    });
    launcher = TestBed.inject(TableBuilderLauncher);
  });

  afterEach(() => {
    PeerCursor.myCursor = originalCursor;
    vi.restoreAllMocks();
  });

  function section(): DataElement {
    return DataElement.create('能力', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
  }

  it('opens the builder, fetched when first asked for, on a new table of two columns of checks over three rows', async () => {
    const container = section();

    const table = await launcher.addTable(container);

    expect(await opened[0].load()).toBe(TableBuilderDialogComponent);
    expect(table?.parent).toBe(container);
    expect(table?.children.map((row) => row.name)).toEqual(['1', '2', '3']);
    expect(table?.children[0].children.map((cell) => [cell.name, cell.fieldType])).toEqual([
      ['列1', 'check'],
      ['列2', 'check'],
    ]);
  });

  it('opens the builder on a table as it stands, and builds what it answers through the one way a table is built', async () => {
    const container = section();
    const table = (await launcher.addTable(container))!;
    const build = vi.spyOn(TestBed.inject(DataElementEditService), 'buildTable');
    answer = (option) => ({ ...option.shape, rows: option.shape.rows.slice(0, 1) });

    await expect(launcher.buildTable(table)).resolves.toBe(true);

    expect(opened[1].option.shape.rows.map((row) => row.name)).toEqual(['1', '2', '3']);
    expect(build).toHaveBeenCalledWith(table, {
      ...opened[1].option.shape,
      rows: opened[1].option.shape.rows.slice(0, 1),
    });
    expect(table.children.map((row) => row.name)).toEqual(['1']);
  });

  it('builds nothing, and says why, where another seat changed the table while the builder was open', async () => {
    const container = section();
    const table = (await launcher.addTable(container))!;
    const said = vi.spyOn(TestBed.inject(SnackbarService), 'show');
    answer = (option) => {
      table.children[0].destroy();
      return option.shape;
    };

    await expect(launcher.buildTable(table)).resolves.toBe(false);

    expect(said).toHaveBeenCalledWith(expect.stringContaining('ほかの人がこの表の行か列を変えました'));
    expect(table.children.map((row) => row.name)).toEqual(['2', '3']);
  });

  it('builds nothing where the builder is let go', async () => {
    const container = section();
    answer = () => null;

    await expect(launcher.addTable(container)).resolves.toBeNull();
    expect(container.children).toEqual([]);
  });
});
